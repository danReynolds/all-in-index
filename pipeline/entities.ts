// Canonical entity resolution: collapses the name variants the extractor
// produces across episodes into one company, and cleans up bad tickers.

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

// Only clearly-correct consolidations. We deliberately keep distinct bets
// separate (e.g. Waymo stays its own entity rather than folding into Google).
const CANON: Canon[] = [
  { company: "Amazon", ticker: "AMZN", isPublic: true, aliases: ["amazon", "amazon web services", "aws"] },
  { company: "Google", ticker: "GOOGL", isPublic: true, aliases: ["google", "alphabet", "google cloud"] },
  { company: "Meta", ticker: "META", isPublic: true, aliases: ["meta", "meta platforms", "facebook", "instagram"] },
  { company: "Microsoft", ticker: "MSFT", isPublic: true, aliases: ["microsoft", "microsoft azure", "azure", "github"] },
  { company: "Salesforce", ticker: "CRM", isPublic: true, aliases: ["salesforce", "slack", "tableau", "mulesoft"] },
  // xAI absorbed X/Twitter; the extractor also emits a combined "Elon Web
  // Services" entity — consolidate the AI/social cluster under xAI (private).
  { company: "xAI", ticker: null, isPublic: false, aliases: ["xai", "x", "twitter", "x corp", "xai spacex", "elon web services"] },
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
