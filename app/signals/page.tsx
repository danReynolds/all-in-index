import Link from "next/link";
import { getIndex } from "@/lib/data";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { HostStack } from "@/app/components/host";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { Explainer } from "@/app/components/Explainer";
import { FlipTracker } from "@/app/components/signals/FlipTracker";
import { ConvictionSignal } from "@/app/components/signals/ConvictionSignal";
import {
  consensusBulls,
  consensusVsSolo,
  convictionBucketDetails,
  flipDetailsByHost,
  mostFlipped,
  activeDuels,
} from "@/lib/insights";

export const metadata = {
  title: "Signals — The All-Index",
  description: "What the table is telling you right now: consensus, conviction, flips, and live disagreements.",
};

const pp = (x: number | null) =>
  x == null ? "—" : (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

export default function SignalsPage() {
  const { snapshot } = getIndex();
  const consensus = consensusBulls(snapshot);
  const cvs = consensusVsSolo(snapshot);
  const conviction = convictionBucketDetails(snapshot);
  const flipDetails = flipDetailsByHost(snapshot);
  const flipped = mostFlipped(snapshot);
  const duels = activeDuels(snapshot);

  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
          Signals
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          What the table is telling you
        </h1>
        <p className="max-w-2xl text-neutral-600 dark:text-neutral-400">
          Patterns mined from every scored call in the catalog — what has historically mattered, and
          where the besties stand right now. Tap any chart to see the calls behind it.
        </p>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
          <Explainer summary="The five words to know">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Term term="Alpha">
                Return <em>above the S&amp;P 500</em> over the exact same window. +10pp means the call beat the
                market by 10 percentage points.
              </Term>
              <Term term="Conviction">
                How hard a bestie committed — <strong>high</strong> (&ldquo;this is a great buy&rdquo;),{" "}
                <strong>medium</strong> (a clear but qualified view), or <strong>low</strong> (a hedged aside, never
                scored).
              </Term>
              <Term term="Consensus">
                Two or more besties holding the same current scored stance on a name — versus a solo call only one of
                them made.
              </Term>
              <Term term="Flip">
                A full reversal — bull → bear or back — by the same host on the same company, counting only
                medium-or-higher-conviction takes.
              </Term>
              <Term term="Since return">
                The stock&apos;s move from the table&apos;s first call on it to today. It measures the stock, not
                whether the call was right.
              </Term>
            </dl>
          </Explainer>
        </div>
      </header>

      {/* Consensus */}
      <section className="space-y-4">
        <SectionHead
          emoji="🤝"
          title="The Consensus Meter"
          sub="When two or more besties agree, history says pay attention."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="When 2+ besties agreed"
            value={pp(cvs.consensus.meanAlpha)}
            sub={`mean alpha vs S&P · ${cvs.consensus.n} calls`}
            good
          />
          <StatCard
            label="When just one called it"
            value={pp(cvs.solo.meanAlpha)}
            sub={`mean alpha vs S&P · ${cvs.solo.n} calls`}
          />
        </div>
        <p className="text-sm text-neutral-500">
          Agreement has been worth{" "}
          <strong className="text-neutral-700 dark:text-neutral-200">
            {cvs.consensus.meanAlpha != null && cvs.solo.meanAlpha != null
              ? `${pp(cvs.consensus.meanAlpha - cvs.solo.meanAlpha)} more alpha`
              : "more"}
          </strong>{" "}
          than going it alone.
        </p>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="mb-1 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            Where the table agrees today
          </h3>
          <p className="mb-3 text-xs text-neutral-400">
            {consensus.length}{" "}names where two or more besties are currently bullish (medium+ conviction). Return
            is since the table&apos;s first call.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {consensus.slice(0, 10).map((c) => (
              <Link
                key={c.slug}
                href={`/holding/${c.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2.5 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-600"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CompanyLogo name={c.company} domain={c.domain} size="sm" />
                  <span className="truncate font-medium">{c.company}</span>
                  {c.ticker && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-500 dark:bg-neutral-800">
                      {c.ticker}
                    </span>
                  )}
                  <HostStack hosts={c.hosts} size="sm" />
                </span>
                <span className={`font-mono text-sm tabular-nums ${returnColor(c.sinceReturn)}`}>
                  {c.sinceReturn != null ? pct(c.sinceReturn) : "private"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Conviction */}
      <section className="space-y-4">
        <SectionHead
          emoji="🎯"
          title="The Conviction Signal"
          sub="Group every index call by how hard a bestie committed — then see how each group paid off."
        />
        <ConvictionSignal buckets={conviction} />
      </section>

      {/* Flips */}
      <section className="space-y-4">
        <SectionHead
          emoji="🔄"
          title="The Flip Tracker"
          sub="Full bull↔bear reversals, by host and by name. Tap a host to replay their flips."
        />
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <FlipTracker byHost={flipDetails} />
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              Most flip-flopped names
            </h3>
            <div className="flex flex-wrap gap-2">
              {flipped.map((c) => (
                <Link
                  key={c.slug}
                  href={`/holding/${c.slug}`}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm transition-colors hover:border-neutral-400 dark:border-neutral-700"
                >
                  {c.company}
                  <span className="ml-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {c.flips}×
                  </span>
                </Link>
              ))}
            </div>
            <p className="mt-4 text-xs text-neutral-400">
              A flip is a full reversal — bull to bear or back — by the same host on the same
              company, counting only medium-or-higher-conviction takes. Click a name to replay the
              whole journey on its price chart.
            </p>
          </div>
        </div>
      </section>

      {/* Duels */}
      <section className="space-y-4">
        <SectionHead
          emoji="⚔️"
          title="Open Duels"
          sub="Names where the table is actively split — and who's winning so far."
        />
        {duels.length === 0 ? (
          <p className="text-sm text-neutral-500">No live disagreements on priced names right now.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {duels.slice(0, 6).map((d) => (
                <Link
                  key={d.slug}
                  href={`/holding/${d.slug}`}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 transition-transform hover:-translate-y-0.5 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{d.company}</span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800">
                      {d.ticker}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Bulls</span>
                      <HostStack hosts={d.bulls} size="sm" />
                    </span>
                    <span className="text-xs text-neutral-400">vs</span>
                    <span className="flex items-center gap-2">
                      <HostStack hosts={d.bears} size="sm" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">Bears</span>
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-xs text-neutral-500 dark:border-neutral-800">
                    <span>since {fmtDate(d.sinceDate)}</span>
                    <span className={`font-mono tabular-nums ${returnColor(d.ret)}`}>
                      {d.ret != null ? pct(d.ret) : "—"}
                      {d.winner && d.winner !== "push" && (
                        <span className="ml-1.5 font-sans">{d.winner === "bulls" ? "bulls lead" : "bears lead"}</span>
                      )}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <p className="text-xs text-neutral-400">
              &ldquo;Leads&rdquo; is decided by the stock&apos;s move since the disagreement crystallized — up favors
              the bulls, down the bears, with a ±2% dead zone counted as a push.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-neutral-200">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SectionHead({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div>
      <h2 className="font-display text-xl font-bold tracking-tight">
        <span className="mr-2">{emoji}</span>
        {title}
      </h2>
      <p className="mt-0.5 text-sm text-neutral-500">{sub}</p>
    </div>
  );
}

function StatCard({ label, value, sub, good }: { label: string; value: string; sub: string; good?: boolean }) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 dark:bg-neutral-900 ${
        good
          ? "border-emerald-200 dark:border-emerald-900/60"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="text-sm text-neutral-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${good ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-neutral-400">{sub}</div>
    </div>
  );
}
