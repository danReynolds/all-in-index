import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { getIndex } from "@/lib/data";
import { pct, returnColor, fmtDate, callVerdict } from "@/lib/format";
import { BackLink } from "@/app/components/BackLink";
import { HostAvatar } from "@/app/components/host";
import { ListenButton } from "@/app/components/player";
import { PROXY_BY_TICKER } from "@/lib/proxies";
import type { Host } from "@/lib/types";
import type { PredictionsFile } from "@/pipeline/extract-predictions";

function loadPredictions(): PredictionsFile | null {
  const f = path.join(process.cwd(), "data", "predictions.json");
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

/** Every proxy ticker actually referenced by a prediction. */
function usedProxyTickers(data: PredictionsFile | null): string[] {
  const set = new Set<string>();
  for (const ep of data?.episodes ?? [])
    for (const p of ep.predictions) if (p.proxyTicker) set.add(p.proxyTicker.toUpperCase());
  return [...set];
}

export function generateStaticParams() {
  return usedProxyTickers(loadPredictions()).map((t) => ({ ticker: t.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const info = PROXY_BY_TICKER[ticker.toUpperCase()];
  if (!info) return { title: "Proxy — The All-Index" };
  return {
    title: `${info.ticker} sector proxy — The All-Index`,
    description: `Why The All-Index uses ${info.name} (${info.ticker}) to track sector and theme predictions.`,
  };
}

type Use = {
  speaker: string;
  host: Host;
  category: string;
  pick: string;
  direction: "up" | "down" | null;
  sinceReturn: number | null;
  history: Array<[string, number]> | null;
  quote: string;
  quoteStartMs: number | null;
  episodeId: string;
  year: number;
  epDate: string;
};

function HeroChart({ history }: { history: Array<[string, number]> }) {
  const closes = history.map((h) => h[1]);
  const W = 760;
  const H = 150;
  const pad = 8;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (closes.length - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (H - 2 * pad) * (1 - (v - min) / span);
  const line = closes.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(closes.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  const up = closes[closes.length - 1] >= closes[0];
  const stroke = up ? "#10b981" : "#f43f5e";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full text-neutral-700 dark:text-neutral-600" role="img" aria-label="ETF price">
      <defs>
        <linearGradient id="proxy-hero" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#proxy-hero)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function verdictPill(direction: "up" | "down" | null, since: number | null, inProgress: boolean) {
  if (!direction || since == null) return null;
  const right = callVerdict(direction === "up" ? "bull" : "bear", since)?.right ?? null;
  if (right === true)
    return { text: inProgress ? "On track" : "Right", glyph: "✓ ", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" };
  if (right === false)
    return { text: inProgress ? "Off track" : "Wrong", glyph: "✗ ", cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30" };
  return { text: inProgress ? "Too close" : "Flat", glyph: "", cls: "bg-white/5 text-neutral-400 ring-white/10" };
}

export default async function ProxyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const info = PROXY_BY_TICKER[ticker.toUpperCase()];
  if (!info) notFound();

  const data = loadPredictions();
  const episodes = getIndex().snapshot.episodes ?? {};
  const nowYear = data ? new Date(data.generatedAt).getUTCFullYear() : new Date().getUTCFullYear();

  const uses: Use[] = [];
  for (const ep of data?.episodes ?? [])
    for (const p of ep.predictions)
      if (p.proxyTicker?.toUpperCase() === info.ticker)
        uses.push({
          speaker: p.host === "Guest" ? (p.guestName ?? "Guest") : p.host,
          host: p.host as Host,
          category: p.category,
          pick: p.pick,
          direction: p.direction,
          sinceReturn: p.sinceReturn,
          history: p.history ?? null,
          quote: p.quote,
          quoteStartMs: p.quoteStartMs,
          episodeId: ep.id,
          year: ep.year,
          epDate: ep.date,
        });
  uses.sort((a, b) => b.year - a.year || (b.sinceReturn ?? 0) - (a.sinceReturn ?? 0));

  // Hero = the ETF's actual price path over the longest window we have on file.
  const hero = uses.reduce<Use | null>((best, u) => {
    const n = u.history?.length ?? 0;
    return n > (best?.history?.length ?? 0) ? u : best;
  }, null);
  const heroCloses = hero?.history?.map((h) => h[1]) ?? [];
  const heroReturn = heroCloses.length > 1 ? heroCloses[heroCloses.length - 1] / heroCloses[0] - 1 : null;
  const heroFrom = hero?.history?.[0]?.[0];

  const yahoo = `https://finance.yahoo.com/quote/${info.ticker}`;

  return (
    <div className="space-y-8">
      <BackLink href="/predictions">Predictions</BackLink>

      <header className="rise space-y-3">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
          Sector proxy
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{info.name}</h1>
          <span className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-sm text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
            {info.ticker}
          </span>
        </div>
        <p className="max-w-2xl text-neutral-600 dark:text-neutral-400">{info.what}</p>
        <a
          href={yahoo}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline dark:text-emerald-400"
        >
          View {info.ticker} on Yahoo Finance ↗
        </a>
      </header>

      {/* The ETF's price over the window we track */}
      {heroCloses.length > 1 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <HeroChart history={hero!.history!} />
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
            <span>{heroFrom ? fmtDate(heroFrom) : "—"}</span>
            <span className={`font-mono text-sm font-semibold tabular-nums ${returnColor(heroReturn)}`}>{pct(heroReturn)}</span>
            <span>now</span>
          </div>
        </div>
      )}

      {/* Honest framing */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-amber-500/90">Why a proxy?</h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            On these calls the besties named a <strong>sector or theme</strong>, not a single stock. To put a number on
            it, we track the closest liquid, widely-held ETF — here, {info.name} ({info.ticker}).
          </p>
          <p className="text-neutral-500 dark:text-neutral-400">
            It&rsquo;s an approximation, not their literal words. The ETF holds names they never mentioned, weights them
            its own way, and the specific company or sub-segment they had in mind can move very differently. Read it as a
            directional gut-check on the call — not a precise scorecard.
          </p>
        </div>
      </div>

      {/* Predictions that lean on this proxy */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {uses.length === 1 ? "The call tracked with this proxy" : `Calls tracked with this proxy`}
        </h2>
        <ul className="space-y-3">
          {uses.map((u, i) => {
            const inProgress = u.year >= nowYear;
            const v = verdictPill(u.direction, u.sinceReturn, inProgress);
            const meta = episodes[u.episodeId];
            return (
              <li
                key={i}
                className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <HostAvatar host={u.host} size="sm" />
                    <span className="text-sm font-semibold text-neutral-100">{u.speaker}</span>
                    <span className="text-xs text-neutral-500">· {u.year} · {u.category}</span>
                  </span>
                  {v && (
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ring-1 ring-inset ${v.cls}`}>
                      {v.glyph}
                      {v.text}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display text-lg font-semibold leading-tight">{u.pick}</span>
                  {u.sinceReturn != null && (
                    <span className={`font-mono text-sm font-semibold tabular-nums ${returnColor(u.sinceReturn)}`}>
                      {pct(u.sinceReturn)}{" "}
                      <span className="font-sans font-normal text-neutral-500">
                        via {info.ticker} since {fmtDate(u.epDate)}
                      </span>
                    </span>
                  )}
                </div>
                {u.quote && (
                  <blockquote className="mt-3 border-t border-neutral-100 pt-3 text-[13px] italic leading-relaxed text-neutral-500 dark:border-neutral-800/70 dark:text-neutral-400">
                    <span className="line-clamp-2">“{u.quote}”</span>
                    {meta?.audioUrl && u.quoteStartMs != null && (
                      <span className="mt-1.5 block not-italic">
                        <ListenButton meta={meta} episodeId={u.episodeId} startMs={u.quoteStartMs} caption={`${u.speaker} — ${u.category}`} />
                      </span>
                    )}
                  </blockquote>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-xs text-neutral-400">
        Returns are measured from each episode&rsquo;s close to today via {info.ticker}; directional verdicts use a ±2%
        dead zone. The proxy is a stand-in for a sector or theme, not the exact pick.
      </p>
    </div>
  );
}
