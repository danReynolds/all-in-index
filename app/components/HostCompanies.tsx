"use client";

import Link from "next/link";
import { useState } from "react";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { StanceBadge } from "@/app/components/badges";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import type { Stance } from "@/lib/types";

export interface HostCompanyRow {
  slug: string;
  company: string;
  ticker: string | null;
  domain: string | null;
  /** The host's SCORED stance on this name. */
  stance: Stance;
  /** True when this name is an actual position in the chart above. Only these
   * earn a bull/bear badge; everything else reads as commentary. */
  charted: boolean;
  count: number;
  lastDate: string;
  sinceReturn: number | null;
}

/** A row counts as a firm call only if it's a charted position with a direction. */
function isCall(r: HostCompanyRow): boolean {
  return r.charted && (r.stance === "bull" || r.stance === "bear" || r.stance === "mixed");
}

type Filter = "all" | "bull" | "bear" | "neutral";
const FILTERS: Array<[Filter, string]> = [
  ["all", "All"],
  ["bull", "Bullish"],
  ["bear", "Bearish"],
  ["neutral", "Commentary"],
];

/**
 * Every company a host has discussed. A bull/bear badge appears ONLY for names
 * that are actual positions in the chart above (isCall) — so the table can
 * never claim more conviction than the portfolio shows. Everything else is
 * commentary. Filterable by where they landed.
 */
export function HostCompanies({ host, rows }: { host: string; rows: HostCompanyRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "neutral"
        ? !isCall(r)
        : isCall(r) && r.stance === filter,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Every company {host} has discussed
        </h2>
        <span className="text-xs text-neutral-500">
          {shown.length === rows.length ? `${rows.length} companies` : `${shown.length} of ${rows.length}`}
        </span>
      </div>
      <p className="text-xs text-neutral-500">
        Bullish or bearish marks a name {host} actually positioned on — the holdings in the portfolio
        above. Everything else is commentary.
      </p>

      <div className="inline-flex rounded-full bg-neutral-900/70 p-0.5 text-xs ring-1 ring-inset ring-white/10">
        {FILTERS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilter(v)}
            className={`rounded-full px-3 py-1 transition-all active:scale-95 ${
              v === filter
                ? "bg-neutral-100 font-medium text-neutral-900"
                : "text-neutral-400 hover:text-neutral-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">View</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Last said</th>
              <th className="px-4 py-3 text-right font-medium">Takes</th>
              <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Since</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
            {shown.map((c) => (
              <tr key={c.slug} className="group transition-colors hover:bg-white/[0.025]">
                <td className="px-4 py-3">
                  <Link
                    href={`/holding/${c.slug}#takes-${host.toLowerCase()}`}
                    className="flex items-center gap-2.5 font-medium"
                  >
                    <CompanyLogo name={c.company} domain={c.domain} size="sm" />
                    <span className="group-hover:underline">{c.company}</span>
                    {c.ticker && (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800">
                        {c.ticker}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {isCall(c) ? (
                    <StanceBadge stance={c.stance} />
                  ) : (
                    <span className="text-xs text-neutral-500">Commentary</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-neutral-500 sm:table-cell">{fmtDate(c.lastDate)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-neutral-400">{c.count}</td>
                <td className={`hidden px-4 py-3 text-right font-mono tabular-nums md:table-cell ${returnColor(c.sinceReturn)}`}>
                  {c.sinceReturn != null ? pct(c.sinceReturn) : "—"}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                  No {filter === "neutral" ? "commentary" : `${filter} calls`} from {host}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
