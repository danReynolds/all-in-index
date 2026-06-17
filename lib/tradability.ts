import { isMacroAsset } from "./assets";
import type { ExcludedKind } from "./types";

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

/**
 * Classify a net-bullish holding that has no tradable single-name ticker, for
 * the "bullish but outside the index" display. Returns null for broad-market /
 * benchmark bets ("the S&P", "US equities") — those are just "stocks go up",
 * not a pick, and the S&P is literally our benchmark, so we omit them entirely.
 */
export function classifyExcluded(company: string): ExcludedKind | null {
  const n = company.toLowerCase();
  if (/s&p|u\.?s\.? equit|equity market|broad market|total market/.test(n)) return null;
  if (/\b(bitcoin|btc|ether|eth|solana|crypto|stablecoin|token)\b/.test(n)) return "crypto";
  if (/\b(basket|etfs?|index|credit default|swaps?|treasur|bonds?|sector)\b/.test(n)) return "macro";
  return "private";
}
