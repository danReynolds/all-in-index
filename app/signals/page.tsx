import Link from "next/link";
import { getIndex } from "@/lib/data";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { HostStack, HostAvatar } from "@/app/components/host";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { HOST_UI } from "@/lib/hosts";
import {
  consensusBulls,
  consensusVsSolo,
  convictionBuckets,
  flipsByHost,
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
  const conviction = convictionBuckets(snapshot);
  const flips = flipsByHost(snapshot);
  const flipped = mostFlipped(snapshot);
  const duels = activeDuels(snapshot);
  const maxFlips = Math.max(1, ...flips.map((f) => f.flips));

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
          Signals
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          What the table is telling you
        </h1>
        <p className="max-w-2xl text-neutral-600 dark:text-neutral-400">
          Patterns mined from every take in the catalog — what historically mattered, and where
          the besties stand right now.
        </p>
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
            label="Calls where 2+ besties agreed"
            value={pp(cvs.consensus.meanAlpha)}
            sub={`mean alpha vs S&P · ${cvs.consensus.n} calls`}
            good
          />
          <StatCard
            label="Solo calls"
            value={pp(cvs.solo.meanAlpha)}
            sub={`mean alpha vs S&P · ${cvs.solo.n} calls`}
          />
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="mb-1 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            Where the table agrees today
          </h3>
          <p className="mb-3 text-xs text-neutral-400">
            Two or more besties currently bullish (medium+ conviction). Return shown is since the
            table&apos;s first call on the name.
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
          sub="How hard they commit predicts how the call goes."
        />
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="space-y-3">
            {conviction.map((b) => {
              const w =
                b.meanAlpha == null
                  ? 0
                  : Math.min(100, Math.abs(b.meanAlpha) * 130);
              const positive = (b.meanAlpha ?? 0) >= 0;
              return (
                <div key={b.label} className="flex items-center gap-4">
                  <span className="w-20 text-sm font-medium capitalize">{b.label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className={`h-full rounded-full ${positive ? "bg-emerald-500" : "bg-rose-500"}`}
                      style={{ width: `${w}%` }}
                    />
                  </div>
                  <span className={`w-20 text-right font-mono text-sm tabular-nums ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {pp(b.meanAlpha)}
                  </span>
                  <span className="w-14 text-right text-xs text-neutral-400">n={b.n}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-neutral-400">
            Mean alpha vs the S&P of index positions, bucketed by the strongest conviction any
            bestie showed on the bull case. Hedged calls have historically been the ones to fade.
          </p>
        </div>
      </section>

      {/* Flips */}
      <section className="space-y-4">
        <SectionHead
          emoji="🔄"
          title="The Flip Tracker"
          sub="Full bull↔bear reversals, by host and by name."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">By host</h3>
            <div className="space-y-3">
              {flips.map((f) => (
                <Link key={f.host} href={`/host/${f.host.toLowerCase()}`} className="flex items-center gap-3">
                  <HostAvatar host={f.host} size="md" />
                  <span className="w-20 text-sm font-medium">{f.host}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(f.flips / maxFlips) * 100}%`,
                        background: HOST_UI[f.host].hex,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-sm tabular-nums">{f.flips}</span>
                </Link>
              ))}
            </div>
          </div>
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
              company, counting only medium-or-higher-conviction takes. Click a name to replay
              the whole journey.
            </p>
          </div>
        </div>
      </section>

      {/* Duels */}
      <section className="space-y-4">
        <SectionHead
          emoji="⚔️"
          title="Open Duels"
          sub="Names where the table is actively split — and who's winning."
        />
        {duels.length === 0 ? (
          <p className="text-sm text-neutral-500">No live disagreements on priced names right now.</p>
        ) : (
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
        )}
      </section>
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
