import type { Stance } from "./types";

export function pct(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  const s = (x * 100).toFixed(1);
  return (x >= 0 ? "+" : "") + s + "%";
}

/** URL slug for a guest's profile page (lowercase, alphanumerics → hyphens). */
export function guestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Tailwind text-color class for a return value. */
export function returnColor(x: number | null | undefined): string {
  if (x == null) return "text-neutral-400";
  return x >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

export const STANCE_META: Record<
  Stance,
  { label: string; badge: string; dot: string }
> = {
  bull: {
    label: "Bullish",
    badge: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/25",
    dot: "bg-emerald-500",
  },
  bear: {
    label: "Bearish",
    badge: "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/25",
    dot: "bg-rose-500",
  },
  mixed: {
    label: "Mixed",
    badge: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/25",
    dot: "bg-amber-500",
  },
  neutral: {
    label: "Neutral",
    badge: "bg-white/5 text-neutral-300 ring-1 ring-inset ring-white/10",
    dot: "bg-neutral-400",
  },
};

export interface CallVerdict {
  label: string;
  /** true = the call is working, false = it's wrong so far, null = too close. */
  right: boolean | null;
}

/**
 * Judge a holding's net call against the stock's move since it was made.
 * The crucial case: a BEAR call on a stock that went UP is a WRONG call —
 * the raw return is the stock's performance, not theirs.
 */
export function callVerdict(
  stance: Stance,
  since: number | null | undefined,
): CallVerdict | null {
  if (since == null || (stance !== "bull" && stance !== "bear")) return null;
  const up = since > 0.02;
  const down = since < -0.02;
  if (!up && !down) return { label: `${stance} call · too early to say`, right: null };
  const right = stance === "bull" ? up : down;
  return {
    label: `${stance} call · ${right ? "right" : "wrong"} so far`,
    right,
  };
}

/** Whole days between two ISO dates (>= 0). */
export function daysBetween(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * The stock's own "normal" move between sampled closes — a noise floor.
 * A call shouldn't be judged right or wrong on a move smaller than this: for a
 * name like NVDA that routinely swings ~4% between samples, a 2% wiggle means
 * nothing. Uses the *median* absolute period return (robust to one-off gaps)
 * over the most recent ~24 samples. Returns null when there's too little data.
 */
export function typicalMove(
  history: Array<[string, number]> | null | undefined,
): number | null {
  if (!history || history.length < 4) return null;
  const tail = history.slice(-24);
  const moves: number[] = [];
  for (let i = 1; i < tail.length; i++) {
    const prev = tail[i - 1][1];
    const cur = tail[i][1];
    if (prev > 0) moves.push(Math.abs(cur / prev - 1));
  }
  if (!moves.length) return null;
  moves.sort((a, b) => a - b);
  const mid = Math.floor(moves.length / 2);
  return moves.length % 2 ? moves[mid] : (moves[mid - 1] + moves[mid]) / 2;
}

/** How long a thesis gets to breathe before we'll call it right or wrong. */
export const VIEW_HORIZON_DAYS = 90; // a long-arc "view" — give it a quarter
export const TRADE_HORIZON_DAYS = 30; // an explicit dated trade — give it a month
/** Smallest move that ever counts, even for a placid stock. */
const MIN_MATERIAL_MOVE = 0.03;

export type VerdictTone = "with" | "against" | "early" | "inline";

export interface TakeVerdict {
  /** with = thesis bearing out, against = running counter, early = too soon, inline = stock's barely moved. */
  tone: VerdictTone;
  /** True once there's been enough time *and* a material move to state plainly. */
  firm: boolean;
  /** Gracious, process-oriented phrasing for the UI. */
  label: string;
}

/**
 * Judge a host's take graciously and on the right horizon. A take only firms
 * up to "tracking with / against the call" once two things are true: the stock
 * has moved more than its own normal noise, *and* enough time has passed for
 * the thesis to play out. A multi-year durability view is not "wrong" because
 * the stock dipped for three weeks — that's "too early to call".
 *
 * The old binary callVerdict() (flat ±2%, no clock) still backs the
 * year-bounded prediction-contest surfaces; this is for episode/holding takes.
 */
export function takeVerdict(opts: {
  stance: Stance;
  /** Stock return from the call to now — the stock's move, not the host's. */
  since: number | null | undefined;
  /** Days from the call date to the latest price. */
  elapsedDays: number | null | undefined;
  /** The stock's typical move between samples (see typicalMove). */
  noiseFloor: number | null | undefined;
  /** True for a portfolio-scored call (a dated trade); false/undefined for a long-arc view. */
  scored?: boolean;
}): TakeVerdict | null {
  const { stance, since } = opts;
  if (since == null || (stance !== "bull" && stance !== "bear")) return null;
  // Signal has to beat the stock's own noise (with a floor for placid names).
  const floor = Math.max(MIN_MATERIAL_MOVE, opts.noiseFloor ?? 0);
  if (Math.abs(since) < floor) return { tone: "inline", firm: false, label: "barely moved since" };
  // Let the thesis breathe before grading it.
  const horizon = opts.scored ? TRADE_HORIZON_DAYS : VIEW_HORIZON_DAYS;
  if ((opts.elapsedDays ?? 0) < horizon) return { tone: "early", firm: false, label: "too early to call" };
  const working = stance === "bull" ? since > 0 : since < 0;
  return working
    ? { tone: "with", firm: true, label: "tracking with the call" }
    : { tone: "against", firm: true, label: "tracking against the call" };
}

export function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Compact elapsed span between two ISO dates, e.g. "2yr 1mo", "8mo", "3yr".
 * Used to show how long a return has been playing out, so a "+59%" reads
 * differently over six months than over two years.
 */
export function fmtDuration(fromIso: string, toIso: string): string {
  if (!fromIso || !toIso) return "";
  const from = new Date(fromIso);
  const to = new Date(toIso);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  if (months < 1) {
    const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
    return days < 7 ? `${days}d` : `${Math.round(days / 7)}w`;
  }
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years < 1) return `${months}mo`;
  return rem ? `${years}yr ${rem}mo` : `${years}yr`;
}

// Provider currency → display symbol.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  KRW: "₩",
  JPY: "¥",
  GBP: "£",
  HKD: "HK$",
  CAD: "C$",
  AUD: "A$",
};

// Exchange-suffix fallback for legacy generated data.
const SUFFIX_CCY: Record<string, string> = {
  KS: "₩",
  KQ: "₩",
  T: "¥",
  HK: "HK$",
  L: "£",
  TO: "C$",
  AX: "A$",
};

/** Price with the right currency symbol for the ticker's exchange. */
export function fmtMoney(
  v: number | null | undefined,
  market?: string | { ticker?: string | null; sourceSymbol?: string | null; currency?: string | null } | null,
): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const ticker = typeof market === "string" ? market : (market?.sourceSymbol ?? market?.ticker);
  const currency = typeof market === "string" ? null : market?.currency;
  const suffix = ticker?.match(/\.([A-Za-z]+)$/)?.[1]?.toUpperCase();
  const sym =
    (currency ? CURRENCY_SYMBOLS[currency.toUpperCase()] : undefined) ??
    (suffix ? (SUFFIX_CCY[suffix] ?? "") : "$");
  const num =
    v >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2);
  return sym + num;
}

export function mmss(ms: number | null | undefined): string {
  if (ms == null) return "";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
