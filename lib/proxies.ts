/**
 * Sector/theme → representative ETF proxies for the Predictions scorecard.
 *
 * When a bestie's year-ahead pick names a SECTOR or THEME rather than a single
 * tradable company ("Mag Seven", "Chinese tech", "vertical SaaS"), we track it
 * against the closest liquid, widely-held ETF so it can be scored. The proxy is
 * an APPROXIMATION — the "Why this proxy?" modal on the Predictions page spells
 * out the caveats.
 *
 * Shared by the pipeline (matching pick text → ticker) and the app (display).
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
  /** Matches the pick text (first match wins). */
  match: RegExp;
}

export const SECTOR_PROXIES: ProxyInfo[] = [
  {
    ticker: "MAGS",
    name: "Roundhill Magnificent Seven ETF",
    note: "Magnificent Seven ETF",
    what: "An equal-weight basket of the “Magnificent Seven” megacap tech stocks — Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta and Tesla.",
    match: /mag(nificent)?[\s-]*(7|seven)/i,
  },
  {
    ticker: "KWEB",
    name: "KraneShares CSI China Internet ETF",
    note: "China internet ETF",
    what: "China’s largest internet and technology companies — Alibaba, Tencent, PDD, Meituan and peers.",
    match: /chinese tech|china (internet|tech)/i,
  },
  {
    ticker: "IGV",
    name: "iShares Expanded Tech-Software Sector ETF",
    note: "software sector ETF",
    what: "Large US application and systems-software companies — a broad read on the software / SaaS sector.",
    match: /software industrial complex|enterprise (application )?software|legacy (enterprise )?saas|vertical saas/i,
  },
  {
    ticker: "BOTZ",
    name: "Global X Robotics & Artificial Intelligence ETF",
    note: "robotics & AI ETF",
    what: "Companies in industrial robotics, factory automation and AI-enabling hardware.",
    match: /robotic|autonomous hardware/i,
  },
  {
    ticker: "ITA",
    name: "iShares U.S. Aerospace & Defense ETF",
    note: "aerospace & defense ETF",
    what: "US aerospace and defense primes and suppliers — Boeing, Lockheed, RTX and peers.",
    match: /defense (and|&) aerospace|aerospace (and|&) defense|legacy defense/i,
  },
  {
    ticker: "REMX",
    name: "VanEck Rare Earth & Strategic Metals ETF",
    note: "rare-earth & strategic-metals ETF",
    what: "Miners and processors of rare-earth and strategic/critical metals used in batteries, magnets and electronics.",
    match: /critical (metals|minerals|elements)|rare[\s-]?earth|strategic metals/i,
  },
  {
    ticker: "IPO",
    name: "Renaissance IPO ETF",
    note: "Renaissance IPO ETF",
    what: "A rolling basket of the largest, most liquid newly-public US companies — a read on the IPO market itself.",
    match: /\bipo(s)?\b|new ipos/i,
  },
  {
    ticker: "QQQ",
    name: "Invesco QQQ Trust",
    note: "Nasdaq-100 ETF",
    what: "The Nasdaq-100 — the 100 largest non-financial companies on the Nasdaq, heavily weighted toward megacap tech.",
    match: /tech supercycle|technology supercycle|u\.?s\.? equities/i,
  },
];

export const PROXY_BY_TICKER: Record<string, ProxyInfo> = Object.fromEntries(
  SECTOR_PROXIES.map((p) => [p.ticker, p]),
);

const SECTOR_PROXY_TICKERS = new Set(SECTOR_PROXIES.map((p) => p.ticker));

export function isSectorProxy(ticker: string | null | undefined): boolean {
  return !!ticker && SECTOR_PROXY_TICKERS.has(ticker.toUpperCase());
}

export function sectorProxyInfo(ticker: string | null | undefined): ProxyInfo | null {
  return ticker ? (PROXY_BY_TICKER[ticker.toUpperCase()] ?? null) : null;
}

/** First proxy whose matcher hits the pick text, or null. */
export function findProxyForPick(pick: string): ProxyInfo | null {
  const normalized = pick.toLowerCase();
  return SECTOR_PROXIES.find((p) => {
    if (p.ticker === "MAGS" && /\bnon[\s-]*mag(?:nificent)?[\s-]*(?:7|seven)\b/.test(normalized)) return false;
    return p.match.test(pick);
  }) ?? null;
}
