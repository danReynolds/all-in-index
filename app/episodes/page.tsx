import Link from "next/link";
import { getEpisodes, type EpisodeSummary } from "@/lib/data";
import { fmtDate, STANCE_META } from "@/lib/format";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { LinkRow } from "@/app/components/LinkRow";
import type { Stance } from "@/lib/types";

export const metadata = {
  title: "Episodes — The All-Index",
  description: "Every processed episode and the calls made in it.",
  alternates: { canonical: "/episodes" },
};

const STANCE_ORDER: Stance[] = ["bull", "bear", "mixed", "neutral"];

/** Small cluster of the companies discussed, most-talked-about first. */
function Discussed({ companies }: { companies: EpisodeSummary["companies"] }) {
  if (companies.length === 0) return <span className="text-neutral-500">—</span>;
  const shown = companies.slice(0, 5);
  const extra = companies.length - shown.length;
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex items-center gap-1">
        {shown.map((c) => (
          <CompanyLogo key={c.slug} name={c.company} domain={c.domain} size="sm" />
        ))}
      </span>
      {extra > 0 && <span className="font-mono text-[11px] text-neutral-500">+{extra}</span>}
    </span>
  );
}

/** Thin bull/bear/neutral mix bar — the episode's stance split at a glance. */
function StanceBar({ stance, total }: { stance: EpisodeSummary["stance"]; total: number }) {
  if (total === 0) return <span className="text-neutral-500">—</span>;
  return (
    <span className="flex h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
      {STANCE_ORDER.filter((s) => stance[s] > 0).map((s) => (
        <span
          key={s}
          className={STANCE_META[s].dot}
          style={{ width: `${(stance[s] / total) * 100}%` }}
          title={`${stance[s]} ${STANCE_META[s].label.toLowerCase()}`}
        />
      ))}
    </span>
  );
}

export default function EpisodesPage() {
  const episodes = getEpisodes();
  const withTakes = episodes.filter((e) => e.takeCount > 0).length;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
          Episodes
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Episodes, week by week
        </h1>
        <p className="max-w-2xl text-neutral-500 dark:text-neutral-400">
          {episodes.length} processed episodes · {withTakes} with calls. Click any episode
          for its scorecard.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="px-4 py-3 font-medium">Episode</th>
              <th className="hidden w-[176px] px-4 py-3 font-medium sm:table-cell">Discussed</th>
              <th className="hidden w-[116px] px-4 py-3 font-medium lg:table-cell">Stance</th>
              <th className="hidden w-[132px] px-4 py-3 font-medium sm:table-cell">Aired</th>
              <th className="w-[76px] px-4 py-3 text-right font-medium">Takes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
            {episodes.map((e) => (
              <LinkRow key={e.id} href={`/episode/${e.id}`} className="group transition-colors hover:bg-white/[0.025]">
                <td className="px-4 py-3">
                  <Link href={`/episode/${e.id}`} className="flex min-w-0 items-center gap-2.5">
                    <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800">
                      {e.number ? `E${e.number}` : "SP"}
                    </span>
                    <span className="truncate font-medium group-hover:underline">{e.title}</span>
                  </Link>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <Discussed companies={e.companies} />
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <StanceBar stance={e.stance} total={e.takeCount} />
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-neutral-500 sm:table-cell">
                  {fmtDate(e.date)}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.takeCount > 0 ? (
                    <span className="font-mono tabular-nums">{e.takeCount}</span>
                  ) : (
                    <span className="text-neutral-500">—</span>
                  )}
                </td>
              </LinkRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
