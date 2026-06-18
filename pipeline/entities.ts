// Canonical entity resolution: collapses the name variants the extractor
// produces across episodes into one company, and cleans up bad tickers.

import { ASSETS, CRYPTO } from "../lib/assets";

interface Canon {
  company: string;
  ticker: string | null;
  isPublic: boolean;
  /** Normalized alias strings (see norm()). */
  aliases: string[];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop parentheticals, e.g. "X (Twitter)"
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const EXTRA_ASSET_ALIASES: Record<string, string[]> = {
  Oil: ["oil", "crude oil", "hydrocarbons", "hydrocarbons oil"],
};

const ASSET_CANON: Canon[] = ASSETS.map((a) => ({
  company: a.name,
  ticker: a.proxy,
  isPublic: true,
  aliases: [a.name.toLowerCase(), ...(EXTRA_ASSET_ALIASES[a.name] ?? [])],
}));

const CRYPTO_CANON: Canon[] = CRYPTO.map((a) => ({
  company: a.name,
  ticker: a.proxy,
  isPublic: true,
  aliases: a.keywords,
}));

// Only clearly-correct consolidations. We deliberately keep distinct bets
// separate (e.g. Waymo stays its own entity rather than folding into Google).
const CANON: Canon[] = [
  { company: "Amazon", ticker: "AMZN", isPublic: true, aliases: ["amazon", "amazon web services", "aws"] },
  { company: "Google", ticker: "GOOGL", isPublic: true, aliases: ["google", "alphabet", "google cloud"] },
  { company: "Meta", ticker: "META", isPublic: true, aliases: ["meta", "meta platforms", "facebook", "instagram"] },
  { company: "Microsoft", ticker: "MSFT", isPublic: true, aliases: ["microsoft", "microsoft azure", "azure", "github"] },
  { company: "Salesforce", ticker: "CRM", isPublic: true, aliases: ["salesforce", "slack", "tableau", "mulesoft"] },
  // Feb 2026: SpaceX consolidated xAI in a $1.25T all-stock merger; Starlink is
  // a SpaceX division and Grok is xAI's model, so the whole rocket / satellite /
  // AI / social (X) cluster is one company — public since the Jun 12 2026 IPO
  // (NASDAQ: SPCX). Every call on any piece of it is now a call on SPCX.
  {
    company: "SpaceX",
    ticker: "SPCX",
    isPublic: true,
    aliases: [
      "spacex", "space exploration technologies", "starlink", "grok",
      "xai", "x", "x corp", "twitter", "elon web services",
      "spacex xai", "xai spacex", "spacex starlink", "starlink spacex", "xai grok",
      "xai x", "x xai", "x twitter", "twitter x",
    ],
  },
  // OpenAI and its ChatGPT product are one entity (private).
  { company: "OpenAI", ticker: null, isPublic: false, aliases: ["openai", "open ai", "chatgpt", "openai chatgpt"] },
  // Macro assets are priced via liquid ETF proxies and recognized as proxy
  // assets downstream, so they stay out of the single-company index.
  ...ASSET_CANON,
  ...CRYPTO_CANON,
];

const ALIAS_INDEX = new Map<string, Canon>();
for (const c of CANON) for (const a of c.aliases) ALIAS_INDEX.set(a, c);

// "Tickers" that are crypto tokens / non-equities — never tradable in the index.
const NON_EQUITY = new Set(["TAO", "BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "USDC", "USDT", "BNB"]);

const YAHOO_SYMBOL_OVERRIDES = new Map<string, string>([
  // Block changed its NYSE ticker from SQ to XYZ in January 2025.
  ["SQ", "XYZ"],
  // The common Amsterdam listing is the one Yahoo exposes with full history.
  ["ADYEN", "ADYEN.AS"],
  // Newsmax lists on the NYSE as NMAX; the model tends to guess NWSM.
  ["NWSM", "NMAX"],
]);

export interface Canonical {
  company: string;
  ticker: string | null;
  isPublic: boolean;
}

/** Resolve a (company, ticker, isPublic) triple to its canonical form. */
export function canonicalize(
  company: string,
  ticker: string | null,
  isPublic: boolean,
): Canonical {
  const hit = ALIAS_INDEX.get(norm(company));
  if (hit) return { company: hit.company, ticker: hit.ticker, isPublic: hit.isPublic };

  const tk = ticker ? ticker.toUpperCase().trim() : null;
  if (tk && (NON_EQUITY.has(tk) || /-USD$/.test(tk))) {
    // Crypto tokens (incl. Yahoo "BTC-USD" form) aren't tradable equities.
    return { company: company.trim(), ticker: null, isPublic: false };
  }
  return { company: company.trim(), ticker: tk, isPublic };
}

/**
 * Map a display ticker to the symbol Yahoo expects. Share-class dots become
 * dashes (BRK.B → BRK-B), but exchange suffixes are left alone (000660.KS,
 * 7203.T).
 */
export function toYahooSymbol(ticker: string): string {
  const override = YAHOO_SYMBOL_OVERRIDES.get(ticker.toUpperCase());
  if (override) return override;
  const m = ticker.match(/^([A-Za-z]+)\.([A-Za-z])$/);
  return (m ? `${m[1]}-${m[2]}` : ticker).toUpperCase();
}
