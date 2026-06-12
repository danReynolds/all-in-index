import { isMacroAsset } from "./assets";

export const EXCLUDED_ETFS = new Set(["SPY", "QQQ", "VOO", "VTI", "DIA", "IWM"]);

export interface TradableCandidate {
  ticker: string | null;
  isPublic: boolean;
}

export function isCryptoTicker(ticker: string | null | undefined): boolean {
  return !!ticker && (/-USD$/i.test(ticker) || ["BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "BNB"].includes(ticker.toUpperCase()));
}

export function isTradableCompanyExposure<T extends TradableCandidate>(
  candidate: T,
): candidate is T & { ticker: string } {
  return (
    !!candidate.ticker &&
    candidate.isPublic &&
    !isCryptoTicker(candidate.ticker) &&
    !EXCLUDED_ETFS.has(candidate.ticker.toUpperCase()) &&
    !isMacroAsset(candidate.ticker)
  );
}
