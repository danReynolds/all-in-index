"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { fmtDate, fmtMoney, mmss } from "@/lib/format";
import { StanceBadge } from "@/app/components/badges";
import { HostAvatar } from "@/app/components/host";
import { ListenButton } from "@/app/components/player";
import { HOST_UI } from "@/lib/hosts";
import type { EpisodeMeta, Host, Thesis, Stance, MarketData } from "@/lib/types";

const STANCE_HEX: Record<Stance, string> = {
  bull: "#10b981",
  bear: "#f43f5e",
  mixed: "#f59e0b",
  neutral: "#9ca3af",
};


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

interface Marker {
  thesis: Thesis;
  x: number;
  y: number;
  /** y of the price line at the call date (for the stem). */
  lineY: number;
}

/**
 * The stock's price with every call plotted at the moment it was made —
 * marker color = stance, letter = host. Click a marker to read the quote.
 */
export function PriceChart({
  history,
  theses,
  ticker,
  market,
  episodeLinks = {},
  episodes = {},
}: {
  history: Array<[string, number]>;
  theses: Thesis[];
  ticker: string;
  market?: MarketData | null;
  episodeLinks?: Record<string, string | null>;
  episodes?: Record<string, EpisodeMeta>;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"flips" | "all">("all");
  const [active, setActive] = useState<Host[]>(["Chamath", "Jason", "Sacks", "Friedberg"]);
  const [activeStances, setActiveStances] = useState<Stance[]>(["bull", "bear", "mixed", "neutral"]);
  if (history.length < 2) return null;

  // Only offer chips for speakers who actually have takes on this name.
  const presentHosts = (["Chamath", "Jason", "Sacks", "Friedberg", "Guest"] as Host[]).filter(
    (h) => theses.some((t) => t.host === h),
  );
  const toggleHost = (h: Host) =>
    setActive((a) => (a.includes(h) ? a.filter((x) => x !== h) : [...a, h]));
  const toggleStance = (s: Stance) =>
    setActiveStances((a) => (a.includes(s) ? a.filter((x) => x !== s) : [...a, s]));

  const scoped = theses.filter((t) => active.includes(t.host));
  // Stance filter applies AFTER the flips reduction, so "Stance changes" + bear
  // shows the moments hosts turned bearish, not flips within bear-only takes.
  const modeScoped = mode === "flips" ? stanceChangesOnly(scoped) : scoped;
  const shown = modeScoped.filter((t) => activeStances.includes(t.stance));

  const W = 840;
  const H = 300;
  const padL = 46;
  const padR = 16;
  const padT = 40;
  const padB = 26;

  const times = history.map(([d]) => Date.parse(d));
  const closes = history.map(([, c]) => c);
  const minT = times[0];
  const maxT = times[times.length - 1];
  const minP = Math.min(...closes);
  const maxP = Math.max(...closes);
  const spanP = maxP - minP || 1;

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

  // Place a marker per shown thesis; stack markers that land close together.
  const sorted = shown
    .slice()
    .sort((a, b) => a.episodeDate.localeCompare(b.episodeDate));
  const markers: Marker[] = [];
  let lastX = -Infinity;
  let stack = 0;
  for (const th of sorted) {
    const t = Math.min(Math.max(Date.parse(th.episodeDate), minT), maxT);
    const mx = x(t);
    const lineY = y(closeAt(t));
    stack = mx - lastX < 18 ? stack + 1 : 0;
    lastX = mx;
    markers.push({ thesis: th, x: mx, y: Math.max(13, lineY - 20 - stack * 18), lineY });
  }

  const selected = markers.find((m) => m.thesis.id === sel)?.thesis ?? null;

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
                title={`${on ? "Hide" : "Show"} ${h}'s takes`}
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
            ["all", "Every take"],
            ["flips", "Stance changes"],
          ]}
        />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${ticker} price with the hosts' calls marked`}>
        <defs>
          <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#737373" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#737373" stopOpacity="0" />
          </linearGradient>
        </defs>

        <text x={padL - 6} y={y(maxP) + 4} textAnchor="end" fontSize="11" className="fill-neutral-400">
          {fmtMoney(maxP, market ?? ticker)}
        </text>
        <text x={padL - 6} y={y(minP) + 4} textAnchor="end" fontSize="11" className="fill-neutral-400">
          {fmtMoney(minP, market ?? ticker)}
        </text>

        <path d={`${path} L${x(maxT).toFixed(1)},${H - padB} L${x(minT).toFixed(1)},${H - padB} Z`} fill="url(#pcFill)" className="chart-fade" style={{ "--d": "0.7s" } as CSSProperties} />
        <path d={path} fill="none" stroke="#a3a3a3" strokeWidth="1.75" strokeLinejoin="round" pathLength={1} className="chart-draw" />

        {markers.map((m, i) => {
          const ui = HOST_UI[m.thesis.host];
          const c = STANCE_HEX[m.thesis.stance];
          const isSel = m.thesis.id === sel;
          return (
            <g
              key={m.thesis.id}
              className="marker-pop cursor-pointer"
              style={{ "--d": `${Math.min(550 + i * 55, 1600)}ms` } as CSSProperties}
              onClick={() => setSel(isSel ? null : m.thesis.id)}
            >
              <line x1={m.x} y1={m.y + 8} x2={m.x} y2={m.lineY} stroke={c} strokeWidth="1" strokeOpacity="0.32" />
              <circle cx={m.x} cy={m.lineY} r="2" fill={c} />
              <circle cx={m.x} cy={m.y} r={isSel ? 9 : 7.5} fill={c} stroke={isSel ? "#fff" : "rgba(7,11,9,0.65)"} strokeWidth={isSel ? 2 : 1.5} />
              <text x={m.x} y={m.y + 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff">
                {ui.initials}
              </text>
              <title>{`${m.thesis.host} — ${m.thesis.stance} — ${fmtDate(m.thesis.episodeDate)}`}</title>
            </g>
          );
        })}

        <text x={padL} y={H - 8} fontSize="11" className="fill-neutral-400">{fmtDate(history[0][0])}</text>
        <text x={W - padR} y={H - 8} textAnchor="end" fontSize="11" className="fill-neutral-400">
          {fmtDate(history[history.length - 1][0])}
        </text>
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-neutral-400">
        {(["bull", "bear", "mixed", "neutral"] as Stance[]).map((s) => {
          const on = activeStances.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStance(s)}
              aria-pressed={on}
              title={on ? `Hide ${s} takes` : `Show ${s} takes`}
              className={`flex items-center gap-1 transition-opacity hover:text-neutral-200 ${
                on ? "" : "opacity-30 line-through hover:opacity-60"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: STANCE_HEX[s] }} />
              {s}
            </button>
          );
        })}
        <span className="ml-auto">
          {active.length === 0
            ? "no hosts selected — tap an avatar above"
            : activeStances.length === 0
              ? "no stances selected — tap a dot at left"
              : shown.length === 0
                ? "no takes match these filters"
                : `${shown.length < scoped.length ? `showing ${shown.length} of ${scoped.length} takes · ` : ""}letter = host · click for the quote`}
        </span>
      </div>

      {/* No key: the card pops in once, then content swaps in place as other markers are clicked. */}
      {selected && (
        <div className="pop-in mt-3 rounded-xl bg-neutral-800/40 p-4 text-sm ring-1 ring-white/5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-neutral-500">
            <span className="font-semibold text-neutral-100">{selected.guestName ?? selected.host}</span>
            <StanceBadge stance={selected.stance} />
            <Link
              href={`/episode/${selected.episodeId}`}
              className="font-mono text-[11px] hover:text-neutral-200 hover:underline"
              title="All takes from this episode"
            >
              {selected.episodeNumber ? `E${selected.episodeNumber}` : selected.episodeId}
            </Link>
            <span>{fmtDate(selected.episodeDate)}</span>
            {(episodes[selected.episodeId]?.audioUrl || episodeLinks[selected.episodeId]) && (
              <span className="ml-auto">
                <ListenButton
                  meta={episodes[selected.episodeId]}
                  episodeId={selected.episodeId}
                  startMs={selected.quoteStartMs}
                  caption={`${selected.host} on ${selected.company}`}
                  fallbackLink={episodeLinks[selected.episodeId]}
                />
              </span>
            )}
          </div>
          <p className="mt-2.5 leading-relaxed text-neutral-200">{selected.summary}</p>
          {selected.quote && (
            <blockquote className="relative mt-3 pl-6 text-[13px] italic leading-relaxed text-neutral-400">
              <span
                aria-hidden
                className="absolute -top-1 left-0 font-display text-3xl leading-none text-emerald-500/35"
              >
                “
              </span>
              {selected.quote}”
              {selected.quoteStartMs != null && (
                <span className="ml-2 font-mono text-[11px] not-italic text-neutral-600">
                  {mmss(selected.quoteStartMs)}
                </span>
              )}
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}
