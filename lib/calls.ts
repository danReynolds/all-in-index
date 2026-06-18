// Time-aware stance logic shared by the pipeline and the site.
//
// The core idea: a holding's stance is not an all-history vote — it's the
// balance of each host's LATEST scored take, and it evolves. Accountability
// must respect those windows: the current call is judged from when it was
// adopted, and the full history is judged by the "follow their calls" return.

import type { CallType, Holding, Host, Stance, Thesis, TradeDirection } from "./types";

const BESTIES: readonly Host[] = ["Chamath", "Jason", "Sacks", "Friedberg"];

/**
 * The minimal thesis shape the stance logic reads. Declaring it lets callers
 * pass a projected take (e.g. the homepage table, which ships none of the
 * quote/summary/topics text) without widening it back to a full Thesis.
 */
export type StanceInput = Pick<
  Thesis,
  "host" | "stance" | "conviction" | "attributionConfidence" | "episodeDate"
>;

/** Takes that score: bestie (by default), medium+ conviction, attribution OK. */
export function scoredTakes<T extends StanceInput>(
  theses: T[],
  hosts: readonly Host[] = BESTIES,
): T[] {
  // Same-date tie-break: a host's directional take outranks their neutral
  // commentary from the same episode (it sorts later, so "latest per host"
  // logic lands on it), and higher conviction outranks lower. Without this,
  // file order decided e.g. which of Sacks's two same-day Anthropic takes
  // counted as his stance.
  const dirRank = (t: StanceInput) => (t.stance === "neutral" ? 0 : t.stance === "mixed" ? 1 : 2);
  const convRank = { low: 0, medium: 1, high: 2 } as const;
  return theses
    .filter(
      (t) =>
        hosts.includes(t.host) &&
        t.conviction !== "low" &&
        t.attributionConfidence !== "low",
    )
    .sort(
      (a, b) =>
        a.episodeDate.localeCompare(b.episodeDate) ||
        dirRank(a) - dirRank(b) ||
        convRank[a.conviction] - convRank[b.conviction],
    );
}

function balance(latest: Map<Host, Stance>): number {
  let bull = 0;
  let bear = 0;
  for (const s of latest.values()) {
    if (s === "bull") bull++;
    else if (s === "bear") bear++;
    else if (s === "mixed") {
      bull += 0.5;
      bear += 0.5;
    }
  }
  return bull - bear;
}

/** Current stance for a specific host set, with no guest fallback. */
export function currentStanceForHosts(
  theses: StanceInput[],
  hosts: readonly Host[],
): Stance {
  const takes = scoredTakes(theses, hosts);
  if (takes.length === 0) return "neutral";
  const latest = new Map<Host, Stance>();
  for (const t of takes) latest.set(t.host, t.stance);
  const b = balance(latest);
  if (b > 0) return "bull";
  if (b < 0) return "bear";
  return [...latest.values()].some((s) => s !== "neutral") ? "mixed" : "neutral";
}

/**
 * The table's CURRENT stance: balance of each host's latest scored take.
 * Falls back to guests when no bestie ever scored a take on the name.
 */
/**
 * A holding's stance for DISPLAY. "none" = no take clears the scoring bar
 * (medium+ conviction, verified speaker) — a different epistemic state than
 * "neutral", which means scored takes exist and balance out. Don't conflate
 * "the table is torn" with "we have nothing scoreable".
 */
export function displayStance(theses: StanceInput[]): Stance | "none" {
  if (scoredTakes(theses).length === 0 && scoredTakes(theses, ["Guest"]).length === 0) {
    return "none";
  }
  return currentStanceFromTheses(theses);
}

export function currentStanceFromTheses(theses: StanceInput[]): Stance {
  if (scoredTakes(theses).length > 0) return currentStanceForHosts(theses, BESTIES);
  return currentStanceForHosts(theses, ["Guest"]);
}

const SCOREABLE_CALL_TYPES = new Set<CallType>([
  "explicit_long",
  "explicit_short",
  "explicit_exit",
  "selection",
  "pair_trade",
  "basket",
]);

/**
 * A take is portfolio-scored when its callType is a real call shape (not a
 * "view") and it carries no judgment exclusion. callType is the single gate —
 * there is no separate `positional` flag. (Whether a scored call also enters
 * the tradable fund is a further, structural check — see isTradableCompanyExposure.)
 */
export function isPortfolioScored(t: Thesis): boolean {
  return t.callType != null && SCOREABLE_CALL_TYPES.has(t.callType) && !t.excludeReason;
}

/**
 * The direction to trade a scored call, derived from its shape + stance.
 * A bearish *exit* opens nothing; a short is only ever an explicit_short or the
 * short leg of a pair — that distinction lives in callType, so nothing needs to
 * be stored alongside it.
 */
export function tradeDirectionForTake(t: Thesis): TradeDirection | null {
  if (!isPortfolioScored(t)) return null;
  switch (t.callType) {
    // An explicit long/short *is* its direction — the speaker named the trade,
    // so the stance label (which may be neutral on a disclosed holding) doesn't gate it.
    case "explicit_long":
      return "long";
    case "explicit_short":
      return "short";
    // A bare exit closes a position without opening a new one.
    case "explicit_exit":
      return null;
    // A pick follows the view: a bullish pick is a long, a bearish pick (a
    // "loser basket" / "worst-performing asset") is a short.
    case "selection":
    case "basket":
    case "pair_trade":
      return t.stance === "bull" ? "long" : t.stance === "bear" ? "short" : null;
    default:
      return null;
  }
}

/**
 * Portfolio-scored calls (View ≠ Trade). Note: deliberately NOT gated on
 * conviction — "I have shares, I think it's a good investment" said calmly is
 * the clearest possible "I'm in"; selection/ranking language in an investment
 * frame is also scoreable. Attribution must still be clean.
 */
export function positionTakes(
  theses: Thesis[],
  hosts: readonly Host[] = BESTIES,
): Thesis[] {
  return theses
    .filter(
      (t) =>
        hosts.includes(t.host) &&
        isPortfolioScored(t) &&
        t.attributionConfidence !== "low",
    )
    .sort((a, b) => a.episodeDate.localeCompare(b.episodeDate));
}

export interface ExposureWindow {
  start: string;
  /** null = still open (held to today). */
  end: string | null;
  direction: TradeDirection;
  /** The position call that opened the window. */
  startTake?: Thesis;
  /** Same-direction scored calls made while this exposure was already open. */
  reinforceTakes?: Thesis[];
  /** The position call that closed it. */
  endTake?: Thesis;
}

export interface BullWindow extends ExposureWindow {
  direction: "long";
}

/**
 * One host's exposure windows on a name, built ONLY from portfolio-scored
 * calls. Explicit longs/ranked picks open longs; explicit shorts/pair short
 * legs open shorts; exits and opposite-direction calls close the old window.
 * Commentary never trades.
 */
export function hostExposureWindows(theses: Thesis[], host: Host): ExposureWindow[] {
  const takes = positionTakes(theses, [host]);
  const windows: ExposureWindow[] = [];
  let open: ExposureWindow | null = null;
  for (const t of takes) {
    const d = t.episodeDate.slice(0, 10);
    const direction = tradeDirectionForTake(t);
    if (!direction) {
      if (open) {
        open.end = d;
        open.endTake = t;
        windows.push(open);
        open = null;
      }
      continue;
    }
    if (!open) {
      open = { start: d, end: null, direction, startTake: t };
    } else if (open.direction !== direction) {
      open.end = d;
      open.endTake = t;
      windows.push(open);
      open = { start: d, end: null, direction, startTake: t };
    } else {
      (open.reinforceTakes ??= []).push(t);
    }
  }
  if (open) windows.push(open);
  return windows;
}

/**
 * Compatibility helper for long-only surfaces: enter on scored long, exit on
 * next scored non-long. New scoring code should use hostExposureWindows.
 */
export function hostBullWindows(theses: Thesis[], host: Host): BullWindow[] {
  return hostExposureWindows(theses, host).filter((w): w is BullWindow => w.direction === "long");
}

export interface StanceSegment {
  date: string;
  dir: -1 | 0 | 1;
}

/**
 * The collapsed net-direction path over time: after every scored take, where
 * did the table's balance point? Consecutive same-direction states merge, so
 * the path reads like ▲ → ▼ → ▲.
 */
export function stancePath(
  theses: Thesis[],
  hosts: readonly Host[] = BESTIES,
): StanceSegment[] {
  const takes = scoredTakes(theses, hosts);
  const latest = new Map<Host, Stance>();
  const path: StanceSegment[] = [];
  for (const t of takes) {
    latest.set(t.host, t.stance);
    const b = balance(latest);
    const dir: -1 | 0 | 1 = b > 0 ? 1 : b < 0 ? -1 : 0;
    if (!path.length || path[path.length - 1].dir !== dir) {
      path.push({ date: t.episodeDate.slice(0, 10), dir });
    }
  }
  return path;
}

function closeOnOrAfter(
  history: Array<[string, number]>,
  d: string,
): number | null {
  for (const [dd, c] of history) if (dd >= d) return c;
  return null;
}

export interface CurrentCall {
  stance: Stance;
  /** When the current net direction was adopted. */
  sinceDate: string;
  /** Stock return from adoption to the latest close (null if unpriceable). */
  ret: number | null;
}

export function currentCall(h: Holding): CurrentCall | null {
  const path = stancePath(h.theses);
  if (path.length === 0) return null;
  const sinceDate = path[path.length - 1].date;
  let ret: number | null = null;
  const hist = h.market?.history;
  if (hist && hist.length > 1) {
    const p0 = closeOnOrAfter(hist, sinceDate);
    if (p0 != null) ret = hist[hist.length - 1][1] / p0 - 1;
  }
  return { stance: currentStanceFromTheses(h.theses), sinceDate, ret };
}

export interface FollowStats {
  /** Long during bullish stretches, short during bearish, flat when mixed. */
  followReturn: number;
  buyHold: number;
  /** Hard direction reversals along the path. */
  flips: number;
  /** True when the stance actually changed direction over time. */
  evolved: boolean;
}

export function followStats(h: Holding): FollowStats | null {
  const path = stancePath(h.theses);
  const hist = h.market?.history;
  if (!hist || hist.length < 2 || path.length === 0) return null;
  const last = hist[hist.length - 1][1];
  let value = 1;
  for (let i = 0; i < path.length; i++) {
    if (path[i].dir === 0) continue;
    const p0 = closeOnOrAfter(hist, path[i].date);
    const p1 = i + 1 < path.length ? closeOnOrAfter(hist, path[i + 1].date) : last;
    if (p0 == null || p1 == null) continue;
    value *= 1 + path[i].dir * (p1 / p0 - 1);
  }
  const dirs = path.filter((p) => p.dir !== 0).map((p) => p.dir);
  let flips = 0;
  for (let i = 1; i < dirs.length; i++) if (dirs[i] !== dirs[i - 1]) flips++;
  const first = closeOnOrAfter(hist, path[0].date);
  return {
    followReturn: value - 1,
    buyHold: first != null ? last / first - 1 : 0,
    flips,
    evolved: flips > 0,
  };
}
