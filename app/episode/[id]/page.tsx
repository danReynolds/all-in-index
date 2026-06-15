import Link from "next/link";
import { notFound } from "next/navigation";
import { getEpisode, allEpisodeIds, guestLinkMap } from "@/lib/data";
import { pct, returnColor, fmtDate, callVerdict, STANCE_META } from "@/lib/format";
import { StanceBadge, ConvictionDots } from "@/app/components/badges";
import { HostAvatar, HostStack } from "@/app/components/host";
import { GuestName } from "@/app/components/GuestName";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { ListenButton } from "@/app/components/player";
import { BackLink } from "@/app/components/BackLink";
import { REGULAR_HOSTS } from "@/lib/types";
import type { Holding, Stance, Thesis } from "@/lib/types";

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
    description: `${takes} scored takes across ${ep.groups.length} companies from this episode, each judged by the price move since it aired.`,
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
  const guestLinks = guestLinkMap();

  const takeCount = ep.groups.reduce((n, g) => n + g.takes.length, 0);
  const allTakes = ep.groups.flatMap((g) => g.takes);

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
  const priced = right + wrong > 0;

  // Episode "mood": the mix of stances taken, and who showed up.
  const STANCE_ORDER: Stance[] = ["bull", "bear", "mixed", "neutral"];
  const stanceCount: Record<Stance, number> = { bull: 0, bear: 0, neutral: 0, mixed: 0 };
  for (const t of allTakes) stanceCount[t.stance]++;
  const bestiesIn = REGULAR_HOSTS.filter((h) => allTakes.some((t) => t.host === h));
  const guestsIn = [
    ...new Set(allTakes.filter((t) => t.host === "Guest" && t.guestName).map((t) => t.guestName as string)),
  ];

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

      {/* Episode summary */}
      {allTakes.length > 0 && (
        <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          {/* Headline figures + who showed up */}
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
              <Stat label="Takes" value={takeCount} />
              <Stat label="Companies" value={ep.groups.length} />
              {priced && (
                <>
                  <div className="hidden h-12 w-px self-center bg-neutral-200 sm:block dark:bg-neutral-800" />
                  <Stat label="Right so far" value={right} tone="good" />
                  <Stat label="Wrong so far" value={wrong} tone="bad" />
                </>
              )}
            </div>
            {(bestiesIn.length > 0 || guestsIn.length > 0) && (
              <div className="sm:text-right">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
                  Who weighed in
                </div>
                <div className="mt-2 flex items-center gap-2.5 sm:justify-end">
                  {bestiesIn.length > 0 && <HostStack hosts={bestiesIn} size="md" />}
                  {guestsIn.length > 0 && (
                    <span className="text-sm text-neutral-400">
                      {bestiesIn.length > 0 ? "+ " : ""}
                      {guestsIn.map((g, i) => (
                        <span key={g}>
                          {i > 0 && ", "}
                          <GuestName name={g} slug={guestLinks[g]} className="text-neutral-300" />
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Stance mix — the episode's mood at a glance */}
          <div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
              {STANCE_ORDER.filter((s) => stanceCount[s] > 0).map((s) => (
                <div
                  key={s}
                  className={STANCE_META[s].dot}
                  style={{ width: `${(stanceCount[s] / allTakes.length) * 100}%` }}
                  title={`${stanceCount[s]} ${STANCE_META[s].label.toLowerCase()}`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
              {STANCE_ORDER.filter((s) => stanceCount[s] > 0).map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${STANCE_META[s].dot}`} />
                  <span className="tabular-nums text-neutral-300">{stanceCount[s]}</span>{" "}
                  {STANCE_META[s].label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>

          {/* Companies discussed */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
              Discussed
            </span>
            {ep.groups.map(({ holding: h }) => (
              <Link
                key={h.slug}
                href={`/holding/${h.slug}`}
                className="flex items-center gap-1.5 rounded-full border border-neutral-200 py-1 pl-1 pr-2.5 text-sm transition-colors hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500"
              >
                <CompanyLogo name={h.company} domain={h.domain} size="sm" />
                {h.company}
              </Link>
            ))}
          </div>

          {priced && (
            <p className="text-xs text-neutral-400">
              Directional takes judged by each name&apos;s price move since this episode aired.
            </p>
          )}
        </section>
      )}

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
                            {t.host === "Guest" && t.guestName ? (
                              <GuestName
                                name={t.guestName}
                                slug={guestLinks[t.guestName]}
                                className="font-semibold text-neutral-100"
                              />
                            ) : (
                              <span className="font-semibold text-neutral-100">
                                {t.host === "Guest" ? "Guest" : t.host}
                              </span>
                            )}
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div
        className={`font-display text-3xl font-bold tabular-nums ${
          tone === "good"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "bad"
              ? "text-rose-500 dark:text-rose-400"
              : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
