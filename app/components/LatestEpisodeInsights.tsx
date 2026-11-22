import Link from "next/link";
import { fmtDate } from "@/lib/format";
import type { LatestEpisodeInsight } from "@/lib/latest-episode-insights";
import { trimPublishedQuote } from "@/lib/quotes";
import { CompanyLogo } from "./CompanyLogo";
import { ListenButton } from "./player";

const actionStyles = {
  "Long call": "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
  "Short call": "bg-rose-500/10 text-rose-300 ring-rose-500/25",
  Exit: "bg-white/5 text-neutral-200 ring-white/10",
};

export function LatestEpisodeInsights({ insight }: { insight: LatestEpisodeInsight | null }) {
  if (!insight?.calls.length) return null;
  const { episodeId, episode, calls } = insight;
  const single = calls.length === 1;

  return (
    <section aria-labelledby="latest-episode-title" className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
      <header className="grid gap-3 border-b border-neutral-800 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold uppercase tracking-[0.14em] text-emerald-400">Latest episode insights</span>
            <span className="flex items-center gap-2 text-neutral-400">
              {episode.number != null && <span className="font-mono">E{episode.number}</span>}
              <time dateTime={episode.date}>{fmtDate(episode.date)}</time>
            </span>
          </div>
          <h2 id="latest-episode-title" className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight text-neutral-100 sm:text-xl">
            {episode.title}
          </h2>
        </div>
        <Link href={`/episode/${episodeId}`} className="w-fit whitespace-nowrap text-sm font-medium text-emerald-300 hover:underline">
          View episode <span aria-hidden="true" className="arrow-nudge">→</span>
        </Link>
      </header>

      <div className={`grid gap-px bg-neutral-800 ${calls.length === 3 ? "lg:grid-cols-3" : calls.length === 2 ? "md:grid-cols-2" : ""}`}>
        {calls.map(({ holding, take, speaker, action, startMs }) => (
          <article
            key={take.id}
            className={`grid min-w-0 content-start gap-4 bg-neutral-900 px-5 py-4 sm:px-6 ${single ? "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-8" : ""}`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <CompanyLogo name={holding.company} domain={holding.domain} />
                <h3 className="font-display text-base font-semibold text-neutral-100">
                  <Link href={`/holding/${holding.slug}`} className="hover:underline">{holding.company}</Link>
                </h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${actionStyles[action]}`}>{action}</span>
                <span className="text-xs text-neutral-400">{speaker}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-300">{take.summary}</p>
            </div>

            <div className="min-w-0 space-y-2 border-l-2 border-neutral-700 pl-3 sm:pl-4">
              <blockquote className="text-sm italic leading-relaxed text-neutral-300">“{trimPublishedQuote(take.quote)}”</blockquote>
              {episode.audioUrl?.trim() && startMs != null && (
                <ListenButton
                  meta={episode}
                  episodeId={episodeId}
                  startMs={startMs}
                  caption={`${speaker} on ${holding.company}`}
                  className="min-h-6 text-xs font-semibold text-emerald-300 hover:underline"
                />
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
