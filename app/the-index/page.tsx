import Link from "next/link";
import type { CSSProperties } from "react";
import { getIndex } from "@/lib/data";
import { pct, returnColor, fmtDate, fmtMoney } from "@/lib/format";
import { IndexChart } from "@/app/components/IndexChart";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { HostStack } from "@/app/components/host";
import { Reveal } from "@/app/components/Reveal";
import { BackLink } from "@/app/components/BackLink";
import { LinkRow } from "@/app/components/LinkRow";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export const metadata = {
  title: "The Besties Index — constituents & methodology",
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

  return (
    <div className="space-y-8">
      <BackLink href="/">Home</BackLink>

      <header className="rise space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">The Besties Index</h1>
        <p className="max-w-2xl text-neutral-600 dark:text-neutral-400">
          A rules-based, equal-weight long basket of public companies where the hosts&apos;
          current scored view is net-bullish — bought when that bullish stance was adopted,
          held to today, and benchmarked against the S&amp;P with identical cashflows.
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
                <span className="text-neutral-600">— the tougher benchmark, shown on purpose</span>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Constituents · sorted by alpha
        </h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:border-neutral-800">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Entry</th>
                <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Entry → now</th>
                <th className="px-4 py-3 text-right font-medium">Return</th>
                <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">S&amp;P</th>
                <th className="px-4 py-3 text-right font-medium">Alpha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
              {fund.constituents.map((c, i) => (
                <LinkRow key={c.slug} href={`/holding/${c.slug}`} className="group transition-colors hover:bg-white/[0.025]">
                  <td className="px-4 py-3 text-neutral-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/holding/${c.slug}`} className="flex items-center gap-2.5 font-medium">
                      <CompanyLogo name={c.company} domain={domainOf.get(c.slug)} size="sm" />
                      <span className="group-hover:underline">{c.company}</span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800">{c.ticker}</span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-neutral-500 sm:table-cell">{fmtDate(c.entryDate)}</td>
                  <td className="hidden px-4 py-3 text-right font-mono tabular-nums text-neutral-500 md:table-cell">
                    {fmtMoney(c.entryPrice, c)} → {fmtMoney(c.latestPrice, c)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono tabular-nums ${returnColor(c.sinceReturn)}`}>{pct(c.sinceReturn)}</td>
                  <td className="hidden px-4 py-3 text-right font-mono tabular-nums text-neutral-500 sm:table-cell">{pct(c.benchmarkReturn)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${returnColor(c.alpha)}`}>
                    {c.alpha >= 0 ? "+" : ""}{(c.alpha * 100).toFixed(1)}pp
                  </td>
                </LinkRow>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </Reveal>

      {/* Excluded private */}
      {fund.excludedPrivate.length > 0 && (
        <Reveal>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Bullish but not investable · {fund.excludedPrivate.length} private companies
          </h2>
          <p className="text-sm text-neutral-500">
            Net-bullish calls on private companies — tracked in the catalog, excluded from the
            tradable index until there&apos;s a public market.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {fund.excludedPrivate.map((p) => (
              <Link
                key={p.slug}
                href={`/holding/${p.slug}`}
                className="rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
              >
                {p.company}
              </Link>
            ))}
          </div>
        </section>
        </Reveal>
      )}

      {/* Guesties — the fun side index */}
      {guesties && (
        <Reveal>
        <section id="guesties" className="scroll-mt-28 space-y-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-5 dark:border-violet-900/60 dark:bg-violet-950/20 sm:p-6">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
              The Guesties Index <span className="text-base font-normal">🎤</span>
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
              The same idea, but for the <em>guests</em> — every net-bullish public call made by
              someone the besties had on the show. How do the invited experts stack up?
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
                <p className="mt-0.5 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
                  Named guests with 2+ scored public calls, ranked by how those calls have
                  played out. Each call is scored as if you&apos;d <em>followed it</em> — long a
                  bull, an inverse-sized stake on a bear (capped at −100%) — versus simply buying
                  the S&amp;P over the same window.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-violet-200 bg-white dark:border-violet-900/50 dark:bg-neutral-900">
                <table className="w-full text-sm">
                  <thead className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:border-neutral-800">
                    <tr>
                      <th className="px-4 py-3 font-medium">Guest</th>
                      <th className="px-4 py-3 text-right font-medium">Calls</th>
                      <th className="px-4 py-3 text-right font-medium">Follow return</th>
                      <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">vs S&amp;P</th>
                      <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Best call</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
                    {guestLeaders.map((g, i) => (
                      <LinkRow key={g.guest} href={`/guest/${g.slug}`} className="group transition-colors hover:bg-violet-50/40 dark:hover:bg-violet-950/20">
                        <td className="px-4 py-3">
                          <span className="mr-2 inline-block w-4 text-right font-mono text-xs text-neutral-400">{i + 1}</span>
                          <Link href={`/guest/${g.slug}`} className="relative z-10 font-medium group-hover:underline">{g.guest}</Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{g.calls}</td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums ${returnColor(g.followReturn)}`}>
                          {pct(g.followReturn)}
                        </td>
                        <td className="hidden px-4 py-3 text-right font-mono tabular-nums sm:table-cell">
                          <span className={returnColor(g.alpha)}>{g.alpha >= 0 ? "+" : ""}{(g.alpha * 100).toFixed(1)}pp</span>
                        </td>
                        <td className="hidden px-4 py-3 text-right md:table-cell">
                          {g.best ? (
                            <Link href={`/holding/${g.best.slug}`} className="relative z-10 font-mono text-xs hover:underline">
                              <span className="text-neutral-600 dark:text-neutral-300">{g.best.ticker}</span>{" "}
                              <span className={returnColor(g.best.ret)}>{g.best.ret >= 0 ? "+" : ""}{(g.best.ret * 100).toFixed(0)}%</span>
                            </Link>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                      </LinkRow>
                    ))}
                  </tbody>
                </table>
              </div>
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
              <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
                Every public name the besties are currently net-bearish on, scored as if you&apos;d
                shorted when that bear stance was adopted. Sorted by how wrong it has gone.
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

            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:border-neutral-800">
                  <tr>
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Bear since</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Who</th>
                    <th className="px-4 py-3 text-right font-medium">Stock since</th>
                    <th className="px-4 py-3 text-right font-medium">If shorted</th>
                    <th className="px-4 py-3 text-right font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
                  {bearBook.map((b) => {
                    const short = Math.max(-b.sinceReturn, -1);
                    const wiped = -b.sinceReturn < -1;
                    const wrongCall = b.sinceReturn > 0.02;
                    const rightCall = b.sinceReturn < -0.02;
                    const ageDays = Math.round((asOfMs - Date.parse(b.entryDate)) / 86400000);
                    return (
                      <LinkRow key={b.slug} href={`/holding/${b.slug}`} className="group transition-colors hover:bg-white/[0.025]">
                        <td className="px-4 py-3">
                          <Link href={`/holding/${b.slug}`} className="flex items-center gap-2.5 font-medium">
                            <CompanyLogo name={b.company} domain={domainOf.get(b.slug)} size="sm" />
                            <span className="group-hover:underline">{b.company}</span>
                            <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800">{b.ticker}</span>
                          </Link>
                        </td>
                        <td className="hidden px-4 py-3 text-neutral-500 sm:table-cell">
                          {fmtDate(b.entryDate)}
                          {ageDays > 90 && (
                            <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400" title="No fresh take since — view may be stale">
                              · {ageDays}d
                            </span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell"><HostStack hosts={b.hosts} size="sm" /></td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums ${returnColor(b.sinceReturn)}`}>
                          {pct(b.sinceReturn)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono tabular-nums ${returnColor(short)}`}
                          title={wiped ? "Capped at −100% — a real short is wiped out; no margin mechanics modeled." : undefined}
                        >
                          {pct(short)}
                          {wiped && <span className="text-neutral-500">*</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold">
                          {wrongCall ? (
                            <span className="text-rose-500 dark:text-rose-400">✗ wrong</span>
                          ) : rightCall ? (
                            <span className="text-emerald-600 dark:text-emerald-400">✓ right</span>
                          ) : (
                            <span className="text-neutral-400">· early</span>
                          )}
                        </td>
                      </LinkRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
      <section id="methodology" className="scroll-mt-28 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm leading-relaxed text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
        <h2 className="mb-2 font-semibold text-neutral-700 dark:text-neutral-200">Methodology</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>One index position per public company whose <strong>current scored view</strong> is net-bullish across the selected hosts; bearish/mixed/neutral names are excluded.</li>
          <li><strong>Scored views</strong> are medium- or high-conviction, attributed theses. They can move a holding&apos;s stance and the Besties Index, even when the host was analyzing the company rather than saying &quot;buy this stock.&quot;</li>
          <li><strong>Portfolio-scored calls</strong> are a narrower subset: clear in/out language, ranked investment selections, explicit shorts, or named pair/basket legs. Host funds use only these exposure windows.</li>
          <li>Host pages show the <strong>calls behind the score</strong>; holding pages keep the <strong>full company history</strong>, including extra commentary mentions.</li>
          <li>A holding&apos;s stance is its <strong>current</strong> view — the balance of each host&apos;s latest scored take — and is judged only over the window since that view was adopted. Evolved names additionally show a <strong>follow-their-calls</strong> return (long in bullish stretches, short in bearish, flat when split).</li>
          <li>Benchmark ETFs (SPY, QQQ, …), broad-market/macro calls, private companies, and crypto tokens are tracked when useful but excluded from the public-company index.</li>
          <li>Two benchmarks, both with identical cashflows: the S&amp;P (SPY) and the tougher tech-heavy QQQ — published so you don&apos;t have to ask.</li>
          <li>Follow-their-calls, duels, and episode scorecards use sampled (~weekly) price history — directionally solid, not penny-accurate. The index and host funds use full daily closes.</li>
          <li><strong>Equal weight</strong>: {dollars(fund.contributionPerCall)} notionally invested in each at the close when its current bullish stance was adopted, held to today.</li>
          <li>The benchmark ({fund.benchmarkSymbol}) receives the <strong>identical cashflows on the identical dates</strong>, so the comparison isolates stock selection.</li>
          <li>Private companies are excluded (no public market). Returns are price-only, exclude dividends and trading costs, and are <strong>not investment advice</strong>.</li>
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
