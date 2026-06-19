import Link from "next/link";
import type { CSSProperties } from "react";
import { getIndex } from "@/lib/data";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { displayStance } from "@/lib/calls";
import { StanceBadge, SampleBanner } from "@/app/components/badges";
import { IndexChart } from "@/app/components/IndexChart";
import { Leaderboard } from "@/app/components/Leaderboard";
import { HoldingsTable } from "@/app/components/HoldingsTable";
import { toHoldingRow } from "@/lib/projections";
import { HostStack } from "@/app/components/host";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { Logo } from "@/app/components/Logo";
import { Reveal } from "@/app/components/Reveal";
import { isMacroAsset } from "@/lib/assets";
import type { Holding, IndexFund } from "@/lib/types";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export const metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  const { snapshot, isSample } = getIndex();
  const holdings = snapshot.holdings;
  const fund = snapshot.indexFund ?? null;
  const guesties = snapshot.guestiesFund ?? null;
  const leaderboard = snapshot.leaderboard ?? [];
  const publicHoldings = holdings.filter((h) => h.ticker && !isMacroAsset(h.ticker));
  const macroHoldings = holdings.filter((h) => isMacroAsset(h.ticker));
  const privateHoldings = holdings.filter((h) => !h.ticker);
  const totalTheses = holdings.reduce((n, h) => n + h.mentionCount, 0);

  return (
    <div className="space-y-10">
      {fund ? <Hero fund={fund} /> : <PlainHeader />}

      {guesties && (
        <Reveal>
          <GuestiesTeaser guesties={guesties} bestiesReturn={fund?.portfolioReturn} />
        </Reveal>
      )}

      {isSample && <SampleBanner />}

      {leaderboard.length > 0 && <Leaderboard entries={leaderboard} />}

      <Reveal>
        <HoldingsTable holdings={publicHoldings.map(toHoldingRow)} title="Public companies" />
      </Reveal>

      {macroHoldings.length > 0 && (
        <Reveal>
          <HoldingsTable
            holdings={macroHoldings.map(toHoldingRow)}
            title="Commodities, sectors & macro"
            subtitle="priced via ETF proxies · never part of the index or funds"
            entityLabel="Asset"
          />
        </Reveal>
      )}

      <PrivateSection holdings={privateHoldings} />

      <p className="pt-2 text-xs text-neutral-400">
        Built from {snapshot.episodesProcessed} episodes · {holdings.length} companies ·{" "}
        {totalTheses} theses · updated {fmtDate(snapshot.generatedAt)}.
      </p>
    </div>
  );
}

function Hero({ fund }: { fund: IndexFund }) {
  const dollars = (n: number) => "$" + Math.round(n).toLocaleString();
  return (
    <section className="relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 p-6 text-white sm:p-9">
      <div
        className="orb-breathe pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, #10b981, transparent 70%)" }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:22px_22px]" />

      <div className="relative">
        <div className="rise flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Logo size={22} /> The All-Index
        </div>

        <div className="mt-6 grid items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <div className="rise font-display text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400" style={d(60)}>
              The Besties Index
            </div>
            <div className={`rise mt-1 font-display text-6xl font-bold tracking-tight tabular-nums sm:text-7xl ${fund.portfolioReturn >= 0 ? "text-emerald-400" : "text-rose-400"}`} style={d(120)}>
              {pct(fund.portfolioReturn)}
            </div>
            <div className="rise mt-2 text-sm text-neutral-300" style={d(200)}>
              vs the S&amp;P&apos;s{" "}
              <span className="font-semibold text-white">{pct(fund.benchmarkReturn)}</span> —{" "}
              <span className={fund.outperformance >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {fund.outperformance >= 0 ? "+" : ""}
                {(fund.outperformance * 100).toFixed(1)}pp
              </span>{" "}
              since {fmtDate(fund.inceptionDate)}
            </div>
            <p className="rise mt-4 max-w-md text-sm leading-relaxed text-neutral-400" style={d(280)}>
              If you&apos;d put {dollars(fund.contributionPerCall)} into each of{" "}
              <strong className="text-neutral-200">{fund.constituents.length}</strong>
              {" companies the besties turned bullish on — at the price the day they said it — you'd have "}
              <strong className="text-emerald-400">{dollars(fund.portfolioValue)}</strong>
              {" today vs "}
              {dollars(fund.benchmarkValue)}
              {" in the S&P."}
            </p>
            <div className="rise mt-5 flex flex-wrap gap-2" style={d(360)}>
              <Link
                href="/the-index"
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-400 hover:shadow-[0_0_24px_-6px_rgba(16,185,129,0.7)]"
              >
                Explore the index <span className="arrow-nudge">→</span>
              </Link>
              {fund.constituents[0] && (
                <Link
                  href={`/holding/${fund.constituents[0].slug}`}
                  className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
                >
                  Best call: {fund.constituents[0].company}{" "}
                  <span className="text-emerald-400">{pct(fund.constituents[0].sinceReturn)}</span>{" "}
                  <span className="arrow-nudge">→</span>
                </Link>
              )}
            </div>
          </div>

          <div className="rise min-w-0" style={d(240)}>
            <div className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/5">
              <IndexChart series={fund.series} benchmarkSymbol={fund.benchmarkSymbol} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
              <Link href="/the-index#methodology" className="hover:text-neutral-300 hover:underline">
                How the index works <span className="arrow-nudge">→</span>
              </Link>
              <span>Not financial advice.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlainHeader() {
  return (
    <section className="space-y-3">
      <h1 className="font-display text-4xl font-bold tracking-tight">The All-Index</h1>
      <p className="max-w-2xl text-neutral-500 dark:text-neutral-400">
        What the besties said about every company — and how it played out.
      </p>
    </section>
  );
}

function GuestiesTeaser({ guesties, bestiesReturn }: { guesties: IndexFund; bestiesReturn?: number }) {
  const beat = bestiesReturn != null && bestiesReturn > guesties.portfolioReturn;
  return (
    <Link
      href="/the-index#guesties"
      className="flex items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-5 py-3 text-sm transition-colors hover:border-violet-300 dark:border-violet-900/60 dark:bg-violet-950/25"
    >
      <span className="text-neutral-700 dark:text-neutral-200">
        <strong>The Guesties Index</strong> — how the experts they invited on actually did
        {beat && <span className="ml-2 hidden text-violet-600 dark:text-violet-300 sm:inline">(the besties are winning)</span>}
      </span>
      <span className="whitespace-nowrap font-mono tabular-nums">
        <span className={returnColor(guesties.portfolioReturn)}>{pct(guesties.portfolioReturn)}</span>{" "}
        <span className="arrow-nudge text-neutral-400">→</span>
      </span>
    </Link>
  );
}

function PrivateSection({ holdings }: { holdings: Holding[] }) {
  if (holdings.length === 0) return null;
  const sorted = holdings.slice().sort((a, b) => b.mentionCount - a.mentionCount);
  return (
    <Reveal stagger>
      <section className="space-y-3">
      <div className="stagger-item flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight">Private companies</h2>
        <span className="text-xs text-neutral-500">no public price — tracked by what they said</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((h, i) => (
          <Link
            key={h.slug}
            href={`/holding/${h.slug}`}
            style={d(Math.min(i, 8) * 55)}
            className="group stagger-item card-lift sheen rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2.5 font-semibold">
                <CompanyLogo name={h.company} domain={h.domain} size="sm" />
                <span className="group-hover:underline">{h.company}</span>
              </span>
              {(() => {
                const ds = displayStance(h.theses);
                return ds !== "none" ? <StanceBadge stance={ds} /> : null;
              })()}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <HostStack hosts={h.theses.map((t) => t.host)} />
              <span className="text-xs text-neutral-400">
                {h.mentionCount} {h.mentionCount === 1 ? "take" : "takes"}
              </span>
            </div>
            <div className="mt-2 text-xs text-neutral-400">since {fmtDate(h.firstMentioned)}</div>
          </Link>
        ))}
      </div>
      </section>
    </Reveal>
  );
}
