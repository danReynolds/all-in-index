/**
 * Sector/theme → representative ETF proxies.
 *
 * When a bestie's pick names a SECTOR or THEME rather than a single tradable
 * company ("Mag Seven", "Chinese tech", "vertical SaaS"), we track it against
 * the closest liquid, widely-held ETF so it can be scored. The proxy is an
 * APPROXIMATION — the "Why this proxy?" modal spells out the caveats.
 *
 * This registry is the single source of truth: the LLM extraction picks a
 * proxy ticker from it (see SECTOR_PROXY_PROMPT / SECTOR_PROXY_TICKERS), the
 * pipeline attaches it (build-index attachSectorProxy, extract-predictions),
 * and the app reads its labels. There is deliberately NO text-matching here —
 * "is this remark a bet on Chinese tech?" is a judgment, made by the model
 * with guidance, not by regex.
 */
export interface ProxyInfo {
  /** ETF ticker we price against. */
  ticker: string;
  /** Full fund name. */
  name: string;
  /** Short label shown on cards, e.g. "Nasdaq-100 ETF". */
  note: string;
  /** One- or two-sentence description of what the ETF actually holds/tracks. */
  what: string;
}

export const SECTOR_PROXIES: ProxyInfo[] = [
  {
    ticker: "MAGS",
    name: "Roundhill Magnificent Seven ETF",
    note: "Magnificent Seven ETF",
    what: "An equal-weight basket of the “Magnificent Seven” megacap tech stocks — Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta and Tesla.",
  },
  {
    ticker: "KWEB",
    name: "KraneShares CSI China Internet ETF",
    note: "China internet ETF",
    what: "China’s largest internet and technology companies — Alibaba, Tencent, PDD, Meituan and peers.",
  },
  {
    ticker: "IGV",
    name: "iShares Expanded Tech-Software Sector ETF",
    note: "software sector ETF",
    what: "Large US application and systems-software companies — a broad read on the software / SaaS sector.",
  },
  {
    ticker: "BOTZ",
    name: "Global X Robotics & Artificial Intelligence ETF",
    note: "robotics & AI ETF",
    what: "Companies in industrial robotics, factory automation and AI-enabling hardware.",
  },
  {
    ticker: "ITA",
    name: "iShares U.S. Aerospace & Defense ETF",
    note: "aerospace & defense ETF",
    what: "US aerospace and defense primes and suppliers — Boeing, Lockheed, RTX and peers.",
  },
  {
    ticker: "REMX",
    name: "VanEck Rare Earth & Strategic Metals ETF",
    note: "rare-earth & strategic-metals ETF",
    what: "Miners and processors of rare-earth and strategic/critical metals used in batteries, magnets and electronics.",
  },
  {
    ticker: "IPO",
    name: "Renaissance IPO ETF",
    note: "Renaissance IPO ETF",
    what: "A rolling basket of the largest, most liquid newly-public US companies — a read on the IPO market itself.",
  },
  {
    ticker: "QQQ",
    name: "Invesco QQQ Trust",
    note: "Nasdaq-100 ETF",
    what: "The Nasdaq-100 — the 100 largest non-financial companies on the Nasdaq, heavily weighted toward megacap tech.",
  },
];

export const PROXY_BY_TICKER: Record<string, ProxyInfo> = Object.fromEntries(
  SECTOR_PROXIES.map((p) => [p.ticker, p]),
);

const SECTOR_PROXY_TICKERS = new Set(SECTOR_PROXIES.map((p) => p.ticker));

/** Allowed proxy tickers, for an extraction schema enum (callers add null). */
export const SECTOR_PROXY_TICKER_VALUES = SECTOR_PROXIES.map((p) => p.ticker);

/** A prompt-ready list of the proxies and what each represents. */
export const SECTOR_PROXY_PROMPT = SECTOR_PROXIES.map(
  (p) => `  - ${p.ticker} — ${p.what}`,
).join("\n");

export function isSectorProxy(ticker: string | null | undefined): boolean {
  return !!ticker && SECTOR_PROXY_TICKERS.has(ticker.toUpperCase());
}

export function sectorProxyInfo(ticker: string | null | undefined): ProxyInfo | null {
  return ticker ? (PROXY_BY_TICKER[ticker.toUpperCase()] ?? null) : null;
}
