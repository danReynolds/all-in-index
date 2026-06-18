// Server-side projections that trim a full Holding/Thesis down to just the
// fields a given client component renders. The aggregated records carry every
// take's quote/summary/topics; serializing those into a client component's
// props ships hundreds of KB of prose the component never shows. Projecting
// here keeps the wire payload to what's actually drawn.
//
// These live in a plain module (not a "use client" file) so the server pages
// can call them — functions exported from client modules can't be invoked
// server-side.

import type { Holding, Thesis } from "./types";
import type { StanceInput } from "./calls";

/**
 * The slice of a Holding the homepage table renders: a few scalars plus the
 * stance inputs (no quote/summary/topics, no synthesis).
 */
export type HoldingRow = Pick<
  Holding,
  "slug" | "company" | "ticker" | "domain" | "market" | "firstMentioned" | "lastMentioned" | "mentionCount"
> & { theses: StanceInput[] };

/** Project a full Holding down to what the homepage table renders. */
export function toHoldingRow(h: Holding): HoldingRow {
  return {
    slug: h.slug,
    company: h.company,
    ticker: h.ticker,
    domain: h.domain,
    market: h.market,
    firstMentioned: h.firstMentioned,
    lastMentioned: h.lastMentioned,
    mentionCount: h.mentionCount,
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
