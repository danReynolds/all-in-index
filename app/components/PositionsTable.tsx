"use client";

import { Fragment, useState } from "react";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { CallReceipt } from "@/app/components/CallReceipt";
import type { TradeEventTake } from "@/lib/projections";
import type { EpisodeMeta } from "@/lib/types";
import type { PositionStat } from "@/app/components/IndexChart";

export interface PositionRow {
  slug: string;
  company: string;
  ticker: string;
  domain: string | null;
  entryDate: string;
  sinceReturn: number;
  alpha: number;
  /** The entry call behind this position — its summary, quote, episode. */
  take: TradeEventTake | null;
  stats: PositionStat | null;
  /** Where the expanded receipt links for the full call timeline. */
  href: string;
}

/**
 * The host's scored positions as a table where each row expands in place to the
 * same "receipt" a chart marker shows — the call, its performance, and a link
 * to the holding's full timeline. Clicking a row reveals; it never navigates.
 */
export function PositionsTable({
  rows,
  episodes,
  episodeLinks,
  portfolioReturn,
}: {
  rows: PositionRow[];
  episodes: Record<string, EpisodeMeta>;
  episodeLinks: Record<string, string | null>;
  portfolioReturn: number;
}) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
          <tr>
            <th className="py-2 pr-4 font-medium">Call</th>
            <th className="hidden py-2 pr-4 font-medium sm:table-cell">Entry</th>
            <th className="py-2 pr-4 text-right font-medium">Return</th>
            <th className="py-2 text-right font-medium">Alpha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
          {rows.map((r) => {
            const open = openSlug === r.slug;
            const toggle = () => setOpenSlug(open ? null : r.slug);
            return (
              <Fragment key={r.slug}>
                <tr
                  onClick={toggle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle();
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={open}
                  className={`group cursor-pointer outline-none transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04] ${
                    open ? "bg-white/[0.03]" : ""
                  }`}
                >
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-2 font-medium">
                      <svg
                        viewBox="0 0 10 6"
                        className={`h-1.5 w-2.5 shrink-0 fill-none stroke-current text-neutral-500 transition-transform group-hover:text-neutral-300 ${
                          open ? "rotate-180" : ""
                        }`}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M1 1l4 4 4-4" />
                      </svg>
                      <CompanyLogo name={r.company} domain={r.domain} size="sm" />
                      {r.company}
                      <span className="font-mono text-xs text-neutral-400">{r.ticker}</span>
                    </span>
                  </td>
                  <td className="hidden py-2.5 pr-4 text-neutral-500 sm:table-cell">{fmtDate(r.entryDate)}</td>
                  <td className={`py-2.5 pr-4 text-right font-mono tabular-nums ${returnColor(r.sinceReturn)}`}>
                    {pct(r.sinceReturn)}
                  </td>
                  <td className={`py-2.5 text-right font-mono font-semibold tabular-nums ${returnColor(r.alpha)}`}>
                    {r.alpha >= 0 ? "+" : ""}
                    {(r.alpha * 100).toFixed(1)}pp
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={4} className="pb-4">
                      <div className="pop-in rounded-xl bg-neutral-800/40 p-4 text-sm ring-1 ring-white/5">
                        <CallReceipt
                          company={r.company}
                          ticker={r.ticker}
                          slug={r.slug}
                          domain={r.domain}
                          take={r.take}
                          date={r.entryDate}
                          stats={r.stats}
                          portfolioReturn={portfolioReturn}
                          episodes={episodes}
                          episodeLinks={episodeLinks}
                          holdingHref={r.href}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
