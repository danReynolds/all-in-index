import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getIndex } from "@/lib/data";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { HostAvatar } from "@/app/components/host";
import { StanceBadge, ConvictionDots } from "@/app/components/badges";
import { IndexChart, type TradeEvent, type PositionStat } from "@/app/components/IndexChart";
import { Explainer } from "@/app/components/Explainer";
import { Reveal } from "@/app/components/Reveal";
import { ListenButton } from "@/app/components/player";
import { BackLink } from "@/app/components/BackLink";
import { hostExposureWindows, isPortfolioScored } from "@/lib/calls";
import { isMacroAsset } from "@/lib/assets";
import { HOST_UI, RANK_MEDAL } from "@/lib/hosts";
import { HOST_PROFILES, REGULAR_HOSTS } from "@/lib/types";
import type { Host, IndexDirection, Thesis } from "@/lib/types";

export function generateStaticParams() {
  return REGULAR_HOSTS.map((h) => ({ host: h.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }) {
  const { host: hostParam } = await params;
  const host = REGULAR_HOSTS.find((h) => h.toLowerCase() === hostParam.toLowerCase());
  if (!host) return { title: "Not found" };
  const { snapshot } = getIndex();
  const e = (snapshot.leaderboard ?? []).find((x) => x.host === host);
  return {
    title: `${HOST_PROFILES[host as keyof typeof HOST_PROFILES]?.fullName ?? host} — track record`,
    description: e?.positions
      ? `${(e.portfolioReturn >= 0 ? "+" : "") + (e.portfolioReturn * 100).toFixed(1)}% on ${e.positions} scored calls vs the S&P's ${(e.benchmarkReturn * 100).toFixed(1)}% over the same windows. Every call sourced from the All-In podcast.`
      : `Every call ${host} has made on the All-In podcast, sourced and scored.`,
  };
}

function resolveHost(param: string): Host | null {
  const hit = REGULAR_HOSTS.find((h) => h.toLowerCase() === param.toLowerCase());
  return hit ?? null;
}

function ExposureBadge({ direction }: { direction: IndexDirection }) {
  const tone =
    direction === "short"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
      : direction === "mixed"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  const label = direction === "mixed" ? "Long/short" : direction[0].toUpperCase() + direction.slice(1);
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>;
}

function MethodStat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div>
      <div className="font-mono text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xs text-neutral-500">{note}</div>
    </div>
  );
}

const EXCLUDED_ETFS = new Set(["SPY", "QQQ", "VOO", "VTI", "DIA", "IWM"]);

function isCryptoTicker(ticker: string | null): boolean {
  return !!ticker && (/-USD$/i.test(ticker) || ["BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "BNB"].includes(ticker.toUpperCase()));
}

function isTradableCompanyTake(t: Thesis): boolean {
  return (
    !!t.ticker &&
    t.isPublic &&
    !isCryptoTicker(t.ticker) &&
    !EXCLUDED_ETFS.has(t.ticker.toUpperCase()) &&
    !isMacroAsset(t.ticker)
  );
}

export default async function HostPage({ params }: PageProps<"/host/[host]">) {
  const { host: hostParam } = await params;
  const host = resolveHost(hostParam);
  if (!host) notFound();

  const { snapshot } = getIndex();
  const episodes = snapshot.episodes ?? {};
  const episodeLinks: Record<string, string | null> = {};
  for (const [id, meta] of Object.entries(episodes)) episodeLinks[id] = meta.link;
  const lb = snapshot.leaderboard ?? [];
  const entry = lb.find((e) => e.host === host);
  const rank = lb.findIndex((e) => e.host === host);
  const fund = snapshot.hostFunds?.[host] ?? null;
  const ui = HOST_UI[host];
  const profile = HOST_PROFILES[host as keyof typeof HOST_PROFILES];

  // Per-name performance for the chart receipts. Equal weight makes the
  // contribution exact: this name's return ÷ N is its share of the headline.
  const positionStats: Record<string, PositionStat> = {};
  if (fund) {
    for (const c of fund.constituents) {
      positionStats[c.slug] = {
        ret: c.sinceReturn,
        bench: c.benchmarkReturn,
        alpha: c.alpha,
        contribPp: c.sinceReturn / fund.constituents.length,
      };
    }
  }

  // Entry/exit events for the fund chart, from their portfolio-scored windows.
  const tradeEvents: TradeEvent[] = [];
  if (fund) {
    for (const c of fund.constituents) {
      const holding = snapshot.holdings.find((x) => x.slug === c.slug);
      if (!holding) continue;
      for (const w of hostExposureWindows(holding.theses, host)) {
        tradeEvents.push({ date: w.start, ticker: c.ticker, slug: c.slug, kind: "in", direction: w.direction, take: w.startTake ?? null });
        if (w.end) tradeEvents.push({ date: w.end, ticker: c.ticker, slug: c.slug, kind: "out", direction: w.direction, take: w.endTake ?? null });
      }
    }
  }

  // Their takes across the catalog (for signature quotes + flip stories).
  const takes: Array<Thesis & { slug: string }> = [];
  for (const h of snapshot.holdings) {
    for (const t of h.theses) if (t.host === host) takes.push({ ...t, slug: h.slug });
  }
  const scoreableTakes = takes.filter((t) => isPortfolioScored(t) && t.attributionConfidence !== "low");
  const tradableScoreableTakes = scoreableTakes.filter(isTradableCompanyTake);
  const excludedScoreableTakes = scoreableTakes.length - tradableScoreableTakes.length;
  const commentaryTakes = takes.length - scoreableTakes.length;
  const signature = takes
    .filter((t) => t.quote && t.stance !== "neutral")
    .sort(
      (a, b) =>
        (b.conviction === "high" ? 1 : 0) - (a.conviction === "high" ? 1 : 0) ||
        b.episodeDate.localeCompare(a.episodeDate),
    )
    .slice(0, 3);

  return (
    <div className="space-y-10">
      <BackLink href="/">Home</BackLink>

      {/* Hero */}
      <header className="rise relative overflow-hidden rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
        <div
          className="orb-breathe pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-20 blur-3xl"
          style={{ background: ui.hex }}
        />
        <div className="relative flex flex-wrap items-center gap-5">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black text-white"
            style={{ background: ui.hex }}
          >
            {ui.initials}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl font-bold tracking-tight">{profile?.fullName ?? host}</h1>
              {rank >= 0 && <span className="text-2xl">{RANK_MEDAL[rank] ?? ""}</span>}
            </div>
            <p className="text-sm text-neutral-500">{profile?.blurb}</p>
          </div>
          {entry && entry.positions > 0 && (
            <div className="ml-auto text-right">
              <div className={`text-4xl font-black tabular-nums ${returnColor(entry.portfolioReturn)}`}>
                {pct(entry.portfolioReturn)}
              </div>
              <div className="text-xs text-neutral-500">
                vs S&P {pct(entry.benchmarkReturn)} · {entry.positions} scored public calls
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Their fund */}
      {fund && (
        <section className="rise rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6" style={{ "--d": "150ms" } as CSSProperties}>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            The {host} portfolio
          </h2>
          <div className="mb-4">
            <Explainer summary="How this portfolio is scored">
              {`$1,000 per name, in the market only while their scored calls carry exposure — clear buys, ranked picks, explicit investment selections, explicit shorts, and pair legs count; exits and re-entries included — vs the S&P traded in the same direction over identical windows. Commentary and criticism never trade. Click any marker for the call behind it.`}
            </Explainer>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-neutral-100 py-3 dark:border-neutral-800 md:grid-cols-4">
            <MethodStat label="Catalog theses" value={takes.length} note="All extracted company views." />
            <MethodStat label="Scoreable receipts" value={scoreableTakes.length} note="Clear in/out, ranked, or pair calls." />
            <MethodStat label="Public exposures" value={fund.constituents.length} note="Tradable names in this scorecard." />
            <MethodStat label="Not traded" value={excludedScoreableTakes + commentaryTakes} note={`${excludedScoreableTakes} non-tradable, ${commentaryTakes} commentary.`} />
          </div>
          <IndexChart
            series={fund.series}
            benchmarkSymbol={fund.benchmarkSymbol}
            label={host}
            events={tradeEvents}
            episodeLinks={episodeLinks}
            episodes={episodes}
            positionStats={positionStats}
            portfolioReturn={fund.portfolioReturn}
          />

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                <tr>
                  <th className="py-2 pr-4 font-medium">Call</th>
                  <th className="hidden py-2 pr-4 font-medium md:table-cell">Exposure</th>
                  <th className="hidden py-2 pr-4 font-medium sm:table-cell">Entry</th>
                  <th className="py-2 pr-4 text-right font-medium">Return</th>
                  <th className="py-2 text-right font-medium">Alpha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
                {fund.constituents.map((c) => (
                  <tr key={c.slug} className="group">
                    <td className="py-2.5 pr-4">
                      <Link href={`/holding/${c.slug}`} className="font-medium group-hover:underline">
                        {c.company}
                      </Link>{" "}
                      <span className="font-mono text-xs text-neutral-400">{c.ticker}</span>{" "}
                      <span className="md:hidden">
                        <ExposureBadge direction={c.direction ?? "long"} />
                      </span>
                    </td>
                    <td className="hidden py-2.5 pr-4 md:table-cell">
                      <ExposureBadge direction={c.direction ?? "long"} />
                    </td>
                    <td className="hidden py-2.5 pr-4 text-neutral-500 sm:table-cell">
                      {fmtDate(c.entryDate)}
                    </td>
                    <td className={`py-2.5 pr-4 text-right font-mono tabular-nums ${returnColor(c.sinceReturn)}`}>
                      {pct(c.sinceReturn)}
                    </td>
                    <td className={`py-2.5 text-right font-mono font-semibold tabular-nums ${returnColor(c.alpha)}`}>
                      {c.alpha >= 0 ? "+" : ""}
                      {(c.alpha * 100).toFixed(1)}pp
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Signature takes */}
      {signature.length > 0 && (
        <Reveal stagger>
        <section className="space-y-3">
          <h2 className="stagger-item text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Signature takes
          </h2>
          <div className="grid gap-3 lg:grid-cols-3">
            {signature.map((t, i) => (
              <div
                key={t.id}
                style={{ "--d": `${60 + i * 80}ms` } as CSSProperties}
                className="group stagger-item card-lift relative rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Stretched link: the whole card clicks through to the holding. */}
                  <Link
                    href={`/holding/${t.slug}`}
                    className="font-semibold after:absolute after:inset-0 after:content-[''] group-hover:underline"
                  >
                    {t.company} <span className="arrow-nudge inline-block">→</span>
                  </Link>
                  <StanceBadge stance={t.stance} />
                </div>
                <blockquote className="mt-2 line-clamp-4 text-sm italic leading-relaxed text-neutral-600 dark:text-neutral-400">
                  “{t.quote}”
                </blockquote>
                <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                  <span className="flex items-center gap-2">
                    <ConvictionDots conviction={t.conviction} />
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
                        caption={`${host} on ${t.company}`}
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

      {/* The rest of the table */}
      <section className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
        <span>The rest of the table:</span>
        {REGULAR_HOSTS.filter((h) => h !== host).map((h) => (
          <Link
            key={h}
            href={`/host/${h.toLowerCase()}`}
            className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 transition-all hover:-translate-y-0.5 hover:border-neutral-400 dark:border-neutral-700"
          >
            <HostAvatar host={h} size="sm" />
            {h}
          </Link>
        ))}
      </section>
    </div>
  );
}
