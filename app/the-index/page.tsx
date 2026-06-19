import Link from "next/link";
import type { CSSProperties } from "react";
import { getIndex } from "@/lib/data";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { IndexChart } from "@/app/components/IndexChart";
import { Reveal } from "@/app/components/Reveal";
import { BackLink } from "@/app/components/BackLink";
import { ConstituentsTable, BearBookTable, GuestLeaderboardTable } from "@/app/components/IndexTables";
import type { ExcludedKind } from "@/lib/types";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export const metadata = {
  title: "The Besties Index — constituents & methodology",
  alternates: { canonical: "/the-index" },
};

export default function IndexPage() {
  const { snapshot } = getIndex();
  const fund = snapshot.indexFund ?? null;
  const guesties = snapshot.guestiesFund ?? null;
  const bearBook = snapshot.bearBook ?? [];
  // Named-guest scorecards — only those with a real track record (2+ scored calls);
  // a single call is luck, not a record.
  const guestLeaders = (snapshot.guestLeaderboard ?? []).filter((g) => g.calls >= 2);

  if (!fund) {
    return (
      <div className="space-y-4">
        <BackLink href="/">Home</BackLink>
        <p className="text-neutral-500">The index hasn&apos;t been built yet. Run the pipeline first.</p>
      </div>
    );
  }

  const dollars = (n: number) => "$" + Math.round(n).toLocaleString();
  const asOfMs = Date.parse(`${fund.asOf}T00:00:00Z`);
  const domainOf = new Map(snapshot.holdings.map((h) => [h.slug, h.domain ?? null]));
  const wins = fund.constituents.filter((c) => c.alpha > 0).length;
  const medianSince = (() => {
    const r = fund.constituents.map((c) => c.sinceReturn).sort((a, b) => a - b);
    return r.length ? r[Math.floor(r.length / 2)] : 0;
  })();
  const constituentRows = fund.constituents.map((c) => ({ ...c, domain: domainOf.get(c.slug) ?? null }));
  const bearRows = bearBook.map((b) => ({ ...b, domain: domainOf.get(b.slug) ?? null }));

  return (
    <div className="space-y-8">
      <BackLink href="/">Home</BackLink>

      <header className="rise space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">The Besties Index</h1>
        <p className="max-w-2xl text-neutral-500 dark:text-neutral-400">
          Every public stock the besties actually called a buy — equal-weighted, bought at the
          price the day they said it and held to today, measured against the S&amp;P over the same
          stretch. Looking for the names they&apos;ve turned bearish on? Those live in{" "}
          <Link href="#bear-book" className="text-rose-600 hover:underline dark:text-rose-400">the Bear Book</Link>.
        </p>
      </header>

      {/* Headline + chart */}
      <section className="rise rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6" style={d(120)}>
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <div className={`font-display text-4xl font-bold tabular-nums ${returnColor(fund.portfolioReturn)}`}>
              {pct(fund.portfolioReturn)}
            </div>
            <div className="text-sm text-neutral-500">
              vs S&amp;P <span className="font-medium text-neutral-700 dark:text-neutral-300">{pct(fund.benchmarkReturn)}</span>{" "}
              · <span className={returnColor(fund.outperformance)}>{fund.outperformance >= 0 ? "+" : ""}{(fund.outperformance * 100).toFixed(1)}pp</span>
            </div>
            {fund.altBenchmark && (
              <div className="text-sm text-neutral-500">
                vs {fund.altBenchmark.symbol}{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{pct(fund.altBenchmark.ret)}</span>{" "}
                · <span className={returnColor(fund.portfolioReturn - fund.altBenchmark.ret)}>
                  {fund.portfolioReturn - fund.altBenchmark.ret >= 0 ? "+" : ""}
                  {((fund.portfolioReturn - fund.altBenchmark.ret) * 100).toFixed(1)}pp
                </span>{" "}
                <span className="text-neutral-500">— the tougher benchmark, shown on purpose</span>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 pt-1 text-sm">
              <Stat label="Positions" value={String(fund.constituents.length)} />
              <Stat label="Inception" value={fmtDate(fund.inceptionDate)} />
              <Stat label="Hit rate" value={`${wins}/${fund.constituents.length} beat S&P`} />
              <Stat label="Median call" value={pct(medianSince)} />
              <Stat label="Invested" value={dollars(fund.totalInvested)} />
              <Stat label="Value" value={dollars(fund.portfolioValue)} />
            </dl>
          </div>
          <div className="min-w-0">
            <IndexChart series={fund.series} benchmarkSymbol={fund.benchmarkSymbol} />
          </div>
        </div>
      </section>

      {/* Constituents */}
      <Reveal>
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Positions</h2>
          <span className="text-xs text-neutral-500">
            {fund.constituents.length} longs · tap a column to sort
          </span>
        </div>
        <ConstituentsTable rows={constituentRows} />
      </section>
      </Reveal>

      {/* Bullish, but outside the single-name index — grouped by why */}
      {fund.excludedPrivate.length > 0 && (() => {
        const GROUPS: Array<{ kind: ExcludedKind; label: string; note: string }> = [
          { kind: "private", label: "Private companies", note: "No public stock to buy yet — we still track every call." },
          { kind: "going_private", label: "Going private", note: "Under a definitive cash take-private — public holders are cashed out at the deal price, so there's no forward stock performance to track; the upside accrues to the private buyers." },
          { kind: "crypto", label: "Crypto", note: "Investable, but via spot ETFs or tokens rather than single-name equities — tracked, outside the stock index." },
          { kind: "macro", label: "Macro & baskets", note: "Broad or multi-name bets with no single ticker to hold." },
        ];
        return (
          <Reveal>
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Bullish, but outside the index · {fund.excludedPrivate.length}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Buy calls that don&apos;t map to one public stock you could hold — private companies,
                crypto, broad bets. We still track them; they just can&apos;t sit in the index.
              </p>
            </div>
            {GROUPS.map(({ kind, label, note }) => {
              const items = fund.excludedPrivate.filter((p) => p.kind === kind);
              if (items.length === 0) return null;
              return (
                <div key={kind} className="space-y-1.5">
                  <div className="text-xs font-medium text-neutral-400">
                    {label} <span className="text-neutral-500">· {items.length}</span>
                  </div>
                  <p className="text-xs text-neutral-500">{note}</p>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {items.map((p) => (
                      <Link
                        key={p.slug}
                        href={`/holding/${p.slug}`}
                        className="rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-500 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
                      >
                        {p.company}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
          </Reveal>
        );
      })()}

      {/* Guesties — the fun side index */}
      {guesties && (
        <Reveal>
        <section id="guesties" className="scroll-mt-28 space-y-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-5 dark:border-violet-900/60 dark:bg-violet-950/20 sm:p-6">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
              The Guesties Index <span className="text-base font-normal">🎤</span>
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
              Same scoreboard, but for the <em>guests</em> — every buy call made by someone the
              besties brought on the show. How do the invited experts stack up?
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <div className="space-y-2">
              <div className={`font-display text-3xl font-bold tabular-nums ${returnColor(guesties.portfolioReturn)}`}>
                {pct(guesties.portfolioReturn)}
              </div>
              <div className="text-sm text-neutral-500">
                vs S&amp;P <span className="font-medium text-neutral-700 dark:text-neutral-300">{pct(guesties.benchmarkReturn)}</span>{" "}
                · <span className={returnColor(guesties.outperformance)}>{guesties.outperformance >= 0 ? "+" : ""}{(guesties.outperformance * 100).toFixed(1)}pp</span>
              </div>
              <div className="text-xs text-neutral-400">
                {guesties.constituents.length} guest calls · besties did{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{fund ? pct(fund.portfolioReturn) : "—"}</span>
              </div>
            </div>
            <div className="min-w-0">
              <IndexChart series={guesties.series} benchmarkSymbol={guesties.benchmarkSymbol} label="Guesties Index" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {guesties.constituents.map((c) => (
              <Link
                key={c.slug}
                href={`/holding/${c.slug}`}
                className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                {c.ticker} <span className={`font-mono ${returnColor(c.alpha)}`}>{c.alpha >= 0 ? "+" : ""}{(c.alpha * 100).toFixed(0)}pp</span>
              </Link>
            ))}
          </div>

          {guestLeaders.length > 0 && (
            <div className="space-y-3 pt-2">
              <div>
                <h3 className="font-display text-base font-bold tracking-tight">Guest leaderboard</h3>
                <p className="mt-0.5 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
                  Named guests with 2+ scored public calls, ranked by how those calls have
                  played out. Each call is scored as if you&apos;d <em>followed it</em> — long a
                  bull, an inverse-sized stake on a bear (capped at −100%) — versus simply buying
                  the S&amp;P over the same window.
                </p>
              </div>
              <GuestLeaderboardTable rows={guestLeaders} />
            </div>
          )}
        </section>
        </Reveal>
      )}

      {/* The Bear Book */}
      {bearBook.length > 0 && (() => {
        const right = bearBook.filter((b) => b.sinceReturn < -0.02).length;
        const wrong = bearBook.filter((b) => b.sinceReturn > 0.02).length;
        const avgMove = bearBook.reduce((s, b) => s + b.sinceReturn, 0) / bearBook.length;
        // A real short is wiped out at −100%; cap each leg there.
        const shortPnl = bearBook.reduce((s, b) => s + Math.max(-b.sinceReturn, -1), 0) / bearBook.length;
        return (
          <Reveal>
          <section id="bear-book" className="scroll-mt-28 space-y-4 rounded-2xl border border-rose-200 bg-rose-50/40 p-5 dark:border-rose-900/50 dark:bg-rose-950/15 sm:p-6">
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight">The Bear Book 🐻</h2>
              <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
                The flip side of the index: every public stock the besties have called a{" "}
                <em>short</em> or a sell. Each one is scored as if you&apos;d shorted it the day
                they made the call.
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <BearStat label="Bear calls" value={String(bearBook.length)} />
              <BearStat
                label="Hit rate"
                value={`${Math.round((right / bearBook.length) * 100)}%`}
                sub={`${right} right · ${wrong} wrong`}
              />
              <BearStat
                label="Avg stock move since call"
                value={(avgMove >= 0 ? "+" : "") + (avgMove * 100).toFixed(1) + "%"}
                bad={avgMove > 0}
              />
              <BearStat
                label="Shorting them all"
                value={(shortPnl >= 0 ? "+" : "") + (shortPnl * 100).toFixed(1) + "%"}
                bad={shortPnl < 0}
              />
            </dl>

            <BearBookTable rows={bearRows} asOfMs={asOfMs} />
            <p className="text-xs text-neutral-400">
              Price-only, no borrow costs or margin mechanics — a scoreboard, not a strategy.
              Bear calls are never part of the long index above.
            </p>
          </section>
          </Reveal>
        );
      })()}

      {/* Methodology */}
      <Reveal>
      <section id="methodology" className="scroll-mt-28 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm leading-relaxed text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
        <h2 className="mb-2 font-semibold text-neutral-700 dark:text-neutral-200">Methodology</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>The index holds one spot for every public company a bestie currently has an open <strong>buy call</strong> on. Names they&apos;ve shorted or sold sit in the Bear Book instead; names they only talked about don&apos;t count.</li>
          <li>A <strong>call</strong> is something they actually said — &quot;I&apos;m long,&quot; &quot;I just bought,&quot; &quot;my #1 pick,&quot; &quot;this is a short.&quot; Sounding bullish in conversation is <strong>commentary</strong>: it shows up on the company&apos;s page, but it never puts a stock in the index.</li>
          <li>We hold each name from the day of the call until they back off it — an exit, or a flip the other way — then it leaves the index.</li>
          <li>A company&apos;s page keeps everything ever said about it, calls and commentary alike; a host&apos;s page shows just the calls behind their score.</li>
          <li><strong>Equal weight</strong>: {dollars(fund.contributionPerCall)} into each name at the closing price the day the call was made, held to today.</li>
          <li>The benchmark ({fund.benchmarkSymbol}) gets the <strong>same dollars on the same days</strong>, so the only thing being measured is their stock picking. We also run the tougher, tech-heavy QQQ — so you don&apos;t have to ask.</li>
          <li>ETFs, broad-market and macro bets, private companies, and crypto are tracked when useful but kept out of the public-stock index.</li>
          <li>Episode scorecards and &quot;follow their calls&quot; returns use ~weekly price history — directionally solid, not penny-accurate; the index and host funds use full daily closes.</li>
          <li>Returns are price-only — no dividends, no trading costs — and this is <strong>not investment advice</strong>.</li>
          <li>As of {fmtDate(fund.asOf)}.</li>
        </ul>
      </section>
      </Reveal>
    </div>
  );
}

function BearStat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">{label}</dt>
      <dd className={`mt-0.5 font-display text-2xl font-bold tabular-nums ${bad === undefined ? "" : bad ? "text-rose-500 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
        {value}
      </dd>
      {sub && <dd className="text-xs text-neutral-400">{sub}</dd>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
