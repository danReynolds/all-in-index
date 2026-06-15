import type { Stance } from "./types";

export function pct(x: number | null | undefined): string {
  if (x == null) return "—";
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

export function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
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
  if (v == null) return "—";
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
