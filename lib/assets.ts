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
}

export const ASSETS: AssetDef[] = [
  { name: "Copper", proxy: "CPER", keywords: ["copper"] },
  { name: "Oil", proxy: "USO", keywords: ["oil price", "price of oil", "crude", "brent", "wti", "barrel"] },
  { name: "Gold", proxy: "GLD", keywords: ["gold"] },
  { name: "Silver", proxy: "SLV", keywords: ["silver"] },
  { name: "Natural Gas", proxy: "UNG", keywords: ["natural gas"] },
  { name: "Uranium", proxy: "URA", keywords: ["uranium"] },
  { name: "Lithium", proxy: "LIT", keywords: ["lithium"] },
];

/** Tickers that price macro/commodity holdings — never company calls. */
export const MACRO_PROXIES = new Set([
  ...ASSETS.map((a) => a.proxy),
  "KWEB", // Chinese tech basket — same treatment if it ever resolves a ticker
]);

export function isMacroAsset(ticker: string | null | undefined): boolean {
  return !!ticker && MACRO_PROXIES.has(ticker.toUpperCase());
}
