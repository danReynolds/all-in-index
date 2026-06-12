"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { EpisodeMeta, IndexFundPoint, Thesis, TradeDirection } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { StanceBadge } from "@/app/components/badges";
import { ListenButton } from "@/app/components/player";

const fadeAt = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

function ReceiptStat({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  /** Signed number to color the value by; omit for neutral. */
  tone?: number;
  title?: string;
}) {
  return (
    <div title={title}>
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">{label}</div>
      <div
        className={`font-mono text-sm font-semibold tabular-nums ${
          tone == null ? "text-neutral-200" : tone >= 0 ? "text-emerald-400" : "text-rose-400"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export interface TradeEvent {
  date: string;
  ticker: string;
  slug: string;
  kind: "in" | "out";
  direction?: TradeDirection;
  /** The position call behind this trade — shown when the marker is clicked. */
  take?: Thesis | null;
}

interface Props {
  series: IndexFundPoint[];
  benchmarkSymbol: string;
  /** Legend label for the portfolio line. */
  label?: string;
  /** Optional entry/exit markers rendered on the portfolio line. */
  events?: TradeEvent[];
  /** Episode links for the receipt card's Listen link. */
  episodeLinks?: Record<string, string | null>;
  /** Episode metadata (incl. audio) for the in-page quote player. */
  episodes?: Record<string, EpisodeMeta>;
  /** Per-slug performance of each traded name, shown on the receipt. */
  positionStats?: Record<string, PositionStat>;
  /** The fund's headline return — context for each name's contribution. */
  portfolioReturn?: number;
}

export interface PositionStat {
  /** The name's return over this host's call windows. */
  ret: number;
  /** S&P over the identical windows. */
  bench: number;
  alpha: number;
  /** Exact share of the portfolio's return (equal-weight: ret / N). */
  contribPp: number;
}

/** Two-line cumulative-return chart: the index vs its benchmark, both from 0%. */
export function IndexChart({
  series,
  benchmarkSymbol,
  label = "Besties Index",
  events = [],
  episodeLinks = {},
  episodes = {},
  positionStats = {},
  portfolioReturn,
}: Props) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 800;
  const H = 300;
  const padL = 44;
  const padR = 56;
  const padT = 16;
  const padB = 28;

  const ret = (v: number, inv: number) => (inv > 0 ? v / inv - 1 : 0);
  const pf = series.map((p) => ret(p.portfolio, p.invested));
  const bm = series.map((p) => ret(p.benchmark, p.invested));

  const all = [...pf, ...bm, 0];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;

  const x = (i: number) => padL + (i / (series.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);

  const path = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const pfPath = path(pf);
  const bmPath = path(bm);
  const areaPath = `${pfPath} L${x(series.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;

  const zeroY = y(0);
  const lastPf = pf[pf.length - 1];
  const lastBm = bm[bm.length - 1];
  const fmtPct = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";

  // Place trade markers on the portfolio line at the nearest series point,
  // staggering labels that land on the same spot.
  const nearestIdx = (date: string) => {
    let best = 0;
    for (let i = 0; i < series.length; i++) {
      if (series[i].date <= date) best = i;
      else break;
    }
    return best;
  };
  const labelSlots = new Map<number, number>();
  const markers = events
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const i = nearestIdx(e.date);
      const slot = labelSlots.get(i) ?? 0;
      labelSlots.set(i, slot + 1);
      return { ...e, cx: x(i), cy: y(pf[i]), slot };
    });

  const selected = sel != null ? markers[sel] : null;

  return (
    <div>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Index vs benchmark cumulative return">
      <defs>
        <linearGradient id="pfFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* zero baseline */}
      <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="currentColor" strokeOpacity="0.18" strokeDasharray="4 4" />
      <text x={padL - 6} y={zeroY + 3} textAnchor="end" className="fill-neutral-400" fontSize="11">0%</text>
      <text x={padL - 6} y={y(max) + 3} textAnchor="end" className="fill-neutral-400" fontSize="11">{fmtPct(max)}</text>

      {/* benchmark (neutral, dashed) — fades in while the index line draws */}
      <path d={bmPath} fill="none" stroke="#9ca3af" strokeWidth="1.75" strokeDasharray="5 4" className="chart-fade" style={fadeAt(0.5)} />
      {/* portfolio (emerald) */}
      <path d={areaPath} fill="url(#pfFill)" stroke="none" className="chart-fade" style={fadeAt(0.9)} />
      <path d={pfPath} fill="none" stroke="#10b981" strokeWidth="2.25" strokeLinejoin="round" pathLength={1} className="chart-draw" />

      {/* trade markers (entries/exits) on the portfolio line — click for the take */}
      {markers.map((m, idx) => {
        const direction = m.direction ?? "long";
        const isShort = direction === "short";
        const c = m.kind === "out" ? "#94a3b8" : isShort ? "#f43f5e" : "#10b981";
        const marker = m.kind === "out" ? "×" : isShort ? "▼" : "▲";
        const action = m.kind === "out" ? `closed ${direction}` : `opened ${direction}`;
        const isSel = sel === idx;
        const labelY = m.cy - 12 - m.slot * 11;
        return (
          <g
            key={`${m.ticker}-${m.date}-${idx}`}
            className="marker-pop cursor-pointer"
            style={{ "--d": `${Math.min(1000 + idx * 80, 1900)}ms` } as CSSProperties}
            onClick={() => setSel(isSel ? null : idx)}
          >
            <line x1={m.cx} y1={labelY + 3} x2={m.cx} y2={m.cy - 4} stroke={c} strokeWidth="1" strokeOpacity="0.35" />
            <circle
              cx={m.cx}
              cy={m.cy}
              r={isSel ? 6 : 4}
              fill={c}
              stroke={isSel ? "#fff" : "rgba(7,11,9,0.7)"}
              strokeWidth="1.5"
            />
            <text x={m.cx} y={labelY} textAnchor="middle" fontSize="9" fontWeight="700" fill={c}>
              {m.ticker} {marker}
            </text>
            <title>{`${m.ticker} — ${action} ${fmtDate(m.date)} · click for the take`}</title>
          </g>
        );
      })}

      {/* end labels */}
      <text x={W - padR + 5} y={y(lastPf) + 4} className="chart-fade fill-emerald-600 dark:fill-emerald-400" style={fadeAt(1.2)} fontSize="12" fontWeight="600">
        {fmtPct(lastPf)}
      </text>
      <text x={W - padR + 5} y={y(lastBm) + 4} className="chart-fade fill-neutral-400" style={fadeAt(1.2)} fontSize="11">
        {fmtPct(lastBm)}
      </text>

      {/* x range */}
      <text x={padL} y={H - 8} className="fill-neutral-400" fontSize="11">{fmtDate(series[0].date)}</text>
      <text x={W - padR} y={H - 8} textAnchor="end" className="fill-neutral-400" fontSize="11">{fmtDate(series[series.length - 1].date)}</text>

      {/* legend */}
      <g transform={`translate(${padL + 6}, ${padT + 4})`}>
        <line x1="0" y1="0" x2="16" y2="0" stroke="#10b981" strokeWidth="2.25" />
        <text x="22" y="4" className="fill-neutral-500" fontSize="11">{label}</text>
        <line x1="120" y1="0" x2="136" y2="0" stroke="#9ca3af" strokeWidth="1.75" strokeDasharray="5 4" />
        <text x="142" y="4" className="fill-neutral-500" fontSize="11">S&amp;P ({benchmarkSymbol})</text>
      </g>
    </svg>

    {/* The receipt behind the selected trade — pops in once, content swaps in place after. */}
    {selected && (
      <div className="pop-in mt-3 rounded-xl bg-neutral-800/40 p-4 text-sm ring-1 ring-white/5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-neutral-500">
          <Link href={`/holding/${selected.slug}`} className="font-semibold text-neutral-100 hover:underline">
            {selected.ticker}
          </Link>
          <span
            className={`font-semibold ${
              selected.kind === "out"
                ? "text-neutral-400"
                : selected.direction === "short"
                  ? "text-rose-400"
                  : "text-emerald-400"
            }`}
          >
            {selected.kind === "in"
              ? selected.direction === "short"
                ? "▼ opened short"
                : "▲ opened long"
              : "× closed"}
          </span>
          {selected.take && <StanceBadge stance={selected.take.stance} />}
          {selected.take && (
            <Link
              href={`/episode/${selected.take.episodeId}`}
              className="font-mono text-[11px] hover:text-neutral-200 hover:underline"
              title="All takes from this episode"
            >
              {selected.take.episodeNumber ? `E${selected.take.episodeNumber}` : selected.take.episodeId}
            </Link>
          )}
          <span>{fmtDate(selected.date)}</span>
          {selected.take &&
            (episodes[selected.take.episodeId]?.audioUrl ||
              episodeLinks[selected.take.episodeId]) && (
              <span className="ml-auto">
                <ListenButton
                  meta={episodes[selected.take.episodeId]}
                  episodeId={selected.take.episodeId}
                  startMs={selected.take.quoteStartMs}
                  caption={`${selected.take.host} on ${selected.take.company}`}
                  fallbackLink={episodeLinks[selected.take.episodeId]}
                />
              </span>
            )}
        </div>
        {selected.take ? (
          <>
            <p className="mt-2.5 leading-relaxed text-neutral-200">{selected.take.summary}</p>
            {selected.take.quote && (
              <blockquote className="relative mt-3 pl-6 text-[13px] italic leading-relaxed text-neutral-400">
                <span aria-hidden className="absolute -top-1 left-0 font-display text-3xl leading-none text-emerald-500/35">
                  “
                </span>
                {selected.take.quote}”
              </blockquote>
            )}
          </>
        ) : (
          <p className="mt-2.5 text-neutral-400">
            No stored take for this trade event — see the holding page for the full history.
          </p>
        )}

        {/* What the call DID: this name's windowed performance and its exact
            share of the headline number (equal weight ⇒ return ÷ N). */}
        {(() => {
          const stats = positionStats[selected.slug];
          if (!stats) return null;
          const pp = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "pp";
          return (
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/5 pt-3">
              <ReceiptStat label="This exposure" value={fmtPct(stats.ret)} tone={stats.ret} />
              <ReceiptStat label="S&P same exposure" value={fmtPct(stats.bench)} />
              <ReceiptStat label="Alpha" value={pp(stats.alpha)} tone={stats.alpha} />
              {portfolioReturn != null && (
                <ReceiptStat
                  label={`Of the ${fmtPct(portfolioReturn)} total`}
                  value={pp(stats.contribPp)}
                  tone={stats.contribPp}
                  title="Equal weight: every name gets $1,000, so this name's return ÷ number of exposures is exactly its share of the portfolio's return."
                />
              )}
            </div>
          );
        })()}
      </div>
    )}
    </div>
  );
}
