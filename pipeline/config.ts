import path from "node:path";
import { config as loadEnv } from "dotenv";

// Load .env from the repo root for local pipeline runs. In CI the values come
// from the environment directly, so a missing .env file is fine.
// override: true so values in .env win over variables the surrounding shell
// may have pre-set to empty (e.g. ANTHROPIC_API_KEY in some agent runtimes).
// In CI there is no .env file, so real environment secrets are left untouched.
loadEnv({ path: path.resolve(process.cwd(), ".env"), quiet: true, override: true });

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const EPISODES_DIR = path.join(DATA_DIR, "episodes");
export const HOLDINGS_FILE = path.join(DATA_DIR, "holdings.json");
export const SAMPLE_HOLDINGS_FILE = path.join(DATA_DIR, "sample", "holdings.json");

/** The All-In RSS feed (resolved once via the iTunes lookup API). */
export const ALLIN_FEED_URL =
  process.env.ALLIN_FEED_URL ??
  "https://rss.libsyn.com/shows/254861/destinations/1928300.xml";

export const ALLIN_ITUNES_ID = "1502871393";

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in ` +
        `(see README "Running the slice").`,
    );
  }
  return v;
}

export const ASSEMBLYAI_API_KEY = () => requireEnv("ASSEMBLYAI_API_KEY");
export const ANTHROPIC_API_KEY = () => requireEnv("ANTHROPIC_API_KEY");

/** Model used for the speaker-naming and thesis-extraction passes. */
export const EXTRACTION_MODEL =
  process.env.EXTRACTION_MODEL ?? "claude-sonnet-4-6";
