// Time-aware stance logic shared by the pipeline and the site.
//
// The core idea: a holding's stance is not an all-history vote — it's the
// balance of each host's LATEST scored take, and it evolves. Accountability
// must respect those windows: the current call is judged from when it was
// adopted, and the full history is judged by the "follow their calls" return.

import type { Holding, Host, Stance, Thesis } from "./types";

const BESTIES: readonly Host[] = ["Chamath", "Jason", "Sacks", "Friedberg"];

/** Takes that score: bestie (by default), medium+ conviction, attribution OK. */
export function scoredTakes(
  theses: Thesis[],
  hosts: readonly Host[] = BESTIES,
): Thesis[] {
  return theses
    .filter(
      (t) =>
        hosts.includes(t.host) &&
        t.conviction !== "low" &&
        t.attributionConfidence !== "low",
    )
    .sort((a, b) => a.episodeDate.localeCompare(b.episodeDate));
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
  theses: Thesis[],
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
export function displayStance(theses: Thesis[]): Stance | "none" {
  if (scoredTakes(theses).length === 0 && scoredTakes(theses, ["Guest"]).length === 0) {
    return "none";
  }
  return currentStanceFromTheses(theses);
}

export function currentStanceFromTheses(theses: Thesis[]): Stance {
  if (scoredTakes(theses).length > 0) return currentStanceForHosts(theses, BESTIES);
  return currentStanceForHosts(theses, ["Guest"]);
}

/**
 * Explicit position calls (View ≠ Position). Note: deliberately NOT gated on
 * conviction — "I have shares, I think it's a good investment" said calmly is
 * the clearest possible "I'm in"; ownership signals don't need rhetorical
 * emphasis. Attribution must still be clean.
 */
export function positionTakes(
  theses: Thesis[],
  hosts: readonly Host[] = BESTIES,
): Thesis[] {
  return theses
    .filter(
      (t) =>
        hosts.includes(t.host) &&
        t.positional === true &&
        t.attributionConfidence !== "low",
    )
    .sort((a, b) => a.episodeDate.localeCompare(b.episodeDate));
}

export interface BullWindow {
  start: string;
  /** null = still open (held to today). */
  end: string | null;
  /** The position call that opened the window. */
  startTake?: Thesis;
  /** The position call that closed it. */
  endTake?: Thesis;
}

/**
 * One host's long windows on a name, built ONLY from their position calls:
 * enter on a positional bull, exit on their next positional non-bull,
 * re-enter on a later positional bull. Commentary never trades.
 */
export function hostBullWindows(theses: Thesis[], host: Host): BullWindow[] {
  const takes = positionTakes(theses, [host]);
  const windows: BullWindow[] = [];
  let open: BullWindow | null = null;
  for (const t of takes) {
    const d = t.episodeDate.slice(0, 10);
    if (t.stance === "bull" && !open) {
      open = { start: d, end: null, startTake: t };
    } else if (t.stance !== "bull" && open) {
      open.end = d;
      open.endTake = t;
      windows.push(open);
      open = null;
    }
  }
  if (open) windows.push(open);
  return windows;
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
