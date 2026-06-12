import Link from "next/link";
import { notFound } from "next/navigation";
import { getEpisode, allEpisodeIds } from "@/lib/data";
import { pct, returnColor, fmtDate, callVerdict } from "@/lib/format";
import { StanceBadge, ConvictionDots } from "@/app/components/badges";
import { HostAvatar } from "@/app/components/host";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { ListenButton } from "@/app/components/player";
import { BackLink } from "@/app/components/BackLink";
import type { Holding, Thesis } from "@/lib/types";

export function generateStaticParams() {
  return allEpisodeIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ep = getEpisode(id);
  if (!ep) return { title: "Not found" };
  const takes = ep.groups.reduce((n, g) => n + g.takes.length, 0);
  return {
    title: `${ep.meta.number ? `E${ep.meta.number}` : "Special"} — ${ep.meta.title}`,
    description: `${takes} scored takes across ${ep.groups.length} companies from this episode, each judged by the stock's move since it aired.`,
  };
}

/** Stock return from this episode's air date to the latest sampled close. */
function sinceEpisode(h: Holding, episodeDate: string): number | null {
  const hist = h.market?.history;
  if (!hist || hist.length < 2) return null;
  const day = episodeDate.slice(0, 10);
  const start = hist.find(([d]) => d >= day);
  if (!start) return null;
  return hist[hist.length - 1][1] / start[1] - 1;
}

export default async function EpisodePage({ params }: PageProps<"/episode/[id]">) {
  const { id } = await params;
  const ep = getEpisode(id);
  if (!ep) notFound();

  const takeCount = ep.groups.reduce((n, g) => n + g.takes.length, 0);

  // Scorecard: judge every directional take against the stock since air date.
  let right = 0;
  let wrong = 0;
  for (const g of ep.groups) {
    const ret = sinceEpisode(g.holding, ep.meta.date);
    for (const t of g.takes) {
      const v = callVerdict(t.stance, ret);
      if (v?.right === true) right++;
      else if (v?.right === false) wrong++;
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 text-sm text-neutral-500">
        <BackLink href="/episodes">All episodes</BackLink>
        <span className="flex gap-4">
          {ep.prev && (
            <Link href={`/episode/${ep.prev.id}`} className="hover:underline" title={ep.prev.title}>
              ← {ep.prev.number ? `E${ep.prev.number}` : "older"}
            </Link>
          )}
          {ep.next && (
            <Link href={`/episode/${ep.next.id}`} className="hover:underline" title={ep.next.title}>
              {ep.next.number ? `E${ep.next.number}` : "newer"} →
            </Link>
          )}
        </span>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-neutral-100 px-2.5 py-1 font-mono text-sm font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {ep.meta.number ? `E${ep.meta.number}` : "Special"}
          </span>
          <span className="text-sm text-neutral-500">{fmtDate(ep.meta.date)}</span>
          {(ep.meta.audioUrl || ep.meta.link) && (
            <span className="text-sm">
              <ListenButton
                meta={ep.meta}
                episodeId={id}
                startMs={null}
                label="Listen to the episode"
                fallbackLink={ep.meta.link}
                className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              />
            </span>
          )}
        </div>
        <h1 className="max-w-3xl font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {ep.meta.title}
        </h1>
      </header>

      {/* Scorecard band */}
      <section className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl border border-neutral-200 bg-white px-6 py-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">Takes</div>
          <div className="font-display text-3xl font-bold tabular-nums">{takeCount}</div>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">Companies</div>
          <div className="font-display text-3xl font-bold tabular-nums">{ep.groups.length}</div>
        </div>
        {right + wrong > 0 && (
          <>
            <div className="hidden h-12 w-px bg-neutral-200 sm:block dark:bg-neutral-800" />
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
                Right so far
              </div>
              <div className="font-display text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {right}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
                Wrong so far
              </div>
              <div className="font-display text-3xl font-bold tabular-nums text-rose-500 dark:text-rose-400">
                {wrong}
              </div>
            </div>
            <p className="ml-auto max-w-[260px] text-right text-xs text-neutral-400">
              Directional takes judged by each stock&apos;s move since this episode aired.
            </p>
          </>
        )}
      </section>

      {/* Takes, grouped by company */}
      {ep.groups.length === 0 ? (
        <p className="text-neutral-500">
          No scored investment takes in this episode — likely a special or off-topic show.
        </p>
      ) : (
        <section className="space-y-4">
          {ep.groups.map(({ holding: h, takes }) => {
            const ret = sinceEpisode(h, ep.meta.date);
            return (
              <article
                key={h.slug}
                className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/holding/${h.slug}`} className="flex items-center gap-2.5 font-semibold hover:underline">
                    <CompanyLogo name={h.company} domain={h.domain} size="sm" />
                    {h.company}
                    {h.ticker ? (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-normal text-neutral-500 dark:bg-neutral-800">
                        {h.ticker}
                      </span>
                    ) : (
                      <span className="rounded border border-neutral-200 px-1.5 py-0.5 text-xs font-normal text-neutral-400 dark:border-neutral-700">
                        private
                      </span>
                    )}
                  </Link>
                  {ret != null && (
                    <span className={`font-mono text-sm tabular-nums ${returnColor(ret)}`}>
                      {pct(ret)} since this episode
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {takes.map((t: Thesis) => {
                    const v = callVerdict(t.stance, ret);
                    return (
                      <div key={t.id} className="rounded-lg bg-neutral-800/40 p-3.5 ring-1 ring-white/5">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-neutral-500">
                          <span className="flex items-center gap-1.5">
                            <HostAvatar host={t.host} size="sm" />
                            <span className="font-semibold text-neutral-100">
                              {t.host === "Guest" ? (t.guestName ?? "Guest") : t.host}
                            </span>
                          </span>
                          <StanceBadge stance={t.stance} />
                          <ConvictionDots conviction={t.conviction} />
                          {t.positional && (
                            <span
                              className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/25"
                              title="A clear in/out call, ranked pick, or investment selection — trades in the money simulations."
                            >
                              📌 scored call
                            </span>
                          )}
                          {v && v.right != null && (
                            <span className={`font-semibold ${v.right ? "text-emerald-400" : "text-rose-400"}`}>
                              {v.right ? "✓ right so far" : "✗ wrong so far"}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-neutral-200">{t.summary}</p>
                        {t.quote && (
                          <blockquote className="relative mt-2.5 pl-6 text-[13px] italic leading-relaxed text-neutral-400">
                            <span aria-hidden className="absolute -top-1 left-0 font-display text-3xl leading-none text-emerald-500/35">
                              “
                            </span>
                            {t.quote}”
                            {(ep.meta.audioUrl || ep.meta.link) && t.quoteStartMs != null && (
                              <>
                                <span className="ml-2 font-sans text-xs not-italic">
                                  <ListenButton
                                    meta={ep.meta}
                                    episodeId={id}
                                    startMs={t.quoteStartMs}
                                    caption={`${t.host} on ${h.company}`}
                                    fallbackLink={ep.meta.link}
                                  />
                                </span>{" "}
                                <a
                                  href={`mailto:me@danreynolds.ca?subject=${encodeURIComponent(`All-Index take report: ${t.id}`)}&body=${encodeURIComponent(`Take ${t.id} (${t.host} on ${h.company}, ${id}) looks wrong because: `)}`}
                                  className="font-sans text-xs not-italic text-neutral-600 hover:text-neutral-300"
                                  title="Report a problem with this take"
                                >
                                  ⚑
                                </a>
                              </>
                            )}
                          </blockquote>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
