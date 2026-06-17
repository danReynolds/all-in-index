// Commodity / macro-asset calls: tracked and scored like holdings (priced via
// liquid ETF proxies), but they are not company calls — excluded from the
// Besties Index, host funds, and the Bear Book.

export interface AssetDef {
  /** Display name; also becomes the holding's company name. */
  name: string;
  /** Liquid ETF proxy used for pricing (clean tickers, Yahoo-friendly). */
  proxy: string;
  /** Transcript keywords that open an extraction window. */
  keywords: string[];
  /** Semantic monogram color (white text reads on all of these). */
  color: string;
}

export const ASSETS: AssetDef[] = [
  { name: "Copper", proxy: "CPER", keywords: ["copper"], color: "#b45309" },
  { name: "Oil", proxy: "USO", keywords: ["oil price", "price of oil", "crude", "brent", "wti", "barrel"], color: "#3f3f46" },
  { name: "Gold", proxy: "GLD", keywords: ["gold"], color: "#b8860b" },
  { name: "Silver", proxy: "SLV", keywords: ["silver"], color: "#737d8c" },
  { name: "Natural Gas", proxy: "UNG", keywords: ["natural gas"], color: "#2563eb" },
  { name: "Uranium", proxy: "URA", keywords: ["uranium"], color: "#65a30d" },
  { name: "Lithium", proxy: "LIT", keywords: ["lithium"], color: "#7c3aed" },
];

/**
 * Crypto: tracked and scored like the commodities above, priced via a liquid
 * spot-ETF proxy (clean Yahoo ticker, so it isn't stripped as a raw token).
 * NOT in the keyword-extraction list — the company extractor already captures
 * named-coin calls; canonicalize maps the coin to its proxy (see entities.ts),
 * and here we just register the proxy + monogram color so it's a macro asset.
 */
export const CRYPTO: AssetDef[] = [
  { name: "Bitcoin", proxy: "IBIT", keywords: ["bitcoin", "btc"], color: "#f7931a" },
  { name: "Ethereum", proxy: "ETHA", keywords: ["ethereum", "ether"], color: "#627eea" },
];

/** Semantic monogram color for a macro asset (commodity or crypto), or null. */
const ASSET_COLOR = new Map([...ASSETS, ...CRYPTO].map((a) => [a.name.toLowerCase(), a.color]));
export function macroColor(name: string): string | null {
  return ASSET_COLOR.get(name.toLowerCase()) ?? null;
}

/** True for the crypto proxies — used to label them as crypto, not commodities. */
const CRYPTO_PROXIES = new Set(CRYPTO.map((a) => a.proxy));
export function isCryptoProxy(ticker: string | null | undefined): boolean {
  return !!ticker && CRYPTO_PROXIES.has(ticker.toUpperCase());
}

/** Tickers that price macro/commodity/crypto holdings — never company calls. */
export const MACRO_PROXIES = new Set([
  ...ASSETS.map((a) => a.proxy),
  ...CRYPTO.map((a) => a.proxy),
  "KWEB", // Chinese tech basket — same treatment if it ever resolves a ticker
]);

export function isMacroAsset(ticker: string | null | undefined): boolean {
  return !!ticker && MACRO_PROXIES.has(ticker.toUpperCase());
}
