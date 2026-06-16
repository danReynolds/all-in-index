"use client";

import { useState } from "react";
import { pct, returnColor, fmtDate, callVerdict } from "@/lib/format";
import { HostAvatar } from "@/app/components/host";
import { GuestName } from "@/app/components/GuestName";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { ListenButton } from "@/app/components/player";
import type { EpisodeMeta, Host } from "@/lib/types";

export interface FinPick {
  speaker: string;
  host: Host;
  guestSlug: string | null;
  category: string;
  pick: string;
  ticker: string | null;
  domain: string | null;
  direction: "up" | "down" | null;
  sinceReturn: number | null;
  quote: string;
  quoteStartMs: number | null;
  history: Array<[string, number]> | null;
}

export interface PredYear {
  year: number;
  episodeId: string;
  date: string;
  /** Every host's pick in the financial categories (graded + ungraded). */
  picks: FinPick[];
}

/** Display order for the financial categories; unknown categories sort last. */
const CATEGORY_ORDER = [
  "Best performing asset",
  "Worst performing asset",
  "Biggest business winner",
  "Biggest business loser",
];
const catRank = (c: string) => {
  const i = CATEGORY_ORDER.findIndex((x) => x.toLowerCase() === c.toLowerCase());
  return i === -1 ? CATEGORY_ORDER.length : i;
};

/** A pick is gradeable only if it maps to one ticker with a clear direction and price. */
function isGraded(p: FinPick): boolean {
  return !!p.ticker && !!p.direction && p.sinceReturn != null;
}

function verdictOf(p: FinPick): boolean | null {
  if (!p.direction || p.sinceReturn == null) return null;
  return callVerdict(p.direction === "up" ? "bull" : "bear", p.sinceReturn)?.right ?? null;
}

/** Year-aware verdict: a year still in progress is on/off track, a finished one
 *  is right/wrong. */
function verdictLabel(right: boolean | null, inProgress: boolean): { text: string; cls: string } {
  if (right === true)
    return {
      text: inProgress ? "On track" : "Right",
      cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    };
  if (right === false)
    return {
      text: inProgress ? "Off track" : "Wrong",
      cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    };
  return { text: inProgress ? "Too close" : "Flat", cls: "bg-white/5 text-neutral-400 ring-white/10" };
}

function PickChart({ history, up }: { history: Array<[string, number]>; up: boolean }) {
  if (history.length < 2) return null;
  const closes = history.map((h) => h[1]);
  const W = 320;
  const H = 76;
  const pad = 5;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (closes.length - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (H - 2 * pad) * (1 - (v - min) / span);
  const line = closes.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(closes.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  const stroke = up ? "#10b981" : "#f43f5e";
  const gid = `pg-${closes.length}-${Math.round(closes[0])}-${up ? "u" : "d"}`;
  const entryY = y(closes[0]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" role="img" aria-label="price since the call">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad} y1={entryY} x2={W - pad} y2={entryY} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="3 3" />
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function PredictionCard({ p, meta, episodeId, inProgress }: { p: FinPick; meta?: EpisodeMeta | null; episodeId: string; inProgress: boolean }) {
  const graded = isGraded(p);
  const right = verdictOf(p);
  const v = verdictLabel(right, inProgress);
  const accent = !graded ? "ring-white/10" : right === true ? "ring-emerald-500/25" : right === false ? "ring-rose-500/25" : "ring-white/10";
  // Chart line follows the actual price path (rose = green, fell = red) so its
  // color matches the line's slope and the return number below it; the verdict
  // pill alone carries on/off-track (a green line + "Off track" = right move,
  // wrong bet).
  const up = (p.sinceReturn ?? 0) >= 0;
  const hasChart = !!p.history && p.history.length > 1;
  const fromDate = p.history?.[0]?.[0];
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 ring-1 dark:border-neutral-800 dark:bg-neutral-900 ${accent}`}>
      {/* who + verdict */}
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2">
          <HostAvatar host={p.host} size="sm" />
          {p.host === "Guest" && p.guestSlug ? (
            <GuestName name={p.speaker} slug={p.guestSlug} className="text-sm font-semibold text-neutral-100" />
          ) : (
            <span className="text-sm font-semibold text-neutral-100">{p.speaker}</span>
          )}
        </span>
        {graded ? (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ring-1 ring-inset ${v.cls}`}>
            {right === true ? "✓ " : right === false ? "✗ " : ""}
            {v.text}
          </span>
        ) : (
          <span
            className="rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-neutral-400 dark:border-neutral-700"
            title="Not a single stock or fund — there's no price to track this pick on/off-track."
          >
            Not tracked
          </span>
        )}
      </div>

      {/* the pick */}
      <div>
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
          {p.category}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <CompanyLogo name={p.pick} domain={p.domain} size="md" className="rounded-lg" />
          <span className="min-w-0 font-display text-lg font-semibold leading-tight">{p.pick}</span>
          {p.ticker && (
            <span className="shrink-0 self-start rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800">
              {p.ticker}
            </span>
          )}
        </div>
      </div>

      {/* chart, or — for picks that aren't a single ticker — a matching untracked panel */}
      {hasChart ? (
        <div className="text-neutral-700 dark:text-neutral-600">
          <PickChart history={p.history!} up={up} />
          <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-500">
            <span>{fromDate ? fmtDate(fromDate) : "call"}</span>
            <span className={`font-mono text-sm font-semibold tabular-nums ${returnColor(p.sinceReturn)}`}>
              {pct(p.sinceReturn)}
            </span>
            <span>now</span>
          </div>
        </div>
      ) : (
        <div className="flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-200/80 px-4 text-center dark:border-neutral-800">
          <span className="text-xs font-medium text-neutral-500">A theme, not a single stock or fund</span>
          <span className="text-[11px] leading-snug text-neutral-500/70">No ticker to score it on-track / off-track against</span>
        </div>
      )}

      {/* the quote */}
      {p.quote && (
        <blockquote className="relative border-t border-neutral-100 pt-3 text-[13px] italic leading-relaxed text-neutral-500 dark:border-neutral-800/70 dark:text-neutral-400">
          <span className="line-clamp-3">“{p.quote}”</span>
          {meta?.audioUrl && p.quoteStartMs != null && (
            <span className="mt-1.5 block not-italic">
              <ListenButton meta={meta} episodeId={episodeId} startMs={p.quoteStartMs} caption={`${p.speaker} — ${p.category}`} />
            </span>
          )}
        </blockquote>
      )}
    </div>
  );
}

function CategoryBlock({
  title,
  picks,
  meta,
  episodeId,
  inProgress,
}: {
  title: string;
  picks: FinPick[];
  meta?: EpisodeMeta | null;
  episodeId: string;
  inProgress: boolean;
}) {
  const gradedCount = picks.filter(isGraded).length;
  // Graded picks first (best call → worst), then the untracked themes.
  const ordered = [...picks].sort((a, b) => {
    const ga = isGraded(a);
    const gb = isGraded(b);
    if (ga !== gb) return ga ? -1 : 1;
    if (ga && gb) {
      const adj = (x: FinPick) => (x.direction === "down" ? -(x.sinceReturn ?? 0) : x.sinceReturn ?? 0);
      return adj(b) - adj(a);
    }
    return 0;
  });
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-neutral-200/70 pb-2 dark:border-neutral-800">
        <h3 className="font-display text-lg font-semibold tracking-tight text-neutral-100">{title}</h3>
        <span className="shrink-0 text-xs text-neutral-500">
          {gradedCount > 0 ? `${gradedCount} of ${picks.length} tracked` : `${picks.length} picks · none tracked`}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {ordered.map((p, i) => (
          <PredictionCard key={i} p={p} meta={meta} episodeId={episodeId} inProgress={inProgress} />
        ))}
      </div>
    </section>
  );
}

export function PredictionsBoard({
  years,
  episodes,
  nowYear,
}: {
  years: PredYear[];
  episodes: Record<string, EpisodeMeta>;
  guestLinks: Record<string, string>;
  nowYear: number;
}) {
  const [active, setActive] = useState(years[0]?.year);
  const yr = years.find((y) => y.year === active) ?? years[0];
  if (!yr) return null;

  const inProgress = yr.year >= nowYear;
  const gradedAll = yr.picks.filter(isGraded);
  const good = gradedAll.filter((p) => verdictOf(p) === true).length;
  const bad = gradedAll.filter((p) => verdictOf(p) === false).length;
  const tooClose = gradedAll.length - good - bad;

  // Group every pick under its category, ordered by the show's flow.
  const groups: { title: string; picks: FinPick[] }[] = [];
  for (const p of yr.picks) {
    let g = groups.find((x) => x.title.toLowerCase() === p.category.toLowerCase());
    if (!g) {
      g = { title: p.category, picks: [] };
      groups.push(g);
    }
    g.picks.push(p);
  }
  groups.sort((a, b) => catRank(a.title) - catRank(b.title));

  return (
    <div className="space-y-8">
      {/* Year tabs */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-800 dark:bg-neutral-950/70">
        {years.map((y) => (
          <button
            key={y.year}
            type="button"
            onClick={() => setActive(y.year)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              y.year === active
                ? "bg-neutral-900 text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-950"
                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            }`}
          >
            {y.year}
            {y.year >= nowYear && (
              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-emerald-500">live</span>
            )}
          </button>
        ))}
      </div>

      {/* Year summary */}
      <p className="text-sm text-neutral-500">
        Market picks for <strong className="text-neutral-200">{yr.year}</strong>
        {inProgress ? " — still playing out, scored against the market so far." : ", graded against the market."}{" "}
        {gradedAll.length > 0 && (
          <>
            <span className="text-emerald-400">
              {good} {inProgress ? "on track" : "right"}
            </span>{" "}
            ·{" "}
            <span className="text-rose-400">
              {bad} {inProgress ? "off track" : "wrong"}
            </span>
            {tooClose > 0 && (
              <>
                {" "}
                · <span className="text-neutral-400">{tooClose} too close</span>
              </>
            )}{" "}
            of {gradedAll.length} tracked.{" "}
          </>
        )}
        <span>Themes, baskets, and private companies are shown too, but can&rsquo;t be tracked against a single ticker.</span>
      </p>

      {/* One section per category — all four hosts' picks, graded where possible */}
      {groups.map((g) => (
        <CategoryBlock
          key={g.title}
          title={g.title}
          picks={g.picks}
          meta={episodes[yr.episodeId]}
          episodeId={yr.episodeId}
          inProgress={inProgress}
        />
      ))}
    </div>
  );
}
