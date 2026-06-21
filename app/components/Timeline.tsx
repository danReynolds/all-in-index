"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, mmss } from "@/lib/format";
import { isPortfolioScored, isScoredPosition } from "@/lib/calls";
import { ConvictionDots } from "@/app/components/badges";
import { GuestName } from "@/app/components/GuestName";
import { ListenButton } from "@/app/components/player";
import type { EpisodeMeta, Stance, Thesis } from "@/lib/types";

const STANCE_HEX: Record<Stance, string> = {
  bull: "#10b981",
  bear: "#f43f5e",
  mixed: "#f59e0b",
  neutral: "#8d9a92",
};

// On the timeline each take reads as SENTIMENT over time — positive / negative /
// mixed / neutral — not as a scored position. (Bullish/Bearish/Commentary stay
// for the scored index takes elsewhere; here the 📌 pill marks which ones score.)
const SENTIMENT: Record<Stance, { label: string; badge: string; dot: string }> = {
  bull: { label: "Positive", badge: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25", dot: "bg-emerald-400" },
  bear: { label: "Negative", badge: "bg-rose-500/10 text-rose-300 ring-rose-500/25", dot: "bg-rose-400" },
  mixed: { label: "Mixed", badge: "bg-amber-500/10 text-amber-300 ring-amber-500/25", dot: "bg-amber-400" },
  neutral: { label: "Neutral", badge: "bg-white/5 text-neutral-300 ring-white/10", dot: "bg-neutral-400" },
};

function SentimentBadge({ stance }: { stance: Stance }) {
  const s = SENTIMENT[stance];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

type TimelineMode = "signal" | "all";

// "Key calls" = the site's canonical SCORED takes (medium+ conviction, verified
// speaker). Same set the stance, index, and flip count are built from — so the
// flips a host's badge claims are actually visible in this default view.
function isDefaultTimelineTake(t: Thesis): boolean {
  // Always surface the scored position calls — they're what the holding's
  // Bullish/Bearish badge is built on, so hiding one (e.g. a low-conviction
  // long) would leave that badge unexplained. Otherwise show non-low takes.
  return isScoredPosition(t) || (t.attributionConfidence !== "low" && t.conviction !== "low");
}

function mentionCount(n: number): string {
  return `${n} ${n === 1 ? "mention" : "mentions"}`;
}

/**
 * A host's take history as a time-proportional track: nodes sit where the
 * takes actually happened, so streaks and reversals read at a glance.
 * Conviction = emphasis (high gets a halo, low is dimmed). Click for the quote.
 */
export function Timeline({
  theses,
  episodeLinks = {},
  episodes = {},
  guestLinks = {},
}: {
  theses: Thesis[];
  episodeLinks?: Record<string, string | null>;
  episodes?: Record<string, EpisodeMeta>;
  guestLinks?: Record<string, string>;
}) {
  const allSorted = useMemo(
    () => theses.slice().sort((a, b) => a.episodeDate.localeCompare(b.episodeDate)),
    [theses],
  );
  const defaultSorted = useMemo(() => allSorted.filter(isDefaultTimelineTake), [allSorted]);
  const [mode, setMode] = useState<TimelineMode>("signal");
  const sorted = mode === "signal" && defaultSorted.length > 0 ? defaultSorted : allSorted;
  const [sel, setSel] = useState(Math.max(0, sorted.length - 1));
  const selectedIndex = Math.min(sel, Math.max(0, sorted.length - 1));
  const t = sorted[selectedIndex];
  const hasFilter = defaultSorted.length > 0 && defaultSorted.length < allSorted.length;
  const hiddenCount = allSorted.length - defaultSorted.length;
  const allMentionsLabel = hiddenCount > 0 ? `All mentions +${hiddenCount}` : "All mentions";

  // Measure the track so the minimum dot gap can be set in real pixels (a %-only
  // gap overlaps on narrow screens and over-spreads on wide ones).
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    setTrackW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setTrackW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Time-proportional x positions (2%..98%), with a minimum gap so clustered
  // takes stay separately clickable.
  const { xs, years } = useMemo(() => {
    if (sorted.length === 0) return { xs: [], years: [] };
    const t0 = Date.parse(sorted[0].episodeDate);
    const t1 = Date.parse(sorted[sorted.length - 1].episodeDate);
    const span = Math.max(t1 - t0, 1);
    // ~18px centre-to-centre clears a 10px dot plus its conviction/selection halo
    // (≈17–19px); derived from the measured width, capped so a phone-width track
    // still fits the whole run.
    const minGap = trackW > 0 ? Math.min((18 / trackW) * 100, 6.5) : 2.2;
    const xs = sorted.map((th) => 2 + 96 * ((Date.parse(th.episodeDate) - t0) / span));
    // Push crowded dots right; if the run spills past the right edge, relax it
    // back to the left so the whole cluster stays on-track and un-stacked.
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - xs[i - 1] < minGap) xs[i] = xs[i - 1] + minGap;
    }
    if (xs.length > 1 && xs[xs.length - 1] > 98) {
      xs[xs.length - 1] = 98;
      for (let i = xs.length - 2; i >= 0; i--) {
        if (xs[i + 1] - xs[i] < minGap) xs[i] = xs[i + 1] - minGap;
      }
    }
    const years: Array<{ x: number; label: string }> = [];
    if (span > 120 * 86400_000) {
      const y0 = new Date(t0).getUTCFullYear();
      const y1 = new Date(t1).getUTCFullYear();
      for (let y = y0 + 1; y <= y1; y++) {
        const ts = Date.UTC(y, 0, 1);
        if (ts > t0 && ts < t1) {
          years.push({ x: 2 + 96 * ((ts - t0) / span), label: "’" + String(y).slice(2) });
        }
      }
    }
    return { xs, years };
  }, [sorted, trackW]);

  const single = sorted.length === 1;

  return (
    <div>
      {hasFilter && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-800 dark:bg-neutral-950/70">
            {([
              ["signal", "Key calls"],
              ["all", allMentionsLabel],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  const nextSorted = value === "signal" && defaultSorted.length > 0 ? defaultSorted : allSorted;
                  setMode(value);
                  setSel(Math.max(0, nextSorted.length - 1));
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  mode === value
                    ? "bg-neutral-900 text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-950"
                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "signal" && <span className="text-xs text-neutral-500">{mentionCount(allSorted.length)} total</span>}
        </div>
      )}

      {/* The track */}
      <div ref={trackRef} className="relative h-12">
        <div className="absolute left-0 right-0 top-4 h-px bg-neutral-800" />
        {years.map((y) => (
          <div key={y.label}>
            <div
              className="absolute top-4 h-2.5 w-px -translate-x-1/2 bg-neutral-700"
              style={{ left: `${y.x}%` }}
            />
            <span
              className="absolute top-8 -translate-x-1/2 font-mono text-[10px] text-neutral-500"
              style={{ left: `${y.x}%` }}
            >
              {y.label}
            </span>
          </div>
        ))}
        {sorted.map((th, i) => {
          const c = STANCE_HEX[th.stance];
          const selected = i === selectedIndex;
          const dim = th.conviction === "low";
          return (
            <button
              key={th.id}
              type="button"
              onClick={() => setSel(i)}
              title={`${fmtDate(th.episodeDate)} — ${SENTIMENT[th.stance].label.toLowerCase()}${dim ? " (low conviction)" : ""}`}
              aria-label={`${fmtDate(th.episodeDate)} ${SENTIMENT[th.stance].label.toLowerCase()}`}
              className="absolute top-4 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 hover:scale-[1.6]"
              style={{
                left: `${single ? 50 : Math.max(2, Math.min(xs[i], 98))}%`,
                background: c,
                opacity: dim && !selected ? 0.45 : 1,
                boxShadow: selected
                  ? `0 0 0 2.5px var(--background), 0 0 0 4.5px ${c}`
                  : th.conviction === "high"
                    ? `0 0 0 3.5px ${c}2e`
                    : "none",
                zIndex: selected ? 2 : 1,
              }}
            />
          );
        })}
      </div>

      {/* The receipt */}
      {t && (
        <div className="rounded-xl bg-neutral-800/40 p-4 ring-1 ring-white/5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-neutral-500">
            {t.guestName && (
              <GuestName
                name={t.guestName}
                slug={guestLinks[t.guestName]}
                className="font-semibold text-neutral-100"
              />
            )}
            <SentimentBadge stance={t.stance} />
            <ConvictionDots conviction={t.conviction} />
            <Link
              href={`/episode/${t.episodeId}`}
              className="font-mono text-[11px] hover:text-neutral-200 hover:underline"
              title="All calls from this episode"
            >
              {t.episodeNumber ? `E${t.episodeNumber}` : t.episodeId}
            </Link>
            <span>{fmtDate(t.episodeDate)}</span>
            {isPortfolioScored(t) && (
              <span
                className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/25"
                title="A clear in/out call, ranked pick, or investment selection — this take trades in the money simulations. Everything else is view/commentary."
              >
                📌 scored call
              </span>
            )}
            {t.attributionConfidence === "low" && (
              <span
                className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 ring-1 ring-inset ring-white/10"
                title="Speaker attribution unverified — this take is shown but doesn't score."
              >
                unverified · not scored
              </span>
            )}
            {(episodes[t.episodeId]?.audioUrl || episodeLinks[t.episodeId]) && (
              <span className="ml-auto">
                <ListenButton
                  meta={episodes[t.episodeId]}
                  episodeId={t.episodeId}
                  startMs={t.quoteStartMs}
                  caption={`${t.host} on ${t.company}`}
                  fallbackLink={episodeLinks[t.episodeId]}
                />
              </span>
            )}
            <a
              href={`mailto:me@danreynolds.ca?subject=${encodeURIComponent(`All-Index take report: ${t.id}`)}&body=${encodeURIComponent(`Take ${t.id} (${t.host} on ${t.company}, ${t.episodeId}) looks wrong because: `)}`}
              className={`${episodes[t.episodeId]?.audioUrl || episodeLinks[t.episodeId] ? "" : "ml-auto "}text-neutral-500 hover:text-neutral-300`}
              title="Report a problem with this take (misattributed, misquoted, mis-stanced)"
            >
              ⚑
            </a>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-200">{t.summary}</p>
          {t.quote && (
            <blockquote className="relative mt-3 pl-6 text-[13px] italic leading-relaxed text-neutral-400">
              <span
                aria-hidden
                className="absolute -top-1 left-0 font-display text-3xl leading-none text-emerald-500/35"
              >
                “
              </span>
              {t.quote}”
              {t.quoteStartMs != null && (
                <span className="ml-2 font-mono text-[11px] not-italic text-neutral-500">
                  {mmss(t.quoteStartMs)}
                </span>
              )}
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}
