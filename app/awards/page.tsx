import Link from "next/link";
import type { CSSProperties } from "react";
import { getIndex } from "@/lib/data";
import { computeAwards } from "@/lib/insights";
import { HostAvatar } from "@/app/components/host";
import { HOST_UI } from "@/lib/hosts";
import { Reveal } from "@/app/components/Reveal";

export const metadata = {
  title: "The Besties Awards",
  description: "The Oracle, the Flip-Flopper, the Call of the Catalog, and the Fumble.",
};

export default function AwardsPage() {
  const { snapshot } = getIndex();
  const awards = computeAwards(snapshot);

  return (
    <div className="space-y-10">
      <header className="rise space-y-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
          The Besties Awards
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          🏆 Honors of the besties
        </h1>
        <p className="mx-auto max-w-2xl text-neutral-600 dark:text-neutral-400">
          Computed live from every call in the catalog — no judges, no recounts, no mercy.
        </p>
      </header>

      <Reveal stagger>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {awards.map((a, i) => (
          <Link
            key={a.key}
            href={a.href ?? "#"}
            style={{ "--d": `${(i % 6) * 70}ms` } as CSSProperties}
            className="group stagger-item card-lift sheen relative overflow-hidden rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
          >
            {a.host && (
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-15 blur-2xl"
                style={{ background: HOST_UI[a.host].hex }}
              />
            )}
            <div className="inline-block text-4xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">{a.emoji}</div>
            <div className="mt-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {a.title}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-lg font-bold">
              {a.host && <HostAvatar host={a.host} size="md" />}
              {a.recipient}
            </div>
            <div className="mt-1 font-mono text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
              {a.stat}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">{a.detail}</p>
            <span className="mt-3 inline-block text-xs font-medium text-neutral-400 transition-colors group-hover:text-neutral-700 dark:group-hover:text-neutral-200">
              See the receipts <span className="arrow-nudge">→</span>
            </span>
          </Link>
        ))}
      </div>
      </Reveal>

      <p className="text-center text-xs text-neutral-400">
        Awards recompute automatically as new episodes drop. Standings can and will change.
      </p>
    </div>
  );
}
