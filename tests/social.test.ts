import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatSocialCheckResult, runSocialCheck } from "../lib/social/check";
import { generateSocialCandidates } from "../lib/social/generate";
import { candidateToLedgerEntry, filterFreshCandidates } from "../lib/social/ledger";
import { buildPublishPosts, publishSocialCandidate } from "../lib/social/publish";
import { containsUrl } from "../lib/social/policy";
import { renderCandidateVisualSvg, visualAssetFilename, writeCandidateVisualAssets } from "../lib/social/visual";
import { buildOAuth1Header } from "../lib/social/x";
import type { Holding, IndexFund, IndexSnapshot, Thesis } from "../lib/types";

function thesis(overrides: Partial<Thesis>): Thesis {
  return {
    id: "take-1",
    episodeId: "E300",
    episodeNumber: 300,
    episodeDate: "2026-07-03T00:00:00.000Z",
    company: "Palantir",
    ticker: "PLTR",
    isPublic: true,
    host: "Sacks",
    stance: "bull",
    conviction: "medium",
    summary: "Bullish on the company.",
    quote: "short excerpt",
    quoteStartMs: null,
    topics: [],
    attributionConfidence: "high",
    callType: "explicit_long",
    excludeReason: null,
    ...overrides,
  };
}

function holding(slug: string, company: string, ticker: string, theses: Thesis[]): Holding {
  return {
    slug,
    company,
    ticker,
    isPublic: true,
    theses,
    synthesis: "",
    description: null,
    domain: null,
    netStance: "bull",
    firstMentioned: "2026-01-01T00:00:00.000Z",
    lastMentioned: "2026-07-03T00:00:00.000Z",
    mentionCount: theses.length,
    market: {
      ticker,
      asOf: "2026-07-06",
      anchorDate: "2026-07-03",
      basePrice: 100,
      latestPrice: 120,
      returns: { "1m": 0.1, "3m": 0.2, "6m": 0.3, "1y": 0.4, since: 0.2 },
      history: [
        ["2026-07-03", 100],
        ["2026-07-06", 120],
      ],
      source: "yahoo",
    },
  };
}

function fund(): IndexFund {
  return {
    asOf: "2026-07-06",
    inceptionDate: "2026-01-01",
    benchmarkSymbol: "SPY",
    contributionPerCall: 1000,
    totalInvested: 2000,
    portfolioValue: 2600,
    benchmarkValue: 2200,
    portfolioReturn: 0.3,
    benchmarkReturn: 0.1,
    outperformance: 0.2,
    constituents: [
      {
        slug: "palantir",
        company: "Palantir",
        ticker: "PLTR",
        direction: "long",
        entryDate: "2026-01-01",
        entryPrice: 100,
        latestPrice: 150,
        sinceReturn: 0.5,
        benchmarkReturn: 0.1,
        alpha: 0.4,
        hosts: ["Sacks"],
      },
      {
        slug: "amazon",
        company: "Amazon",
        ticker: "AMZN",
        direction: "long",
        entryDate: "2026-02-01",
        entryPrice: 100,
        latestPrice: 95,
        sinceReturn: -0.05,
        benchmarkReturn: 0.08,
        alpha: -0.13,
        hosts: ["Jason"],
      },
    ],
    series: [],
    excludedPrivateCount: 0,
    excludedPrivate: [],
    altBenchmark: { symbol: "QQQ", ret: 0.2 },
  };
}

function snapshot(): IndexSnapshot {
  const palantir = holding("palantir", "Palantir", "PLTR", [
    thesis({ id: "pltr-sacks", host: "Sacks", company: "Palantir", ticker: "PLTR" }),
  ]);
  const amazon = holding("amazon", "Amazon", "AMZN", [
    thesis({ id: "amzn-jason", host: "Jason", company: "Amazon", ticker: "AMZN", stance: "bull" }),
    thesis({ id: "amzn-sacks", host: "Sacks", company: "Amazon", ticker: "AMZN", stance: "bear", callType: "explicit_short" }),
  ]);
  return {
    generatedAt: "2026-07-07T00:00:00.000Z",
    holdings: [palantir, amazon],
    episodesProcessed: 1,
    indexFund: fund(),
    leaderboard: [
      {
        host: "Sacks",
        positions: 1,
        portfolioReturn: 0.5,
        benchmarkReturn: 0.1,
        alpha: 0.4,
        topCall: { ticker: "PLTR", alpha: 0.4 },
      },
    ],
    episodes: {
      E300: {
        title: "AI and markets",
        link: "https://example.com/e300",
        date: "2026-07-03T00:00:00.000Z",
        number: 300,
        audioUrl: null,
      },
    },
  };
}

test("social generator keeps main posts link-free and link replies deep-link", () => {
  const bundle = generateSocialCandidates(snapshot(), {
    siteUrl: "https://example.test",
    now: new Date("2026-07-07T15:00:00.000Z"),
  });

  assert.ok(bundle.candidates.length >= 5);
  for (const candidate of bundle.candidates) {
    assert.equal(containsUrl(candidate.mainPost), false, candidate.id);
    assert.ok(candidate.linkReply?.includes("https://example.test/"), candidate.id);
  }

  const pulse = bundle.candidates.find((candidate) => candidate.kind === "portfolio_pulse");
  assert.ok(pulse);
  assert.equal(pulse.reviewRequired, false);
  assert.equal(pulse.autoPublishEligible, true);
  assert.equal(pulse.route, "/the-index");
});

test("public social copy avoids internal workflow language", () => {
  const bundle = generateSocialCandidates(snapshot(), {
    siteUrl: "https://example.test",
    now: new Date("2026-07-07T15:00:00.000Z"),
  });

  for (const candidate of bundle.candidates) {
    const publicCopy = [candidate.mainPost, ...candidate.threadPosts, candidate.linkReply ?? ""].join("\n");
    assert.doesNotMatch(publicCopy, /\bdraft\b/i, candidate.id);
  }
});

test("social generator marks episode and receipt drafts for review", () => {
  const bundle = generateSocialCandidates(snapshot(), {
    siteUrl: "https://example.test",
    now: new Date("2026-07-07T15:00:00.000Z"),
  });
  const receipt = bundle.candidates.find((candidate) => candidate.kind === "receipt");
  const episode = bundle.candidates.find((candidate) => candidate.kind === "episode_recap");

  assert.ok(receipt);
  assert.equal(receipt.reviewRequired, true);
  assert.equal(receipt.route, "/holding/palantir");

  assert.ok(episode);
  assert.equal(episode.reviewRequired, true);
  assert.equal(episode.route, "/episode/E300");
});

test("social ledger filters recently used topics", () => {
  const bundle = generateSocialCandidates(snapshot(), {
    siteUrl: "https://example.test",
    now: new Date("2026-07-07T15:00:00.000Z"),
    scheduleIds: ["weekly-portfolio-pulse"],
  });
  const candidate = bundle.candidates[0];
  const ledger = [candidateToLedgerEntry(candidate, "2026-07-06T15:00:00.000Z")];

  const result = filterFreshCandidates(
    [candidate],
    ledger,
    new Date("2026-07-07T15:00:00.000Z"),
    14,
  );

  assert.equal(result.fresh.length, 0);
  assert.equal(result.skipped.length, 1);
});

test("publish plan threads posts and keeps link reply last", () => {
  const bundle = generateSocialCandidates(snapshot(), {
    siteUrl: "https://example.test",
    now: new Date("2026-07-07T15:00:00.000Z"),
    scheduleIds: ["weekly-receipt"],
  });
  const posts = buildPublishPosts(bundle.candidates[0]);

  assert.equal(posts[0].role, "main");
  assert.equal(containsUrl(posts[0].text), false);
  assert.equal(posts.at(-1)?.role, "link_reply");
  assert.equal(containsUrl(posts.at(-1)?.text ?? ""), true);
});

test("non-dry-run publish refuses review-required candidates without override", async () => {
  const bundle = generateSocialCandidates(snapshot(), {
    siteUrl: "https://example.test",
    now: new Date("2026-07-07T15:00:00.000Z"),
    scheduleIds: ["weekly-receipt"],
  });

  await assert.rejects(
    publishSocialCandidate(bundle.candidates[0]),
    /not safe for non-dry-run publish/,
  );
});

test("dry-run publish allows review-required candidates for preview", async () => {
  const bundle = generateSocialCandidates(snapshot(), {
    siteUrl: "https://example.test",
    now: new Date("2026-07-07T15:00:00.000Z"),
    scheduleIds: ["weekly-receipt"],
  });

  const result = await publishSocialCandidate(bundle.candidates[0], { dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.posts.length, 3);
});

test("OAuth 1.0a header builder signs a create-post request", () => {
  const header = buildOAuth1Header({
    method: "POST",
    url: "https://api.x.com/2/tweets",
    nonce: "abc123",
    timestamp: "1770000000",
    credentials: {
      apiKey: "key",
      apiSecret: "secret",
      accessToken: "token",
      accessTokenSecret: "token-secret",
    },
  });

  assert.match(header, /^OAuth /);
  assert.match(header, /oauth_consumer_key="key"/);
  assert.match(header, /oauth_nonce="abc123"/);
  assert.match(header, /oauth_signature="/);
  assert.match(header, /oauth_token="token"/);
});

test("visual generator writes deterministic SVG assets for visual candidates", () => {
  const bundle = generateSocialCandidates(snapshot(), {
    siteUrl: "https://example.test",
    now: new Date("2026-07-07T15:00:00.000Z"),
    scheduleIds: ["weekly-portfolio-pulse"],
  });
  const candidate = bundle.candidates[0];
  assert.ok(candidate.visual);

  const svg = renderCandidateVisualSvg(candidate);
  assert.ok(svg);
  assert.match(svg, /Besties Index Check-In/);
  assert.match(svg, /aria-label=/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "social-visual-"));
  const written = writeCandidateVisualAssets(bundle, dir);
  assert.equal(written.length, 1);
  assert.equal(path.basename(written[0]), visualAssetFilename(candidate));
  assert.equal(fs.existsSync(written[0]), true);
});

test("social readiness check passes without X credentials but warns", () => {
  const previous = {
    X_API_KEY: process.env.X_API_KEY,
    X_API_SECRET: process.env.X_API_SECRET,
    X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
    X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET,
    X_BEARER_TOKEN: process.env.X_BEARER_TOKEN,
  };
  delete process.env.X_API_KEY;
  delete process.env.X_API_SECRET;
  delete process.env.X_ACCESS_TOKEN;
  delete process.env.X_ACCESS_TOKEN_SECRET;
  delete process.env.X_BEARER_TOKEN;
  try {
    const result = runSocialCheck({ siteUrl: "https://example.test" });
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((warning) => warning.includes("X credentials")));
    assert.match(formatSocialCheckResult(result), /social check: ok/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("social readiness check can require X credentials", () => {
  const previous = {
    X_API_KEY: process.env.X_API_KEY,
    X_API_SECRET: process.env.X_API_SECRET,
    X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
    X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET,
    X_BEARER_TOKEN: process.env.X_BEARER_TOKEN,
  };
  delete process.env.X_API_KEY;
  delete process.env.X_API_SECRET;
  delete process.env.X_ACCESS_TOKEN;
  delete process.env.X_ACCESS_TOKEN_SECRET;
  delete process.env.X_BEARER_TOKEN;
  try {
    const result = runSocialCheck({ siteUrl: "https://example.test", requireXCredentials: true });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("X credentials")));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
