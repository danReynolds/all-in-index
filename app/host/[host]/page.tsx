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
import { hostExposureWindows, isPortfolioScored, tradeDirectionForTake } from "@/lib/calls";
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

function AuditStatusBadge({ t }: { t: Thesis }) {
  const status = auditStatus(t);
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${status.tone}`}>{status.label}</span>;
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

function isCryptoReceipt(t: Thesis): boolean {
  return isCryptoTicker(t.ticker) || (!t.ticker && t.topics.some((topic) => topic.toLowerCase().includes("crypto")));
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

function isBroadMarketTake(t: Thesis): boolean {
  const name = t.company.toLowerCase();
  return name.includes("s&p 500") || name.includes("broad market") || name.includes("us equities") || name.includes("index");
}

function notTradedReason(t: Thesis): string {
  if (t.scoreCondition) return `Conditional: ${t.scoreCondition}`;
  if (t.scoreExclusionReason === "day_trade_aside") return "Day-trade aside, not a durable scorecard call.";
  if (t.scoreExclusionReason === "not_investment_call") return "Audited but not an investment call.";
  if (t.scoreExclusionReason === "conditional") return "Conditional call, not active exposure.";
  if (isCryptoReceipt(t) || t.scoreExclusionReason === "crypto") return "Crypto excluded from public-equity scorecard.";
  if ((t.ticker && EXCLUDED_ETFS.has(t.ticker.toUpperCase())) || t.scoreExclusionReason === "benchmark_or_etf") {
    return "Benchmark, ETF, or basket excluded from company scorecard.";
  }
  if (isMacroAsset(t.ticker) || isBroadMarketTake(t) || t.scoreExclusionReason === "macro_asset") {
    return "Broad-market or macro exposure, not a single-company scorecard call.";
  }
  if (!t.ticker || !t.isPublic || t.scoreExclusionReason === "private") return "Private or unpriced company.";
  if (t.scoreExclusionReason === "unpriced") return "No reliable market price.";
  return "Not traded in the public scorecard.";
}

function receiptLabel(t: Thesis): string {
  if (t.scoreReason) return t.scoreReason;
  if (t.callType) return t.callType.replace(/_/g, " ");
  return "Audited receipt";
}

function auditStatus(t: Thesis): { label: string; detail: string; tone: string } {
  const neutral = "border-neutral-500/30 bg-neutral-500/10 text-neutral-500 dark:text-neutral-300";
  if (t.attributionConfidence === "low") {
    return {
      label: "Low attribution",
      detail: "Kept in the catalog, but excluded from scoring because speaker attribution is weak.",
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (isPortfolioScored(t)) {
    if (!isTradableCompanyTake(t)) {
      return {
        label: "Not traded",
        detail: notTradedReason(t),
        tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    }
    const direction = tradeDirectionForTake(t);
    if (direction === "short") {
      return {
        label: "Portfolio short",
        detail: "Opens or reinforces a simulated short exposure in this host's fund.",
        tone: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      };
    }
    if (direction === "long") {
      return {
        label: "Portfolio long",
        detail: "Opens or reinforces a simulated long exposure in this host's fund.",
        tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    }
    return {
      label: "Exit / close",
      detail: "Closes a prior simulated exposure without opening a new one.",
      tone: "border-neutral-500/30 bg-neutral-500/10 text-neutral-500 dark:text-neutral-300",
    };
  }
  if (t.scoreCondition || t.scoreExclusionReason) {
    return {
      label: "Not traded",
      detail: notTradedReason(t),
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (t.conviction !== "low") {
    return {
      label: "Scored view",
      detail: "Counts toward the holding's current stance, but does not open a simulated host-fund exposure.",
      tone: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    };
  }
  return {
    label: "Commentary",
    detail: "Shown for context; low-conviction commentary does not move a stance or simulated position.",
    tone: neutral,
  };
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
        for (const t of w.reinforceTakes ?? []) {
          tradeEvents.push({ date: t.episodeDate.slice(0, 10), ticker: c.ticker, slug: c.slug, kind: "reaffirm", direction: w.direction, take: t });
        }
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
  const reaffirmedScoreableTakes = Math.max(0, tradableScoreableTakes.length - (fund?.constituents.length ?? 0));
  const commentaryTakes = takes.length - scoreableTakes.length;
  const auditedNotTraded = takes
    .filter(
      (t) =>
        t.attributionConfidence !== "low" &&
        (Boolean(t.scoreCondition) ||
          Boolean(t.scoreExclusionReason) ||
          (isPortfolioScored(t) && !isTradableCompanyTake(t))),
    )
    .sort((a, b) => b.episodeDate.localeCompare(a.episodeDate));
  const auditLedger = takes.slice().sort((a, b) => b.episodeDate.localeCompare(a.episodeDate));
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
          className="orb-breathe pointer-events-none absolute -top-16 right-0 h-56 w-56 rounded-full opacity-20 blur-3xl sm:-right-16"
          style={{ background: ui.hex }}
        />
        <div className="relative flex flex-wrap items-center gap-5">
          <span
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-2xl font-black text-white"
            style={{ background: ui.hex }}
          >
            {ui.initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl font-bold tracking-tight">{profile?.fullName ?? host}</h1>
              {rank >= 0 && <span className="text-2xl">{RANK_MEDAL[rank] ?? ""}</span>}
            </div>
            <p className="text-sm text-neutral-500">{profile?.blurb}</p>
          </div>
          {entry && entry.positions > 0 && (
            <div className="w-full text-left sm:ml-auto sm:w-auto sm:text-right">
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
            <MethodStat
              label="Public exposures"
              value={fund.constituents.length}
              note={reaffirmedScoreableTakes > 0 ? `${reaffirmedScoreableTakes} reaffirm existing exposure.` : "Tradable names in this scorecard."}
            />
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

          {auditedNotTraded.length > 0 && (
            <div className="mt-6 border-t border-neutral-100 pt-4 dark:border-neutral-800">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  Not-traded receipts
                </h3>
                <span className="text-xs text-neutral-500">
                  Conditional, private, macro, or otherwise excluded from the public scorecard
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Receipt</th>
                      <th className="hidden py-2 pr-4 font-medium lg:table-cell">Why not traded</th>
                      <th className="py-2 text-right font-medium">Episode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
                    {auditedNotTraded.map((t) => (
                      <tr key={t.id} className="align-top">
                        <td className="py-3 pr-4">
                          <Link href={`/holding/${t.slug}`} className="font-medium hover:underline">
                            {t.company}
                          </Link>{" "}
                          {t.ticker && <span className="font-mono text-xs text-neutral-400">{t.ticker}</span>}
                          <div className="mt-1 text-xs text-neutral-500">{receiptLabel(t)}</div>
                          {t.quote && (
                            <blockquote className="mt-1 line-clamp-2 text-xs italic leading-relaxed text-neutral-500 dark:text-neutral-400">
                              “{t.quote}”
                            </blockquote>
                          )}
                          <div className="mt-1 text-xs text-neutral-500 lg:hidden">{notTradedReason(t)}</div>
                        </td>
                        <td className="hidden py-3 pr-4 text-xs leading-relaxed text-neutral-500 lg:table-cell">
                          {notTradedReason(t)}
                        </td>
                        <td className="py-3 text-right text-xs text-neutral-500">
                          <Link href={`/episode/${t.episodeId}`} className="font-mono hover:text-neutral-200 hover:underline">
                            {t.episodeNumber ? `E${t.episodeNumber}` : t.episodeId}
                          </Link>
                          {(episodes[t.episodeId]?.audioUrl || episodeLinks[t.episodeId]) && (
                            <span className="mt-1 block">
                              <ListenButton
                                meta={episodes[t.episodeId]}
                                episodeId={t.episodeId}
                                startMs={t.quoteStartMs}
                                caption={`${host} on ${t.company}`}
                                fallbackLink={episodeLinks[t.episodeId]}
                              />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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

      <Reveal>
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold tracking-tight">Audited takes</h2>
          <span className="text-xs text-neutral-500">
            {auditLedger.length} extracted receipts · every row keeps its scoring label
          </span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:border-neutral-800">
              <tr>
                <th className="px-4 py-3 font-medium">Take</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Classification</th>
                <th className="px-4 py-3 font-medium">Stance</th>
                <th className="px-4 py-3 text-right font-medium">Episode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
              {auditLedger.map((t) => {
                const status = auditStatus(t);
                return (
                  <tr key={t.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/holding/${t.slug}`} className="font-medium hover:underline">
                        {t.company}
                      </Link>{" "}
                      {t.ticker && <span className="font-mono text-xs text-neutral-400">{t.ticker}</span>}
                      <div className="mt-1 text-xs leading-relaxed text-neutral-500">{t.summary}</div>
                      {t.quote && (
                        <blockquote className="mt-1 line-clamp-2 text-xs italic leading-relaxed text-neutral-500 dark:text-neutral-400">
                          “{t.quote}”
                        </blockquote>
                      )}
                      <div className="mt-2 md:hidden">
                        <AuditStatusBadge t={t} />
                        <div className="mt-1 text-xs leading-relaxed text-neutral-500">{status.detail}</div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <AuditStatusBadge t={t} />
                      <div className="mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">{status.detail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <StanceBadge stance={t.stance} />
                        <span className="text-[11px] uppercase tracking-wide text-neutral-500">{t.conviction} conviction</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-neutral-500">
                      <Link href={`/episode/${t.episodeId}`} className="font-mono hover:text-neutral-200 hover:underline">
                        {t.episodeNumber ? `E${t.episodeNumber}` : t.episodeId}
                      </Link>
                      <div>{fmtDate(t.episodeDate)}</div>
                      {(episodes[t.episodeId]?.audioUrl || episodeLinks[t.episodeId]) && (
                        <span className="mt-1 block">
                          <ListenButton
                            meta={episodes[t.episodeId]}
                            episodeId={t.episodeId}
                            startMs={t.quoteStartMs}
                            caption={`${host} on ${t.company}`}
                            fallbackLink={episodeLinks[t.episodeId]}
                          />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      </Reveal>

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
