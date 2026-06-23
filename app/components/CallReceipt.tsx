"use client";

import Link from "next/link";
import { pct, fmtDate } from "@/lib/format";
import { StanceBadge } from "@/app/components/badges";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { ListenButton } from "@/app/components/player";
import { sectorProxyInfo } from "@/lib/proxies";
import { proxyAssetKind } from "@/lib/assets";
import type { TradeEventTake } from "@/lib/projections";
import type { EpisodeMeta } from "@/lib/types";
import type { PositionStat } from "@/app/components/IndexChart";

export interface CallReceiptProps {
  company: string;
  ticker: string;
  slug: string;
  domain?: string | null;
  /** The call behind this trade/position — its summary, quote, episode. */
  take?: TradeEventTake | null;
  /** Date shown in the meta row (the trade / entry date). */
  date: string;
  /** This name's windowed performance, when it's a scored position. */
  stats?: PositionStat | null;
  portfolioReturn?: number | null;
  episodes?: Record<string, EpisodeMeta>;
  episodeLinks?: Record<string, string | null>;
  /** Where the name + "Full history →" link to (defaults to the holding page). */
  holdingHref?: string;
}

/**
 * The "receipt" behind a single call — the meta row, the take's summary + quote,
 * a proxy explainer when the ticker is an ETF stand-in, and the windowed
 * performance tiles. Rendered both under a clicked chart marker (IndexChart) and
 * inside an expanded positions-table row, so the two always read identically.
 */
export function CallReceipt({
  company,
  ticker,
  slug,
  domain,
  take,
  date,
  stats,
  portfolioReturn,
  episodes = {},
  episodeLinks = {},
  holdingHref,
}: CallReceiptProps) {
  const href = holdingHref ?? `/holding/${slug}`;
  const proxyKind = proxyAssetKind(ticker);
  const proxyInfo = sectorProxyInfo(ticker);
  const isProxy = proxyKind != null;
  const proxyLabel =
    proxyInfo?.name ??
    (proxyKind === "crypto" ? "Crypto ETF" : proxyKind === "commodity" ? "Commodity ETF" : "Sector ETF");

  const pp = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "pp";
  const tile = (label: string, value: string, tone: number | null, detail?: string) => (
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
    <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-neutral-500">
        <CompanyLogo name={company} domain={domain} size="md" className="rounded-lg" />
        <Link href={href} className="font-semibold text-neutral-100 hover:underline">
          {company}
        </Link>
        {!isProxy && <span className="font-mono text-[11px] text-neutral-500">{ticker}</span>}
        {take && <StanceBadge stance={take.stance} tone={stats ? "outcome" : "neutral"} outcome={stats?.ret} />}
        {take && (
          <Link
            href={`/episode/${take.episodeId}`}
            className="font-mono text-[11px] hover:text-neutral-200 hover:underline"
            title="All takes from this episode"
          >
            {take.episodeNumber ? `E${take.episodeNumber}` : take.episodeId}
          </Link>
        )}
        <span>{fmtDate(date)}</span>
        {take && (episodes[take.episodeId]?.audioUrl || episodeLinks[take.episodeId]) && (
          <span className="ml-auto">
            <ListenButton
              meta={episodes[take.episodeId]}
              episodeId={take.episodeId}
              startMs={take.quoteStartMs}
              caption={`${take.host} on ${take.company}`}
              fallbackLink={episodeLinks[take.episodeId]}
            />
          </span>
        )}
      </div>

      {take ? (
        <>
          <p className="mt-2.5 leading-relaxed text-neutral-200">{take.summary}</p>
          {take.quote && (
            <blockquote className="relative mt-3 pl-6 text-[13px] italic leading-relaxed text-neutral-400">
              <span aria-hidden className="absolute -top-1 left-0 font-display text-3xl leading-none text-neutral-500/35">
                “
              </span>
              {take.quote}”
            </blockquote>
          )}
        </>
      ) : (
        <p className="mt-2.5 text-neutral-400">
          No stored take for this trade event — see the holding page for the full history.
        </p>
      )}

      {/* Proxied call: the ticker is an ETF stand-in, so name it and explain the
          pick + its limits up front (progressive-disclosure, no overlay). */}
      {isProxy && (
        <details className="group/px mt-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 open:bg-white/[0.035] [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-3 text-xs">
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">{ticker}</span>
            <span className="min-w-0 flex-1 truncate text-neutral-300">{proxyLabel}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-neutral-400 transition group-hover/px:border-white/25 group-hover/px:text-neutral-200">
              Why this ETF?
              <svg
                viewBox="0 0 10 6"
                className="h-1.5 w-2.5 fill-none stroke-current transition-transform group-open/px:rotate-180"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M1 1l4 4 4-4" />
              </svg>
            </span>
          </summary>
          <p className="mt-2 border-t border-white/5 pt-2 text-[11px] leading-relaxed text-neutral-400">
            {proxyInfo ? (
              <>
                <span className="text-neutral-300">{company}</span> isn&apos;t a single stock, so it&apos;s scored against{" "}
                <span className="font-mono text-neutral-300">{ticker}</span>. {proxyInfo.what}{" "}It&apos;s only an approximation — the ETF holds
                names they never mentioned and the theme can move differently, so read it as a directional gut-check, not a precise scorecard.
              </>
            ) : (
              <>
                <span className="text-neutral-300">{company}</span> is a {proxyKind}, not a company, so it&apos;s priced via the{" "}
                <span className="font-mono text-neutral-300">{ticker}</span> ETF — a clean, liquid stand-in that lets the call be tracked. The
                proxy can drift from the underlying.
              </>
            )}
          </p>
        </details>
      )}

      {stats && (
        <div className="mt-4 rounded-lg bg-neutral-950/35 p-3 ring-1 ring-white/5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
              {isProxy ? `How ${ticker} tracked this call` : "Selected company performance"}
            </div>
            <Link
              href={href}
              className="group/full inline-flex items-center gap-1 text-xs text-neutral-400 transition hover:text-neutral-100"
            >
              Full history
              <span aria-hidden className="transition-transform group-hover/full:translate-x-0.5">
                →
              </span>
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {tile(`${ticker} call return`, pct(stats.ret), stats.ret, "since this call")}
            {/* For a short the benchmark is the SAME bet on the S&P (shorting it),
                not "what the S&P did" — labeling it that way would invert the
                index's actual move (a short's bench is the negated S&P). */}
            {stats.direction === "short"
              ? tile("S&P, shorted", pct(stats.bench), stats.bench, "the same bet, same dates")
              : tile("S&P, same dates", pct(stats.bench), stats.bench, "what the S&P did")}
            {tile("Alpha", pp(stats.alpha), stats.alpha, stats.direction === "short" ? "vs shorting the S&P" : "beat the S&P by")}
            {portfolioReturn != null &&
              tile("Share of the total", pp(stats.contribPp), stats.contribPp, `of ${pct(portfolioReturn)} overall`)}
          </div>
        </div>
      )}
    </>
  );
}
