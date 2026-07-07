import crypto from "node:crypto";

const CREATE_POST_URL = "https://api.x.com/2/tweets";
const VERIFY_USER_URL = "https://api.x.com/2/users/me";

export interface XPostInput {
  text: string;
  replyToId?: string;
}

export interface XPostResult {
  id: string;
  text: string;
  url: string;
}

export interface XCredentialVerification {
  id: string;
  name: string;
  username: string;
}

export interface OAuth1Credentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export interface XCredentialVerificationOptions {
  expectedUsername?: string | null;
  requireExpectedUsername?: boolean;
}

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizeUsername(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@/, "").toLowerCase();
  return normalized || null;
}

export function buildOAuth1Header(opts: {
  method: string;
  url: string;
  credentials: OAuth1Credentials;
  nonce?: string;
  timestamp?: string;
}): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: opts.credentials.apiKey,
    oauth_nonce: opts.nonce ?? crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: opts.timestamp ?? Math.floor(Date.now() / 1000).toString(),
    oauth_token: opts.credentials.accessToken,
    oauth_version: "1.0",
  };
  const normalized = Object.entries(oauth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
  const base = [
    opts.method.toUpperCase(),
    percentEncode(opts.url),
    percentEncode(normalized),
  ].join("&");
  const signingKey = `${percentEncode(opts.credentials.apiSecret)}&${percentEncode(opts.credentials.accessTokenSecret)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");

  return `OAuth ${Object.entries(oauth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`;
}

function oauth1CredentialsFromEnv(): OAuth1Credentials | null {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) return null;
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

function bearerTokenFromEnv(): string | null {
  return process.env.X_BEARER_TOKEN ?? null;
}

export function expectedXUsernameFromEnv(): string | null {
  return normalizeUsername(process.env.X_EXPECTED_USERNAME);
}

function userContextAuthHeader(method: string, url: string): string {
  const oauth1 = oauth1CredentialsFromEnv();
  if (oauth1) {
    return buildOAuth1Header({
      method,
      url,
      credentials: oauth1,
    });
  }
  const bearer = bearerTokenFromEnv();
  if (bearer) return `Bearer ${bearer}`;
  throw new Error(
    "Missing X credentials. Set OAuth 1.0a X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, and X_ACCESS_TOKEN_SECRET, or set X_BEARER_TOKEN.",
  );
}

export async function createXPost(input: XPostInput): Promise<XPostResult> {
  const body: Record<string, unknown> = { text: input.text };
  if (input.replyToId) body.reply = { in_reply_to_tweet_id: input.replyToId };

  const response = await fetch(CREATE_POST_URL, {
    method: "POST",
    headers: {
      Authorization: userContextAuthHeader("POST", CREATE_POST_URL),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as
    | { data?: { id?: string; text?: string }; title?: string; detail?: string; errors?: unknown }
    | null;
  if (!response.ok || !payload?.data?.id) {
    throw new Error(`X create post failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  const id = payload.data.id;
  return {
    id,
    text: payload.data.text ?? input.text,
    url: `https://x.com/i/web/status/${id}`,
  };
}

export async function verifyXCredentials(
  options: XCredentialVerificationOptions = {},
): Promise<XCredentialVerification> {
  const expectedUsername = normalizeUsername(options.expectedUsername) ?? expectedXUsernameFromEnv();
  if (options.requireExpectedUsername && !expectedUsername) {
    throw new Error("Missing X_EXPECTED_USERNAME; set it to the X handle that is allowed to publish, without @.");
  }

  const response = await fetch(VERIFY_USER_URL, {
    method: "GET",
    headers: {
      Authorization: userContextAuthHeader("GET", VERIFY_USER_URL),
    },
  });
  const payload = await response.json().catch(() => null) as
    | { data?: { id?: string; name?: string; username?: string }; title?: string; detail?: string; errors?: unknown }
    | null;
  if (!response.ok || !payload?.data?.id || !payload.data.username) {
    throw new Error(`X credential verification failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  const actualUsername = normalizeUsername(payload.data.username);
  if (expectedUsername && actualUsername !== expectedUsername) {
    throw new Error(`X credential username mismatch: expected @${expectedUsername}, got @${payload.data.username}.`);
  }
  return {
    id: payload.data.id,
    name: payload.data.name ?? payload.data.username,
    username: payload.data.username,
  };
}
