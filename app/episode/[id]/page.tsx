import Link from "next/link";
import { notFound } from "next/navigation";
import { getEpisode, allEpisodeIds, guestLinkMap } from "@/lib/data";
import { isPortfolioScored } from "@/lib/calls";
import {
  pct,
  returnColor,
  fmtDate,
  fmtDuration,
  daysBetween,
  typicalMove,
  takeVerdict,
  STANCE_META,
  type VerdictTone,
} from "@/lib/format";
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
    alternates: { canonical: `/episode/${id}` },
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

/** Everything a verdict needs about one company since this episode aired. */
function holdingContext(h: Holding, episodeDate: string) {
  const ret = sinceEpisode(h, episodeDate);
  const asOf = h.market?.asOf ?? h.market?.history?.at(-1)?.[0] ?? null;
  return {
    ret,
    elapsedDays: asOf ? daysBetween(episodeDate, asOf) : null,
    noise: typicalMove(h.market?.history),
    asOf,
  };
}

export default async function EpisodePage({ params }: PageProps<"/episode/[id]">) {
  const { id } = await params;
  const ep = getEpisode(id);
  if (!ep) notFound();
  const guestLinks = guestLinkMap();

  const takeCount = ep.groups.reduce((n, g) => n + g.takes.length, 0);
  const allTakes = ep.groups.flatMap((g) => g.takes);

  // Scorecard: judge every directional take on the right horizon — only calls
  // that have had time to breathe *and* moved beyond the stock's own noise get
  // a firm verdict. The rest are honestly "too early to call", not "wrong".
  let withCall = 0;
  let against = 0;
  let early = 0;
  for (const g of ep.groups) {
    const ctx = holdingContext(g.holding, ep.meta.date);
    for (const t of g.takes) {
      const v = takeVerdict({
        stance: t.stance,
        since: ctx.ret,
        elapsedDays: ctx.elapsedDays,
        noiseFloor: ctx.noise,
        scored: isPortfolioScored(t),
      });
      if (v?.tone === "with") withCall++;
      else if (v?.tone === "against") against++;
      else if (v?.tone === "early") early++;
    }
  }
  const priced = withCall + against > 0;
  // When nothing is graded yet, say why: directional calls still waiting on time
  // or a real move ("too early"), or calls only on private names.
  const hasDirectional = allTakes.some((t) => t.stance === "bull" || t.stance === "bear");
  const scorableSoon = early > 0;

  // Episode "mood": the mix of stances taken, and who showed up.
  const STANCE_ORDER: Stance[] = ["bull", "bear", "mixed", "neutral"];
  const stanceCount: Record<Stance, number> = { bull: 0, bear: 0, neutral: 0, mixed: 0 };
  for (const t of allTakes) stanceCount[t.stance]++;
  const bestiesIn = REGULAR_HOSTS.filter((h) => allTakes.some((t) => t.host === h));
  const guestsIn = [
    ...new Set(allTakes.filter((t) => t.host === "Guest" && t.guestName).map((t) => t.guestName as string)),
  ];

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://allindex.fyi";
  const episodeJsonLd = {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    name: ep.meta.title,
    url: `${siteUrl}/episode/${id}`,
    datePublished: ep.meta.date,
    ...(ep.meta.number ? { episodeNumber: ep.meta.number } : {}),
    description: `${takeCount} scored takes across ${ep.groups.length} companies from this episode, each judged by the price move since it aired.`,
    partOfSeries: {
      "@type": "PodcastSeries",
      name: "All-In with Chamath, Jason, Sacks & Friedberg",
    },
    ...(ep.meta.audioUrl
      ? { associatedMedia: { "@type": "MediaObject", contentUrl: ep.meta.audioUrl } }
      : {}),
  };

  return (
    <div className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(episodeJsonLd) }}
      />
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
          <span className="rounded-lg bg-neutral-100 px-2.5 py-1 font-mono text-sm font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
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
                  <Stat label="Playing out" value={withCall} tone="good" />
                  <Stat label="Going against" value={against} tone="warn" />
                  {early > 0 && (
                    <span
                      className="self-center text-xs text-neutral-400"
                      title="Directional calls that haven't had time to play out or moved beyond the stock's normal range yet."
                    >
                      + {early} too early to call
                    </span>
                  )}
                </>
              )}
              {!priced && hasDirectional && (
                <span
                  className="self-center rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-400 dark:border-neutral-700"
                  title={
                    scorableSoon
                      ? "A call is only graded once it's had time to play out and the stock has moved beyond its normal range — long-term views get a full quarter."
                      : "These calls are on private companies, so there's no market price to score them against."
                  }
                >
                  {scorableSoon ? "Too early to call" : "Private calls · not scored"}
                </span>
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
              A call is only graded once it&apos;s had time to play out and the stock has moved
              beyond its normal range — long-term views get a full quarter before we&apos;ll say
              they&apos;re tracking against.
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
            const ctx = holdingContext(h, ep.meta.date);
            const ret = ctx.ret;
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
                    <span
                      className="font-mono text-sm tabular-nums"
                      title="The stock's move since this episode aired — not a verdict on the call."
                    >
                      <span className={returnColor(ret)}>{pct(ret)}</span>
                      {ctx.asOf && (
                        <span className="text-neutral-500"> over {fmtDuration(ep.meta.date, ctx.asOf)}</span>
                      )}
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {takes.map((t: Thesis) => {
                    const v = takeVerdict({
                      stance: t.stance,
                      since: ret,
                      elapsedDays: ctx.elapsedDays,
                      noiseFloor: ctx.noise,
                      scored: isPortfolioScored(t),
                    });
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
                          <StanceBadge stance={t.stance} callType={t.callType} />
                          <ConvictionDots conviction={t.conviction} />
                          {isPortfolioScored(t) && (
                            <span
                              className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/25"
                              title="A clear in/out call, ranked pick, or investment selection — trades in the money simulations."
                            >
                              📌 scored call
                            </span>
                          )}
                          {v && <VerdictPill tone={v.tone} firm={v.firm} label={v.label} />}
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
                                  className="font-sans text-xs not-italic text-neutral-500 hover:text-neutral-300"
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

const VERDICT_STYLE: Record<VerdictTone, { text: string; dot: string }> = {
  with: { text: "text-emerald-400", dot: "bg-emerald-500" },
  against: { text: "text-amber-400", dot: "bg-amber-500" },
  early: { text: "text-neutral-400", dot: "bg-neutral-500" },
  inline: { text: "text-neutral-500", dot: "bg-neutral-600" },
};

const VERDICT_HINT: Record<VerdictTone, string> = {
  with: "The stock has moved the way this call expected.",
  against: "The stock has moved against this call — but the thesis can still play out.",
  early: "Too soon, or too small a move, to judge — long-term views get a full quarter.",
  inline: "The stock has barely moved since, so there's nothing to read into yet.",
};

/** A take's standing, framed as a race still being run — never a red-X gotcha. */
function VerdictPill({ tone, firm, label }: { tone: VerdictTone; firm: boolean; label: string }) {
  const s = VERDICT_STYLE[tone];
  return (
    <span
      className={`flex items-center gap-1.5 ${firm ? "font-semibold" : "font-normal"} ${s.text}`}
      title={VERDICT_HINT[tone]}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" | "warn" }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">{label}</div>
      <div
        className={`font-display text-3xl font-bold tabular-nums ${
          tone === "good"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "bad"
              ? "text-rose-500 dark:text-rose-400"
              : tone === "warn"
                ? "text-amber-600 dark:text-amber-400"
                : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
