"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { fmtDate, fmtMoney, mmss, pct } from "@/lib/format";
import { StanceBadge } from "@/app/components/badges";
import { HostAvatar } from "@/app/components/host";
import { GuestName } from "@/app/components/GuestName";
import { ListenButton } from "@/app/components/player";
import { HOST_UI } from "@/lib/hosts";
import type { EpisodeMeta, Host, Thesis, Stance, MarketData } from "@/lib/types";

const STANCE_LABELS: Record<Stance, string> = {
  bull: "Bullish",
  bear: "Bearish",
  mixed: "Mixed",
  neutral: "Neutral",
};

const fadeAt = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

/** First take per host + every take where that host's stance changed. */
function stanceChangesOnly(theses: Thesis[]): Thesis[] {
  const byHost = new Map<string, Thesis[]>();
  for (const t of theses) {
    (byHost.get(t.host) ?? byHost.set(t.host, []).get(t.host)!).push(t);
  }
  const keep: Thesis[] = [];
  for (const arr of byHost.values()) {
    arr.sort((a, b) => a.episodeDate.localeCompare(b.episodeDate));
    for (let i = 0; i < arr.length; i++) {
      if (i === 0 || arr[i].stance !== arr[i - 1].stance) keep.push(arr[i]);
    }
  }
  return keep;
}

function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div className="inline-flex rounded-full bg-neutral-900/70 p-0.5 text-xs ring-1 ring-inset ring-white/10">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-full px-2.5 py-1 transition-all active:scale-95 ${
            v === value
              ? "bg-neutral-100 font-medium text-neutral-900"
              : "text-neutral-400 hover:text-neutral-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

interface PlottedMarker {
  id: string;
  thesis: Thesis;
  x: number;
  lineY: number;
  labelY: number;
  price: number;
  returnSince: number;
  outcome: number | null;
  seriesIndex: number;
}

interface MarkerGroup {
  id: string;
  x: number;
  lineY: number;
  labelY: number;
  markers: PlottedMarker[];
}

function returnTextClass(ret: number | null | undefined): string {
  if (ret == null) return "text-neutral-300";
  return ret >= 0 ? "text-emerald-400" : "text-rose-400";
}

function returnChipClass(ret: number | null | undefined, selected = false): string {
  if (ret == null) {
    return selected
      ? "border-white/35 bg-white/10 text-neutral-100 ring-2 ring-white/20"
      : "border-white/10 bg-neutral-950/90 text-neutral-100";
  }
  if (ret >= 0) {
    return selected
      ? "border-emerald-300/60 bg-emerald-500/15 text-emerald-100 ring-2 ring-emerald-300/25"
      : "border-emerald-400/35 bg-emerald-500/10 text-emerald-300";
  }
  return selected
    ? "border-rose-300/60 bg-rose-500/15 text-rose-100 ring-2 ring-rose-300/25"
    : "border-rose-400/35 bg-rose-500/10 text-rose-300";
}

function returnRingClass(ret: number | null | undefined): string {
  if (ret == null) return "ring-white/20";
  return ret >= 0 ? "ring-emerald-400/45" : "ring-rose-400/45";
}

function callOutcome(stance: Stance, stockReturn: number): number | null {
  if (stance === "bull") return stockReturn;
  if (stance === "bear") return -stockReturn;
  return null;
}

// A since-return only reads as a green/red VERDICT when there was a directional
// call. Neutral/mixed takes aren't calls, so their move is gray context — never
// painted red/green (a red chip on a neutral take looks like a bad call).
function verdictRet(stance: Stance, ret: number | null | undefined): number | null {
  if (ret == null) return null;
  return stance === "bull" || stance === "bear" ? ret : null;
}
const isDirectional = (stance: Stance) => stance === "bull" || stance === "bear";

function speakerName(t: Thesis): string {
  return t.guestName ?? (t.host === "Guest" ? "Guest" : t.host);
}

/**
 * The stock's price with each call plotted at the moment it was made —
 * chip = speaker + performance. Click a chip to see the quote and move since the call.
 */
export function PriceChart({
  history,
  theses,
  ticker,
  market,
  episodeLinks = {},
  episodes = {},
  guestLinks = {},
}: {
  history: Array<[string, number]>;
  theses: Thesis[];
  ticker: string;
  market?: MarketData | null;
  episodeLinks?: Record<string, string | null>;
  episodes?: Record<string, EpisodeMeta>;
  guestLinks?: Record<string, string>;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"flips" | "all">("all");
  const [active, setActive] = useState<Host[]>(["Chamath", "Jason", "Sacks", "Friedberg", "Guest", "Unknown"]);
  const [activeStances, setActiveStances] = useState<Stance[]>(["bull", "bear", "mixed", "neutral"]);
  if (history.length < 2) return null;

  // Only offer chips for speakers who actually have takes on this name.
  const presentHosts = (["Chamath", "Jason", "Sacks", "Friedberg", "Guest", "Unknown"] as Host[]).filter(
    (h) => theses.some((t) => t.host === h),
  );
  const toggleHost = (h: Host) =>
    setActive((a) => (a.includes(h) ? a.filter((x) => x !== h) : [...a, h]));
  const toggleStance = (s: Stance) =>
    setActiveStances((a) => (a.includes(s) ? a.filter((x) => x !== s) : [...a, s]));

  const scoped = theses.filter((t) => active.includes(t.host));
  // Stance filter applies AFTER the stance-change reduction, so "Stance changes" + bear
  // shows the moments hosts turned bearish, not flips within bear-only takes.
  const modeScoped = mode === "flips" ? stanceChangesOnly(scoped) : scoped;
  const shown = modeScoped.filter((t) => activeStances.includes(t.stance));

  const W = 840;
  const H = 300;
  const padL = 46;
  // Room for the end-of-line total-return label (e.g. "+85.8%") so it can't clip.
  const padR = 60;
  const padT = 40;
  const padB = 26;

  const times = history.map(([d]) => Date.parse(d));
  const closes = history.map(([, c]) => c);
  const minT = times[0];
  const maxT = times[times.length - 1];
  const minP = Math.min(...closes);
  const maxP = Math.max(...closes);
  const spanP = maxP - minP || 1;
  const latestDate = history[history.length - 1][0];
  const latestClose = closes[closes.length - 1];
  const firstClose = closes[0];
  const totalReturn = firstClose > 0 ? latestClose / firstClose - 1 : 0;
  const lineColor = totalReturn >= 0 ? "#10b981" : "#f43f5e";

  const x = (t: number) => padL + ((t - minT) / (maxT - minT || 1)) * (W - padL - padR);
  const y = (p: number) => padT + (1 - (p - minP) / spanP) * (H - padT - padB);

  const closeAt = (t: number): number => {
    if (t <= times[0]) return closes[0];
    if (t >= times[times.length - 1]) return closes[closes.length - 1];
    let lo = 0;
    let hi = times.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid;
      else hi = mid;
    }
    const f = (t - times[lo]) / (times[hi] - times[lo] || 1);
    return closes[lo] + f * (closes[hi] - closes[lo]);
  };

  const path = times
    .map((t, i) => `${i === 0 ? "M" : "L"}${x(t).toFixed(1)},${y(closes[i]).toFixed(1)}`)
    .join(" ");

  // Place a marker per shown thesis, then merge dense neighborhoods into one chip.
  const sorted = shown
    .slice()
    .sort((a, b) => a.episodeDate.localeCompare(b.episodeDate));
  const markers: PlottedMarker[] = sorted.map((th, idx) => {
    const t = Math.min(Math.max(Date.parse(th.episodeDate), minT), maxT);
    const mx = x(t);
    const price = closeAt(t);
    const lineY = y(closeAt(t));
    const labelY = lineY - 34 < padT + 12 ? Math.min(H - padB - 18, lineY + 34) : lineY - 34;
    const returnSince = price > 0 ? latestClose / price - 1 : 0;
    return {
      id: `${th.id}-${idx}`,
      thesis: th,
      x: mx,
      lineY,
      labelY,
      price,
      returnSince,
      outcome: callOutcome(th.stance, returnSince),
      seriesIndex: times.findIndex((value) => value >= t),
    };
  });

  const markerGroups = (() => {
    const grouped: PlottedMarker[][] = [];
    for (const marker of markers) {
      const prev = grouped[grouped.length - 1];
      const anchor = prev?.[prev.length - 1];
      if (anchor && Math.abs(marker.x - anchor.x) < 44 && Math.abs(marker.lineY - anchor.lineY) < 70) {
        prev.push(marker);
      } else {
        grouped.push([marker]);
      }
    }
    return grouped.map((group, idx): MarkerGroup => {
      const xAvg = group.reduce((sum, m) => sum + m.x, 0) / group.length;
      const yAvg = group.reduce((sum, m) => sum + m.lineY, 0) / group.length;
      const labelY = yAvg - 36 < padT + 12 ? Math.min(H - padB - 18, yAvg + 36) : yAvg - 36;
      return {
        id: `holding-group-${idx}-${group.map((m) => m.id).join("-")}`,
        x: Math.max(padL + 18, Math.min(W - padR - 18, xAvg)),
        lineY: yAvg,
        labelY,
        markers: group,
      };
    });
  })();

  const selected = sel ? markers.find((m) => m.id === sel) ?? null : null;
  const selectedGroup = selected
    ? markerGroups.find((g) => g.markers.some((m) => m.id === selected.id)) ?? null
    : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {presentHosts.map((h) => {
            const on = active.includes(h);
            return (
              <button
                key={h}
                type="button"
                onClick={() => toggleHost(h)}
                title={`${on ? "Hide" : "Show"} ${h}'s calls`}
                aria-pressed={on}
                className={`rounded-full transition-all duration-150 hover:scale-110 active:scale-90 ${
                  on ? "" : "opacity-30 grayscale hover:opacity-60"
                }`}
                style={on ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 3.5px ${HOST_UI[h].hex}` } : undefined}
              >
                <HostAvatar host={h} size="sm" />
              </button>
            );
          })}
        </div>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            ["all", "All calls"],
            ["flips", "Stance changes"],
          ]}
        />
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`${ticker} price with the hosts' calls marked`}>
          <defs>
            <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.16" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          <line
            x1={padL}
            y1={y(firstClose)}
            x2={W - padR}
            y2={y(firstClose)}
            stroke="currentColor"
            strokeOpacity="0.14"
            strokeDasharray="4 4"
          />
          <text x={padL - 6} y={y(firstClose) + 4} textAnchor="end" fontSize="11" className="fill-neutral-500">
            0%
          </text>
          <text x={padL - 6} y={y(maxP) + 4} textAnchor="end" fontSize="11" className="fill-neutral-400">
            {fmtMoney(maxP, market ?? ticker)}
          </text>
          <text x={padL - 6} y={y(minP) + 4} textAnchor="end" fontSize="11" className="fill-neutral-400">
            {fmtMoney(minP, market ?? ticker)}
          </text>

          <path d={`${path} L${x(maxT).toFixed(1)},${H - padB} L${x(minT).toFixed(1)},${H - padB} Z`} fill="url(#pcFill)" className="chart-fade" style={fadeAt(0.65)} />
          <path d={path} fill="none" stroke={lineColor} strokeWidth="2.2" strokeLinejoin="round" pathLength={1} className="chart-draw" />

          {markerGroups.map((g) => {
            const isSel = selectedGroup?.id === g.id;
            const dotGap = 7;
            const startX = g.x - ((g.markers.length - 1) * dotGap) / 2;
            const stemStart = g.labelY < g.lineY ? g.labelY + 15 : g.labelY - 15;
            return (
              <g key={g.id}>
                <line x1={g.x} y1={stemStart} x2={g.x} y2={g.lineY} stroke="currentColor" strokeWidth="1" strokeOpacity="0.22" />
                {g.markers.map((m, markerIdx) => (
                  <circle
                    key={m.id}
                    cx={startX + markerIdx * dotGap}
                    cy={g.lineY}
                    r={isSel ? 4.2 : 3.2}
                    fill={isSel ? "#f4f4f5" : "#a1a1aa"}
                    stroke={isSel ? "#fff" : "rgba(7,11,9,0.78)"}
                    strokeWidth="1.4"
                  />
                ))}
                <title>
                  {g.markers.length === 1
                    ? `${speakerName(g.markers[0].thesis)} on ${ticker} · ${pct(g.markers[0].returnSince)} since ${fmtDate(g.markers[0].thesis.episodeDate)}`
                    : `${g.markers.length} calls near ${fmtDate(g.markers[0].thesis.episodeDate)}`}
                </title>
              </g>
            );
          })}

          <text x={W - padR + 5} y={y(latestClose) + 4} fontSize="12" fontWeight="700" className={totalReturn >= 0 ? "chart-fade fill-emerald-400" : "chart-fade fill-rose-400"} style={fadeAt(1.2)}>
            {pct(totalReturn)}
          </text>
          <text x={padL} y={H - 8} fontSize="11" className="fill-neutral-400">{fmtDate(history[0][0])}</text>
          <text x={W - padR} y={H - 8} textAnchor="end" fontSize="11" className="fill-neutral-400">
            {fmtDate(latestDate)}
          </text>
        </svg>
        <div className="pointer-events-none absolute inset-0">
          {markerGroups.map((g) => {
            const selectedInGroup = selectedGroup?.id === g.id;
            const first = g.markers[0];
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSel(selectedInGroup ? null : first.id)}
                className={`pointer-events-auto absolute inline-flex min-h-8 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border px-1.5 py-1 text-[10px] font-semibold shadow-lg shadow-black/30 backdrop-blur transition hover:border-white/30 ${
                  g.markers.length === 1
                    ? returnChipClass(verdictRet(first.thesis.stance, first.returnSince), selectedInGroup)
                    : selectedInGroup
                      ? "border-white/35 bg-neutral-950/95 text-neutral-100 ring-2 ring-white/20"
                      : "border-white/10 bg-neutral-950/90 text-neutral-100"
                }`}
                style={{
                  left: `${(g.x / W) * 100}%`,
                  top: `${(g.labelY / H) * 100}%`,
                } as CSSProperties}
                aria-label={
                  g.markers.length === 1
                    ? `${speakerName(first.thesis)} on ${ticker}, ${pct(first.returnSince)} since the call`
                    : `${g.markers.length} calls near ${fmtDate(first.thesis.episodeDate)}`
                }
                title={
                  g.markers.length === 1
                    ? `${speakerName(first.thesis)} · ${pct(first.returnSince)} since the call`
                    : `${g.markers.length} calls near ${fmtDate(first.thesis.episodeDate)}`
                }
              >
                {g.markers.length === 1 ? (
                  <>
                    <HostAvatar host={first.thesis.host} size="sm" />
                    {isDirectional(first.thesis.stance) ? (
                      <span className="font-mono text-[11px]">{pct(first.returnSince)}</span>
                    ) : (
                      <span className="text-[10px] font-medium capitalize text-neutral-400">
                        {first.thesis.stance}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/10 px-1.5 font-mono text-[10px]">
                      {g.markers.length}
                    </span>
                    <span className="text-[9px] uppercase tracking-[0.12em] text-neutral-300">calls</span>
                    <span className="ml-0.5 flex items-center -space-x-1">
                      {g.markers.slice(0, 4).map((m) => (
                        <span key={m.id} className={`shrink-0 rounded-full ring-1 ${returnRingClass(verdictRet(m.thesis.stance, m.returnSince))}`}>
                          <HostAvatar host={m.thesis.host} size="xs" />
                        </span>
                      ))}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-neutral-400">
        {(["bull", "bear", "mixed", "neutral"] as Stance[]).map((s) => {
          const on = activeStances.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStance(s)}
              aria-pressed={on}
              title={on ? `Hide ${STANCE_LABELS[s]} calls` : `Show ${STANCE_LABELS[s]} calls`}
              className={`rounded-full border px-2 py-0.5 transition hover:border-white/25 hover:text-neutral-200 ${
                on
                  ? "border-white/10 bg-white/[0.03] text-neutral-300"
                  : "border-transparent text-neutral-600 line-through hover:text-neutral-400"
              }`}
            >
              {STANCE_LABELS[s]}
            </button>
          );
        })}
        <span className="ml-auto">
          {active.length === 0
            ? "no hosts selected — tap an avatar above"
            : activeStances.length === 0
              ? "no stances selected"
            : shown.length === 0
                ? "no calls match these filters"
                : `${shown.length < scoped.length ? `showing ${shown.length} of ${scoped.length} calls · ` : ""}click a chip for the quote + move since call`}
        </span>
      </div>

      {/* No key: the card pops in once, then content swaps in place as other markers are clicked. */}
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
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition hover:border-white/25 ${
                    returnChipClass(verdictRet(m.thesis.stance, m.returnSince), selected.id === m.id)
                  }`}
                >
                  <HostAvatar host={m.thesis.host} size="xs" />
                  <span>{speakerName(m.thesis)}</span>
                  <span className={`font-mono ${returnTextClass(verdictRet(m.thesis.stance, m.returnSince))}`}>{pct(m.returnSince)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-neutral-500">
            <HostAvatar host={selected.thesis.host} size="sm" />
            {selected.thesis.guestName ? (
              <GuestName
                name={selected.thesis.guestName}
                slug={guestLinks[selected.thesis.guestName]}
                className="font-semibold text-neutral-100"
              />
            ) : (
              <span className="font-semibold text-neutral-100">{speakerName(selected.thesis)}</span>
            )}
            <StanceBadge
              stance={selected.thesis.stance}
              tone={selected.outcome != null ? "outcome" : "stance"}
              outcome={selected.outcome}
              callType={selected.thesis.callType}
            />
            <Link
              href={`/episode/${selected.thesis.episodeId}`}
              className="font-mono text-[11px] hover:text-neutral-200 hover:underline"
              title="All calls from this episode"
            >
              {selected.thesis.episodeNumber ? `E${selected.thesis.episodeNumber}` : selected.thesis.episodeId}
            </Link>
            <span>{fmtDate(selected.thesis.episodeDate)}</span>
            {(episodes[selected.thesis.episodeId]?.audioUrl || episodeLinks[selected.thesis.episodeId]) && (
              <span className="ml-auto">
                <ListenButton
                  meta={episodes[selected.thesis.episodeId]}
                  episodeId={selected.thesis.episodeId}
                  startMs={selected.thesis.quoteStartMs}
                  caption={`${selected.thesis.host} on ${selected.thesis.company}`}
                  fallbackLink={episodeLinks[selected.thesis.episodeId]}
                />
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-neutral-950/35 px-3 py-2 ring-1 ring-white/5">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                {ticker} since this {isDirectional(selected.thesis.stance) ? "call" : "mention"}
              </div>
              <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${returnTextClass(verdictRet(selected.thesis.stance, selected.returnSince))}`}>
                {pct(selected.returnSince)}
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                {fmtMoney(selected.price, market ?? ticker)} → {fmtMoney(latestClose, market ?? ticker)}
              </div>
            </div>
            <div className="rounded-lg bg-neutral-950/35 px-3 py-2 ring-1 ring-white/5">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Call price</div>
              <div className="mt-1 font-mono text-lg font-semibold text-neutral-200">{fmtMoney(selected.price, market ?? ticker)}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                {fmtDate(selected.thesis.episodeDate)}
              </div>
            </div>
            <div className="rounded-lg bg-neutral-950/35 px-3 py-2 ring-1 ring-white/5">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Latest close</div>
              <div className="mt-1 font-mono text-lg font-semibold text-neutral-200">{fmtMoney(latestClose, market ?? ticker)}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                {fmtDate(latestDate)}
              </div>
            </div>
          </div>
          <p className="mt-3 leading-relaxed text-neutral-200">{selected.thesis.summary}</p>
          {selected.thesis.quote && (
            <blockquote className="relative mt-3 pl-6 text-[13px] italic leading-relaxed text-neutral-400">
              <span
                aria-hidden
                className="absolute -top-1 left-0 font-display text-3xl leading-none text-neutral-500/35"
              >
                “
              </span>
              {selected.thesis.quote}”
              {selected.thesis.quoteStartMs != null && (
                <span className="ml-2 font-mono text-[11px] not-italic text-neutral-600">
                  {mmss(selected.thesis.quoteStartMs)}
                </span>
              )}
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}
