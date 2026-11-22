import Link from "next/link";
import type { CSSProperties } from "react";
import { fmtDate } from "@/lib/format";
import { HOST_UI } from "@/lib/hosts";
import type { LatestEpisodeInsight } from "@/lib/latest-episode-insights";
import { trimPublishedQuote } from "@/lib/quotes";
import { CompanyLogo } from "./CompanyLogo";
import { HostAvatar } from "./host";
import { ListenButton } from "./player";

const actionStyles = {
  "Long call": "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
  "Short call": "bg-rose-400/10 text-rose-300 ring-rose-400/25",
  Exit: "bg-white/5 text-neutral-200 ring-white/15",
};

export function LatestEpisodeInsights({ insight }: { insight: LatestEpisodeInsight | null }) {
  if (!insight?.calls.length) return null;
  const { episodeId, episode, calls } = insight;
  const single = calls.length === 1;
  const columns = calls.length === 3 ? "lg:grid-cols-3" : calls.length === 2 ? "md:grid-cols-2" : "";
  const cardLayout = single ? "md:grid-cols-[minmax(14rem,0.8fr)_minmax(0,2fr)]"
    : calls.length === 2 ? "md:row-span-2 md:grid-rows-subgrid"
    : "lg:row-span-2 lg:grid-rows-subgrid";

  return (
    <section aria-labelledby="latest-episode-title" className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <h2 id="latest-episode-title" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <svg aria-hidden="true" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="size-5 text-emerald-400">
            <path d="M2 9v2m4.5-6v10M11 2v16m4.5-13v10M20 8v4" />
          </svg>
          Latest episode insights
        </h2>
        <div className="flex items-center gap-2.5 font-mono text-xs text-neutral-400">
          {episode.number != null && <><span className="font-semibold text-neutral-200">E{episode.number}</span><span aria-hidden="true">/</span></>}
          <time dateTime={episode.date}>{fmtDate(episode.date)}</time>
        </div>
      </header>

      <div className={`grid gap-3 ${columns}`}>
        {calls.map(({ holding, take, speaker, action, startMs }) => (
          <article
            key={take.id}
            aria-labelledby={`speaker-${take.id} insight-${take.id}`}
            style={{ "--insight-accent": HOST_UI[take.host].hex } as CSSProperties}
            className={`insight-card grid min-w-0 gap-y-0 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 ${cardLayout}`}
          >
            <div className={`insight-cover flex min-w-0 items-center gap-4 border-b border-white/10 p-5 ${single ? "md:flex-col md:items-start md:justify-center md:gap-5 md:border-r md:border-b-0 md:px-7 md:py-6" : ""}`}>
              <div aria-hidden="true" className="relative isolate flex h-[76px] w-[86px] shrink-0 items-start">
                <div className="insight-record absolute -z-10" />
                <span className={`absolute top-0 left-0 flex size-16 items-center justify-center rounded-full font-display text-2xl font-bold ring-1 ring-white/20 ${HOST_UI[take.host].solid}`}>
                  {HOST_UI[take.host].initials}
                </span>
                <span className="relative z-10 inline-flex size-16"><HostAvatar host={take.host} size="xl" /></span>
                <div className="absolute right-0 bottom-0 z-20 rounded-xl bg-neutral-900 p-1 shadow-lg">
                  <CompanyLogo name={holding.company} domain={holding.domain} size="lg" />
                </div>
              </div>
              <div className="relative min-w-0">
                <p id={`speaker-${take.id}`} className="text-sm leading-snug font-medium text-neutral-300 [overflow-wrap:anywhere]">{speaker} on</p>
                <h3 id={`insight-${take.id}`} className={`mt-0.5 font-display font-bold tracking-tight text-white [overflow-wrap:anywhere] ${single ? "text-3xl md:text-4xl" : "text-2xl"}`}>
                  <Link href={`/holding/${holding.slug}`} className="decoration-1 underline-offset-4 hover:underline">{holding.company}</Link>
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  {holding.ticker && <span className="font-mono text-xs tracking-wide text-neutral-300 [overflow-wrap:anywhere]">{holding.ticker}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${actionStyles[action]}`}>{action}</span>
                </div>
              </div>
            </div>

            <div className={`flex min-w-0 flex-col justify-center gap-5 p-5 ${single ? "sm:p-7 md:gap-6 lg:px-10" : ""}`}>
              <blockquote className={`insight-quote text-pretty text-neutral-50 [overflow-wrap:anywhere] ${single ? "text-[1.65rem] leading-[1.2] sm:text-[2rem] lg:text-[2.4rem]" : "text-2xl leading-[1.25]"}`}>
                “{trimPublishedQuote(take.quote)}”
              </blockquote>
              <div className={single ? "flow-root" : "mt-auto flow-root"}>
                {episode.audioUrl?.trim() && startMs != null && (
                  <ListenButton
                    meta={episode}
                    episodeId={episodeId}
                    startMs={startMs}
                    caption={`${speaker} on ${holding.company}`}
                    className="float-left mr-4 inline-flex min-h-10 items-center rounded-full bg-emerald-300 px-4 text-sm font-semibold whitespace-nowrap text-neutral-950 shadow-sm hover:bg-emerald-200"
                  />
                )}
                <details className="group">
                  <summary className="inline-flex min-h-10 w-fit cursor-pointer list-none items-center gap-1.5 whitespace-nowrap text-sm font-medium text-neutral-300 hover:text-white [&::-webkit-details-marker]:hidden">
                    Why this call
                    <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3 shrink-0 group-open:rotate-180">
                      <path d="m2 4 4 4 4-4" />
                    </svg>
                  </summary>
                  <p className="clear-both pt-3 text-sm leading-relaxed text-neutral-300 [overflow-wrap:anywhere]">{take.summary}</p>
                </details>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Link href={`/episode/${episodeId}`} className="group flex w-fit max-w-full items-center gap-2 text-sm leading-snug text-neutral-400 hover:text-neutral-200">
        <span className="shrink-0 font-medium text-neutral-300">Full episode</span>
        <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere] group-hover:underline">{episode.title}</span>
        <span aria-hidden="true" className="arrow-nudge shrink-0">→</span>
      </Link>
    </section>
  );
}
