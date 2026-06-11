import type { Host } from "./types";

interface HostUI {
  name: string;
  initials: string;
  /** Solid avatar: background + text. */
  solid: string;
  /** Soft chip: tinted bg + text. */
  soft: string;
  /** Ring/border accent. */
  ring: string;
  /** Hex accent (for charts/SVG). */
  hex: string;
  /** X (Twitter) handle — drives the real profile photo via unavatar. */
  xHandle?: string;
}

/** Best-effort real profile photo (X avatar via unavatar); UI falls back to initials. */
export function hostImageUrl(host: Host): string | null {
  const h = HOST_UI[host]?.xHandle;
  return h ? `https://unavatar.io/x/${h}?fallback=false` : null;
}

// Distinct hues, deliberately avoiding emerald (gains) and rose (losses).
export const HOST_UI: Record<Host, HostUI> = {
  Chamath: {
    name: "Chamath",
    initials: "C",
    solid: "bg-amber-500 text-white",
    soft: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    ring: "ring-amber-400",
    hex: "#f59e0b",
    xHandle: "chamath",
  },
  Jason: {
    name: "Jason",
    initials: "J",
    solid: "bg-sky-500 text-white",
    soft: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
    ring: "ring-sky-400",
    hex: "#0ea5e9",
    xHandle: "Jason",
  },
  Sacks: {
    name: "Sacks",
    initials: "S",
    solid: "bg-violet-500 text-white",
    soft: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
    ring: "ring-violet-400",
    hex: "#8b5cf6",
    xHandle: "DavidSacks",
  },
  Friedberg: {
    name: "Friedberg",
    initials: "F",
    solid: "bg-teal-500 text-white",
    soft: "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300",
    ring: "ring-teal-400",
    hex: "#14b8a6",
    xHandle: "friedberg",
  },
  Guest: {
    name: "Guest",
    initials: "G",
    solid: "bg-zinc-500 text-white",
    soft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300",
    ring: "ring-zinc-400",
    hex: "#71717a",
  },
  Unknown: {
    name: "Unknown",
    initials: "?",
    solid: "bg-zinc-600 text-white",
    soft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300",
    ring: "ring-zinc-400",
    hex: "#52525b",
  },
};

export const RANK_MEDAL = ["🥇", "🥈", "🥉", "4️⃣"];
