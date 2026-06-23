"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { EpisodeMeta, IndexFundPoint, TradeDirection } from "@/lib/types";
import type { TradeEventTake } from "@/lib/projections";
import { fmtDate } from "@/lib/format";
import { StanceBadge } from "@/app/components/badges";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { ListenButton } from "@/app/components/player";
import { sectorProxyInfo } from "@/lib/proxies";
import { proxyAssetKind } from "@/lib/assets";

const fadeAt = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

export interface TradeEvent {
  date: string;
  ticker: string;
  slug: string;
  company: string;
  domain?: string | null;
  kind: "in" | "out" | "reaffirm";
  direction?: TradeDirection;
  /** The position call behind this trade — shown when the marker is clicked. */
  take?: TradeEventTake | null;
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

interface PlottedTradeEvent extends TradeEvent {
  id: string;
  cx: number;
  cy: number;
  seriesIndex: number;
}

interface MarkerGroup {
  id: string;
  cx: number;
  cy: number;
  labelY: number;
  markers: PlottedTradeEvent[];
}

// Colour carries DIRECTION (the signal that matters): a long entry is emerald,
// a short is rose, a closed position is muted. Drives the on-line dots.
function eventColor(e: Pick<TradeEvent, "kind" | "direction">): string {
  if (e.kind === "out") return "#71717a";
  return e.direction === "short" ? "#fb7185" : "#34d399";
}

function eventAction(e: Pick<TradeEvent, "kind" | "direction">): string {
  if (e.kind === "out") return "closed call";
  if (e.kind === "reaffirm") return "added to call";
  return e.direction === "short" ? "opened short" : "opened long";
}

// Trailing mark on a pill. A long entry is the default for this index, so it
// stays clean; a short gets a rose tag so the rare contrarian bet pops; a
// close/add reads as a muted ×/+.
function EventMark({ e }: { e: Pick<TradeEvent, "kind" | "direction"> }) {
  if (e.kind === "in") {
    return e.direction === "short" ? (
      <span className="rounded-sm bg-rose-500/15 px-1 py-px text-[8px] font-bold uppercase tracking-[0.08em] text-rose-300">
        short
      </span>
    ) : null;
  }
  return <span className="font-mono text-[11px] text-neutral-500">{e.kind === "out" ? "×" : "+"}</span>;
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
  const [sel, setSel] = useState<string | null>(null);
  const W = 800;
  const H = 300;
  const padL = 44;
  // Wide enough for the end-of-line value labels (e.g. "+176.7%") not to clip.
  const padR = 64;
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
  // then merge dense neighborhoods into clickable chips. The chip carries the
  // labels/logos; the SVG only keeps low-noise stems and direction dots.
  const nearestIdx = (date: string) => {
    let best = 0;
    for (let i = 0; i < series.length; i++) {
      if (series[i].date <= date) best = i;
      else break;
    }
    return best;
  };
  const plotted = events
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e, idx): PlottedTradeEvent => {
      const i = nearestIdx(e.date);
      return { ...e, id: `${e.slug}-${e.date}-${e.kind}-${idx}`, cx: x(i), cy: y(pf[i]), seriesIndex: i };
    });

  const markerGroups = (() => {
    const grouped: PlottedTradeEvent[][] = [];
    for (const marker of plotted) {
      const prev = grouped[grouped.length - 1];
      const anchor = prev?.[prev.length - 1];
      if (anchor && Math.abs(marker.cx - anchor.cx) < 42 && Math.abs(marker.cy - anchor.cy) < 64) {
        prev.push(marker);
      } else {
        grouped.push([marker]);
      }
    }
    const groups = grouped.map((markers, idx): MarkerGroup => {
      const cx = markers.reduce((sum, m) => sum + m.cx, 0) / markers.length;
      const cy = markers.reduce((sum, m) => sum + m.cy, 0) / markers.length;
      return {
        id: `group-${idx}-${markers.map((m) => m.id).join("-")}`,
        cx: Math.max(padL + 12, Math.min(W - padR - 12, cx)),
        cy,
        labelY: Math.max(padT + 16, cy - 38),
        markers,
      };
    });
    // De-collide label chips: when two chips sit within ~a chip-width of each
    // other horizontally, stack the later one into the next vertical lane so
    // labels never overlap (groups are already in left-to-right order).
    const CHIP_W = 84;
    const LANE_H = 32;
    const laneLastCx: number[] = [];
    for (const g of groups) {
      let lane = 0;
      while (lane < laneLastCx.length && g.cx - laneLastCx[lane] < CHIP_W) lane++;
      laneLastCx[lane] = g.cx;
      g.labelY = Math.max(padT + 14, g.labelY - lane * LANE_H);
    }
    return groups;
  })();

  const selected = sel ? plotted.find((m) => m.id === sel) ?? null : null;
  const selectedGroup = selected
    ? markerGroups.find((g) => g.markers.some((m) => m.id === selected.id)) ?? null
    : null;
  const selectedStats = selected ? positionStats[selected.slug] : null;

  // For a proxied basket/commodity/sector call, the ticker is an ETF stand-in,
  // not the thing itself — so we name what it is and why we chose it, rather
  // than leaving a bare ticker the reader can't decode.
  const proxyKind = selected ? proxyAssetKind(selected.ticker) : null;
  const proxyInfo = selected ? sectorProxyInfo(selected.ticker) : null;
  const isProxy = proxyKind != null;
  const proxyLabel =
    proxyInfo?.name ??
    (proxyKind === "crypto" ? "Crypto ETF proxy" : proxyKind === "commodity" ? "Commodity ETF proxy" : "Sector ETF proxy");

  return (
    <div>
    <div className="relative">
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label="Index vs benchmark cumulative return">
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

      {/* grouped trade anchors on the portfolio line */}
      {markerGroups.map((g) => {
        const isSel = selectedGroup?.id === g.id;
        const dotGap = 7;
        const startX = g.cx - ((g.markers.length - 1) * dotGap) / 2;
        return (
          <g
            key={g.id}
            className="marker-pop"
            style={{ "--d": `${Math.min(1000 + g.markers[0].seriesIndex * 28, 1900)}ms` } as CSSProperties}
          >
            <line x1={g.cx} y1={g.labelY + 15} x2={g.cx} y2={g.cy - 5} stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
            {g.markers.map((m, markerIdx) => (
              <circle
                key={m.id}
                cx={startX + markerIdx * dotGap}
                cy={g.cy}
                r={isSel ? 4.2 : 3.3}
                fill={eventColor(m)}
                stroke={isSel ? "#fff" : "rgba(7,11,9,0.75)"}
                strokeWidth="1.4"
              />
            ))}
            <title>
              {g.markers.length === 1
                ? `${g.markers[0].ticker} — ${eventAction(g.markers[0])} ${fmtDate(g.markers[0].date)}`
                : `${g.markers.length} calls near ${fmtDate(g.markers[0].date)}`}
            </title>
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
    <div className="pointer-events-none absolute inset-0">
      {markerGroups.map((g, idx) => {
        const selectedInGroup = selectedGroup?.id === g.id;
        const first = g.markers[0];
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => setSel(selectedInGroup ? null : first.id)}
            className={`marker-pop pointer-events-auto absolute inline-flex min-h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border bg-neutral-950/90 px-1.5 py-1 text-[10px] font-semibold text-neutral-100 shadow-lg shadow-black/30 backdrop-blur transition hover:border-white/30 ${
              selectedInGroup ? "border-white/40 ring-2 ring-white/20" : "border-white/10"
            }`}
            style={{
              left: `${(g.cx / W) * 100}%`,
              top: `${(g.labelY / H) * 100}%`,
              "--d": `${Math.min(950 + idx * 70, 1800)}ms`,
            } as CSSProperties}
            aria-label={
              g.markers.length === 1
                ? `${first.company} ${eventAction(first)} on ${fmtDate(first.date)}`
                : `${g.markers.length} calls near ${fmtDate(first.date)}`
            }
            title={
              g.markers.length === 1
                ? `${first.ticker} — ${eventAction(first)} ${fmtDate(first.date)}`
                : `${g.markers.length} calls near ${fmtDate(first.date)}`
            }
          >
            {g.markers.length === 1 ? (
              <>
                <span className="relative inline-flex">
                  <CompanyLogo
                    name={first.company}
                    domain={first.domain}
                    size="sm"
                    className="h-[18px] w-[18px] rounded-full ring-1 ring-neutral-950"
                  />
                </span>
                <span className="font-mono">{first.ticker}</span>
                <EventMark e={first} />
              </>
            ) : (
              <>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/10 px-1.5 font-mono text-[10px]">
                  {g.markers.length}
                </span>
                <span className="text-[9px] uppercase tracking-[0.12em] text-neutral-300">calls</span>
                <span className="ml-0.5 flex items-center gap-0.5">
                  {g.markers.slice(0, 6).map((m) => (
                    <span
                      key={m.id}
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full ring-1 ring-neutral-950"
                      style={{ background: eventColor(m) }}
                    />
                  ))}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
    </div>

    {/* The receipt behind the selected trade — pops in once, content swaps in place after. */}
    {selected && (
      <div className="pop-in mt-3 rounded-xl bg-neutral-800/40 p-4 text-sm ring-1 ring-white/5">
        {selectedGroup && selectedGroup.markers.length > 1 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-white/5 pb-3">
            <span className="mr-1 text-[11px] uppercase tracking-[0.14em] text-neutral-500">
              {selectedGroup.markers.length} calls
            </span>
            {selectedGroup.markers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSel(m.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition ${
                  selected.id === m.id
                    ? "border-white/35 bg-white/10 text-neutral-100"
                    : "border-white/10 text-neutral-400 hover:border-white/25 hover:text-neutral-100"
                }`}
              >
                <span className="relative inline-flex">
                  <CompanyLogo name={m.company} domain={m.domain} size="sm" className="h-[18px] w-[18px] rounded-full" />
                </span>
                <span className="font-mono">{m.ticker}</span>
                <EventMark e={m} />
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-neutral-500">
          <CompanyLogo name={selected.company} domain={selected.domain} size="md" className="rounded-lg" />
          <Link href={`/holding/${selected.slug}`} className="font-semibold text-neutral-100 hover:underline">
            {selected.company}
          </Link>
          {!isProxy && <span className="font-mono text-[11px] text-neutral-500">{selected.ticker}</span>}
          {selected.take && (
            <StanceBadge
              stance={selected.take.stance}
              tone={selectedStats ? "outcome" : "neutral"}
              outcome={selectedStats?.ret}
            />
          )}
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
                <span aria-hidden className="absolute -top-1 left-0 font-display text-3xl leading-none text-neutral-500/35">
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

        {/* Proxied call: the ticker is an ETF stand-in, so name it and explain
            the pick + its limits up front (progressive-disclosure, no overlay). */}
        {isProxy && (
          <details
            key={selected.id}
            className="group/px mt-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 open:bg-white/[0.035] [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs">
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">{selected.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-neutral-300">{proxyLabel}</span>
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-neutral-500 transition group-hover/px:text-neutral-300">
                Why this proxy?
                <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 fill-none stroke-current transition-transform group-open/px:rotate-180" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M1 1l4 4 4-4" />
                </svg>
              </span>
            </summary>
            <p className="mt-2 border-t border-white/5 pt-2 text-[11px] leading-relaxed text-neutral-400">
              {proxyInfo ? (
                <>
                  <span className="text-neutral-300">{selected.company}</span> isn&apos;t a single stock, so it&apos;s scored against{" "}
                  <span className="font-mono text-neutral-300">{selected.ticker}</span>. {proxyInfo.what}{" "}It&apos;s only an approximation — the
                  ETF holds names they never mentioned and the theme can move differently, so read it as a directional gut-check, not a precise
                  scorecard.
                </>
              ) : (
                <>
                  <span className="text-neutral-300">{selected.company}</span> is a {proxyKind}, not a company, so it&apos;s priced via the{" "}
                  <span className="font-mono text-neutral-300">{selected.ticker}</span> ETF — a clean, liquid stand-in that lets the call be
                  tracked. The proxy can drift from the underlying.
                </>
              )}
            </p>
          </details>
        )}

        {/* What the call DID: this name's windowed performance and its exact
            share of the headline number (equal weight ⇒ return ÷ N). */}
        {(() => {
          const stats = selectedStats;
          if (!stats) return null;
          const pp = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "pp";
          const tile = (
            label: string,
            value: string,
            tone: number | null,
            detail?: string,
          ) => (
            <div className="rounded-md bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">{label}</div>
              <div
                className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
                  tone == null ? "text-neutral-200" : tone >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {value}
              </div>
              {detail && <div className="mt-0.5 text-[11px] leading-snug text-neutral-500">{detail}</div>}
            </div>
          );
          return (
            <div className="mt-4 rounded-lg bg-neutral-950/35 p-3 ring-1 ring-white/5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                  {isProxy ? `How ${selected.ticker} tracked this call` : "Selected company performance"}
                </div>
                <Link
                  href={`/holding/${selected.slug}`}
                  className="group/full inline-flex items-center gap-1 text-xs text-neutral-400 transition hover:text-neutral-100"
                >
                  Full history
                  <span aria-hidden className="transition-transform group-hover/full:translate-x-0.5">→</span>
                </Link>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {tile(
                  `${selected.ticker} call return`,
                  fmtPct(stats.ret),
                  stats.ret,
                  "since this call",
                )}
                {tile("S&P, same dates", fmtPct(stats.bench), stats.bench, "what the S&P did")}
                {tile("Alpha", pp(stats.alpha), stats.alpha, "beat the S&P by")}
                {portfolioReturn != null &&
                  tile(
                    "Share of the total",
                    pp(stats.contribPp),
                    stats.contribPp,
                    `of ${fmtPct(portfolioReturn)} overall`,
                  )}
              </div>
            </div>
          );
        })()}
      </div>
    )}
    </div>
  );
}
