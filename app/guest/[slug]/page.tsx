import Link from "next/link";
import { notFound } from "next/navigation";
import { getIndex } from "@/lib/data";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { StanceBadge } from "@/app/components/badges";
import { isScoredPosition } from "@/lib/calls";
import { Reveal } from "@/app/components/Reveal";
import { ListenButton } from "@/app/components/player";
import { BackLink } from "@/app/components/BackLink";
import { LinkRow } from "@/app/components/LinkRow";
import type { GuestLeaderboardEntry, Thesis } from "@/lib/types";

export function generateStaticParams() {
  const { snapshot } = getIndex();
  return (snapshot.guestLeaderboard ?? []).map((g) => ({ slug: g.slug }));
}

function findGuest(slug: string): GuestLeaderboardEntry | null {
  const { snapshot } = getIndex();
  return (snapshot.guestLeaderboard ?? []).find((g) => g.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = findGuest(slug);
  if (!entry) return { title: "Guest not found" };
  return {
    title: `${entry.guest} — guest call record`,
    description:
      entry.followReturn != null
        ? `${pct(entry.followReturn)} across ${entry.calls} scored ${entry.calls === 1 ? "call" : "calls"} on the All-In podcast, vs the S&P's ${pct(entry.benchmarkReturn)} over the same windows — if you'd followed each call.`
        : `${entry.guest}'s takes on the All-In podcast — commentary recorded, but no explicit position calls to score.`,
    alternates: { canonical: `/guest/${slug}` },
  };
}

/** Initials for the monogram avatar. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

type GuestTake = Thesis & { slug: string; domain: string | null };

export default async function GuestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = findGuest(slug);
  if (!entry) notFound();

  const { snapshot } = getIndex();
  const episodes = snapshot.episodes ?? {};
  const episodeLinks: Record<string, string | null> = {};
  for (const [id, meta] of Object.entries(episodes)) episodeLinks[id] = meta.link;
  const domainOf = new Map(snapshot.holdings.map((h) => [h.slug, h.domain ?? null]));

  // Everything this guest said across the catalog (for the receipts list).
  const takes: GuestTake[] = [];
  for (const h of snapshot.holdings)
    for (const t of h.theses)
      if (t.host === "Guest" && t.guestName === entry.guest)
        takes.push({ ...t, slug: h.slug, domain: h.domain ?? null });
  takes.sort((a, b) => b.episodeDate.localeCompare(a.episodeDate));
  const quoted = takes.filter((t) => t.quote);

  return (
    <div className="space-y-10">
      <BackLink href="/the-index#guesties">The Guesties</BackLink>

      {/* Hero */}
      <header className="rise relative overflow-hidden rounded-3xl border border-violet-200 bg-violet-50/40 p-6 dark:border-violet-900/60 dark:bg-violet-950/20 sm:p-8">
        <div className="orb-breathe pointer-events-none absolute -top-16 right-0 h-56 w-56 rounded-full bg-violet-500 opacity-20 blur-3xl sm:-right-16" />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 font-display text-2xl font-bold text-violet-700 ring-1 ring-inset ring-violet-500/30 dark:text-violet-300">
            {initials(entry.guest)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-bold tracking-tight">{entry.guest}</h1>
            <p className="text-sm text-neutral-500">
              Guest on the All-In podcast ·{" "}
              {entry.followReturn != null
                ? `${entry.calls} scored ${entry.calls === 1 ? "call" : "calls"}`
                : "commentary only"}
            </p>
          </div>
          <div className="w-full text-left sm:ml-auto sm:w-auto sm:text-right">
            {entry.followReturn != null ? (
              <>
                <div className={`text-4xl font-black tabular-nums ${returnColor(entry.followReturn)}`}>
                  {pct(entry.followReturn)}
                </div>
                <div className="text-xs text-neutral-500">
                  vs S&amp;P {pct(entry.benchmarkReturn)} ·{" "}
                  <span className={returnColor(entry.alpha)}>
                    {(entry.alpha ?? 0) >= 0 ? "+" : ""}
                    {((entry.alpha ?? 0) * 100).toFixed(1)}pp
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm font-medium text-neutral-400">Commentary — not scored</div>
            )}
          </div>
        </div>
        <p className="relative mt-4 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
          {entry.followReturn != null ? (
            <>
              Each call below is scored as if you&apos;d <em>followed it</em> — long a bull, an
              inverse-sized stake on a bear (capped at −100%) — from the day it aired to today, versus
              simply buying the S&amp;P over the same window.
            </>
          ) : (
            <>
              {entry.guest}
              {" weighed in on the companies below but never made an explicit position call, so there’s nothing to score — these takes are recorded as commentary."}
            </>
          )}
        </p>
      </header>

      {/* Their scored calls — only for guests who actually made calls */}
      {entry.picks.length > 0 && (
      <section className="rise rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6" style={{ "--d": "120ms" } as React.CSSProperties}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Scored calls
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:border-neutral-800">
              <tr>
                <th className="py-2 pr-4 font-medium">Company</th>
                <th className="hidden py-2 pr-4 font-medium sm:table-cell">Call</th>
                <th className="hidden py-2 pr-4 font-medium md:table-cell">Date</th>
                <th className="py-2 pr-4 text-right font-medium">Return</th>
                <th className="py-2 text-right font-medium">vs S&amp;P</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
              {entry.picks.map((p) => (
                <LinkRow key={p.slug} href={`/holding/${p.slug}`} className="group transition-colors hover:bg-white/[0.025]">
                  <td className="py-2.5 pr-4">
                    <Link href={`/holding/${p.slug}`} className="flex items-center gap-2 font-medium group-hover:underline">
                      <CompanyLogo name={p.company} domain={domainOf.get(p.slug)} size="sm" />
                      {p.company}
                      <span className="font-mono text-xs text-neutral-400">{p.ticker}</span>
                    </Link>
                  </td>
                  <td className="hidden py-2.5 pr-4 sm:table-cell">
                    <StanceBadge stance={p.stance} />
                  </td>
                  <td className="hidden py-2.5 pr-4 text-neutral-500 md:table-cell">{fmtDate(p.date)}</td>
                  <td className={`py-2.5 pr-4 text-right font-mono tabular-nums ${returnColor(p.ret)}`}>
                    {pct(p.ret)}
                  </td>
                  <td className={`py-2.5 text-right font-mono font-semibold tabular-nums ${returnColor(p.alpha)}`}>
                    {p.alpha >= 0 ? "+" : ""}
                    {(p.alpha * 100).toFixed(1)}pp
                  </td>
                </LinkRow>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Their takes, with receipts */}
      {quoted.length > 0 && (
        <Reveal stagger>
          <section className="space-y-3">
            <h2 className="stagger-item text-sm font-semibold uppercase tracking-wide text-neutral-500">
              In their words
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {quoted.map((t, i) => (
                <div
                  key={t.id}
                  style={{ "--d": `${50 + i * 50}ms` } as React.CSSProperties}
                  className="group stagger-item card-lift relative rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/holding/${t.slug}`}
                      className="flex items-center gap-2 font-semibold after:absolute after:inset-0 after:content-[''] group-hover:underline"
                    >
                      <CompanyLogo name={t.company} domain={t.domain} size="sm" />
                      {t.company}
                      <span className="arrow-nudge inline-block">→</span>
                    </Link>
                    <StanceBadge stance={t.stance} callType={t.callType} scored={isScoredPosition(t)} />
                  </div>
                  <blockquote className="mt-2 line-clamp-5 text-sm italic leading-relaxed text-neutral-500 dark:text-neutral-400">
                    “{t.quote}”
                  </blockquote>
                  <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                    <span className="flex items-center gap-2">
                      <Link
                        href={`/episode/${t.episodeId}`}
                        className="relative z-10 font-mono text-[11px] hover:text-neutral-200 hover:underline"
                        title="All takes from this episode"
                      >
                        {t.episodeNumber ? `E${t.episodeNumber}` : t.episodeId}
                      </Link>
                      · {fmtDate(t.episodeDate)}
                    </span>
                    {(episodes[t.episodeId]?.audioUrl || episodeLinks[t.episodeId]) && (
                      <span className="relative z-10">
                        <ListenButton
                          meta={episodes[t.episodeId]}
                          episodeId={t.episodeId}
                          startMs={t.quoteStartMs}
                          caption={`${entry.guest} on ${t.company}`}
                          fallbackLink={episodeLinks[t.episodeId]}
                        />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      )}
    </div>
  );
}
