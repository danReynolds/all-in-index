import type { ExcludedKind } from "./types";

export const EXCLUDED_ETFS = new Set(["SPY", "QQQ", "VOO", "VTI", "DIA", "IWM"]);

/**
 * Public names under a definitive cash take-private: the stock is pinned to the
 * deal price and about to delist, so it's no longer a forward-performance public
 * equity — holders are cashed out at the deal price and the upside accrues to
 * the private buyers, not public shareholders. Tracked as a special situation
 * (surfaced in "bullish but outside the index"), but excluded from the index,
 * host funds, and Bear Book. Add the next take-private target here.
 */
export const GOING_PRIVATE = new Set(["EA"]); // Electronic Arts — $210/sh cash LBO, closing by Jun 30 2026.
export function isGoingPrivate(ticker: string | null | undefined): boolean {
  return !!ticker && GOING_PRIVATE.has(ticker.toUpperCase());
}

export interface TradableCandidate {
  ticker: string | null;
  isPublic: boolean;
}

export function isCryptoTicker(ticker: string | null | undefined): boolean {
  return !!ticker && (/-USD$/i.test(ticker) || ["BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "BNB"].includes(ticker.toUpperCase()));
}

/**
 * A scored take counts toward the funds when we can actually price it: a direct
 * public company (Google → GOOGL) OR a commodity / sector / crypto theme tracked
 * through a liquid ETF proxy (copper → CPER, defense → ITA). Proxied takes are
 * scored exactly the way the Predictions scorecard already scores them — we're
 * extending one interpretation of performance, not inventing a new one.
 *
 * Still excluded: broad-market benchmark ETFs (the S&P is what we score
 * AGAINST, so it can't itself be a position), raw crypto tokens (they
 * canonicalize to a spot-ETF proxy instead), and take-private targets (pinned
 * to a deal price, no forward performance).
 */
export function isTradableCompanyExposure<T extends TradableCandidate>(
  candidate: T,
): candidate is T & { ticker: string } {
  return (
    !!candidate.ticker &&
    candidate.isPublic &&
    !isCryptoTicker(candidate.ticker) &&
    !EXCLUDED_ETFS.has(candidate.ticker.toUpperCase()) &&
    !isGoingPrivate(candidate.ticker)
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
