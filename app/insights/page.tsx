import Link from "next/link";
import { getIndex } from "@/lib/data";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { HostStack } from "@/app/components/host";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { Explainer } from "@/app/components/Explainer";
import { FlipTracker } from "@/app/components/signals/FlipTracker";
import { ConvictionSignal } from "@/app/components/signals/ConvictionSignal";
import { ConsensusCards } from "@/app/components/signals/ConsensusCards";
import {
  consensusBulls,
  consensusVsSoloDetail,
  convictionBucketDetails,
  flipDetailsByHost,
  mostFlipped,
  activeDuels,
} from "@/lib/insights";

export const metadata = {
  title: "Insights",
  description: "What the besties' calls reveal: consensus, conviction, flips, and live disagreements across every call.",
  alternates: { canonical: "/insights" },
};

const pp = (x: number | null) =>
  x == null ? "—" : (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp";

export default function SignalsPage() {
  const { snapshot } = getIndex();
  const consensus = consensusBulls(snapshot);
  const cvs = consensusVsSoloDetail(snapshot);
  const conviction = convictionBucketDetails(snapshot);
  const flipDetails = flipDetailsByHost(snapshot);
  const flipped = mostFlipped(snapshot);
  const duels = activeDuels(snapshot);

  // At-a-glance header badges, so each section telegraphs its takeaway.
  const edge =
    cvs.consensus.meanAlpha != null && cvs.solo.meanAlpha != null
      ? cvs.consensus.meanAlpha - cvs.solo.meanAlpha
      : null;
  const highBucket = conviction.find((b) => b.label === "high");
  const totalFlips = flipDetails.reduce((n, f) => n + f.flips, 0);

  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
          Insights
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          What the besties&apos; calls reveal
        </h1>
        <p className="max-w-2xl text-neutral-500 dark:text-neutral-400">
          Patterns mined from every call in the catalog — what has historically mattered, and
          where the besties stand right now. Tap any stat to see the calls behind it.
        </p>
      </header>

      {/* Consensus */}
      <section className="space-y-4">
        <SectionHead
          emoji="🤝"
          title="The Consensus Meter"
          sub="How calls two or more besties share have done versus solo calls."
          badge={edge != null ? `${edge >= 0 ? "consensus" : "solo"} +${(Math.abs(edge) * 100).toFixed(1)}pp` : undefined}
          detail="Consensus = two or more besties landing the same way on a name; a solo call is one only a single bestie made. Alpha is how much it beat the S&P over the same stretch; the returns below run from the besties' first call on the name. This compares the names they currently hold, not a full historical record."
        />
        <ConsensusCards split={cvs} />
        {edge != null && (
          <p className="text-sm text-neutral-500">
            {edge >= 0 ? (
              <>
                Among the names they currently hold, agreement is worth{" "}
                <strong className="text-neutral-700 dark:text-neutral-200">{pp(edge)} more alpha</strong>{" "}
                than going it alone.
              </>
            ) : (
              <>
                Among the names they currently hold, going it alone has actually edged consensus by{" "}
                <strong className="text-neutral-700 dark:text-neutral-200">{(Math.abs(edge) * 100).toFixed(1)}pp</strong>{" "}
                of alpha.
              </>
            )}
          </p>
        )}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="mb-1 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
            Where the besties agree today
          </h3>
          <p className="mb-3 text-xs text-neutral-400">
            {consensus.length}{" "}names two or more besties are bullish on right now.
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
          sub="How hard they commit predicts how the call pays off."
          badge={highBucket?.meanAlpha != null ? `high: ${pp(highBucket.meanAlpha)}` : undefined}
          detail="How much each call beat the S&P, sorted by how hard the bestie committed — high (said plainly), medium (qualified), or low (a hedged aside, never counted). Turns out the hedged ones are usually the ones to fade."
        />
        <ConvictionSignal buckets={conviction} />
      </section>

      {/* Flips */}
      <section className="space-y-4">
        <SectionHead
          emoji="🔄"
          title="The Flip Tracker"
          sub="Who's changed their mind — tap a host to replay every reversal."
          badge={totalFlips > 0 ? `${totalFlips} reversals` : undefined}
          detail="A flip is a host going from bull to bear (or back) on the same company — only their real, committed takes count, not the mixed or neutral moments in between. Click a name to replay the whole journey on its price chart."
        />
        <FlipTracker byHost={flipDetails} />
        {/* Hottest names overall — a compact "by name" companion to the by-host view above. */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-500">
            Most flip-flopped names
          </span>
          {flipped.map((c) => (
            <Link
              key={c.slug}
              href={`/holding/${c.slug}`}
              className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm transition-colors hover:border-neutral-400 dark:border-neutral-700"
            >
              {c.company}
              <span className="ml-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">{c.flips}×</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Duels */}
      <section className="space-y-4">
        <SectionHead
          emoji="⚔️"
          title="Open Duels"
          sub="Names the besties are split on — and who's winning so far."
          badge={duels.length > 0 ? `${duels.length} live` : undefined}
          detail="A duel is a name some besties are bullish on while others are bearish. Whoever the stock has gone toward since they split takes the lead — up for the bulls, down for the bears, with a tiny ±2% dead zone called a push."
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
          </>
        )}
      </section>
    </div>
  );
}

function SectionHead({
  emoji,
  title,
  sub,
  detail,
  badge,
}: {
  emoji: string;
  title: string;
  sub: string;
  detail?: React.ReactNode;
  badge?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          <span className="mr-2">{emoji}</span>
          {title}
        </h2>
        {badge && (
          <span className="shrink-0 rounded-full border border-neutral-200 px-2.5 py-0.5 font-mono text-xs tabular-nums text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-neutral-500">{sub}</p>
      {detail && (
        <div className="mt-1.5">
          <Explainer summary="Learn more">{detail}</Explainer>
        </div>
      )}
    </div>
  );
}
