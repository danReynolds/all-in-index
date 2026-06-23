// Server-side projections that trim a full Holding/Thesis down to just the
// fields a given client component renders. The aggregated records carry every
// take's quote/summary/topics; serializing those into a client component's
// props ships hundreds of KB of prose the component never shows. Projecting
// here keeps the wire payload to what's actually drawn.
//
// These live in a plain module (not a "use client" file) so the server pages
// can call them — functions exported from client modules can't be invoked
// server-side.

import type { Holding, Thesis, Stance } from "./types";
import type { StanceInput } from "./calls";
import { holdingBadge, hasScoredCall, currentCall, shortReturn } from "./calls";

/**
 * The slice of a Holding the homepage table renders: a few scalars plus the
 * stance inputs (no quote/summary/topics, no synthesis).
 */
export type HoldingRow = Pick<
  Holding,
  "slug" | "company" | "ticker" | "domain" | "market" | "firstMentioned" | "lastMentioned" | "mentionCount"
> & {
  theses: StanceInput[];
  /** Badge stance + whether it's a scored position, precomputed server-side (the
   * trimmed theses here lack the callType the position logic needs). */
  stance: Stance;
  scored: boolean;
  /** True when the holding has any scored call — gates the returns column. */
  hasCall: boolean;
  /**
   * The direction-adjusted, call-anchored return to display — the same number
   * the detail page leads with. For a BEAR this is the short's P&L (capped at
   * −100%), never the raw stock move, so a winning short reads green. Null when
   * there's no current scored call to attribute a return to.
   */
  callReturn: number | null;
};

/**
 * The displayed call return: prefer the scored fund position (Besties Index long
 * or Bear Book short, matched by ticker), else fall back to the current call —
 * exactly the precedence the holding detail page uses. A bear's value is the
 * short's P&L (`−stockMove`, floored at −100%), so the table never shows a
 * winning short as a red loss (or a losing short as a green gain).
 */
function computeCallReturn(h: Holding, fundByTicker?: Map<string, number>): number | null {
  const fromFund = h.ticker ? fundByTicker?.get(h.ticker.toUpperCase()) : undefined;
  if (fromFund != null) return fromFund;
  const cc = currentCall(h);
  if (cc && cc.ret != null && (cc.stance === "bull" || cc.stance === "bear")) {
    return cc.stance === "bear" ? shortReturn(cc.ret) : cc.ret;
  }
  return null;
}

/**
 * Project a full Holding down to what the homepage table renders. Pass
 * `callReturnByTicker` (Besties Index long returns + Bear Book short P&Ls, keyed
 * by upper-case ticker) so the displayed return matches the fund/detail pages.
 */
export function toHoldingRow(h: Holding, callReturnByTicker?: Map<string, number>): HoldingRow {
  const badge = holdingBadge(h.theses);
  return {
    slug: h.slug,
    company: h.company,
    ticker: h.ticker,
    domain: h.domain,
    market: h.market,
    firstMentioned: h.firstMentioned,
    lastMentioned: h.lastMentioned,
    mentionCount: h.mentionCount,
    stance: badge.stance,
    scored: badge.scored,
    hasCall: hasScoredCall(h.theses),
    // Only a scored position (Bullish/Bearish badge) gets a return — commentary,
    // even when it leans directionally, shows "—" so the number agrees with the badge.
    callReturn: badge.scored ? computeCallReturn(h, callReturnByTicker) : null,
    theses: h.theses.map((t) => ({
      host: t.host,
      stance: t.stance,
      conviction: t.conviction,
      attributionConfidence: t.attributionConfidence,
      episodeDate: t.episodeDate,
    })),
  };
}

/**
 * The slice of a Thesis a trade-event receipt card renders. The card shows the
 * call's summary + quote and links to its episode; everything else (topics,
 * conviction, ids, exclusion bookkeeping) is unused on that surface.
 */
export type TradeEventTake = Pick<
  Thesis,
  "stance" | "episodeId" | "episodeNumber" | "quoteStartMs" | "host" | "company" | "summary" | "quote"
>;

/** Project a full Thesis down to what a trade-event receipt shows. */
export function toEventTake(t: Thesis | null | undefined): TradeEventTake | null {
  if (!t) return null;
  return {
    stance: t.stance,
    episodeId: t.episodeId,
    episodeNumber: t.episodeNumber,
    quoteStartMs: t.quoteStartMs,
    host: t.host,
    company: t.company,
    summary: t.summary,
    quote: t.quote,
  };
}
