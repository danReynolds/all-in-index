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
  /** The host's SCORED stance on this name (neutral = commentary, no firm call). */
  stance: Stance;
  count: number;
  lastDate: string;
  sinceReturn: number | null;
}

type Filter = "all" | "bull" | "bear" | "neutral";
const FILTERS: Array<[Filter, string]> = [
  ["all", "All"],
  ["bull", "Bullish"],
  ["bear", "Bearish"],
  ["neutral", "Commentary"],
];

/**
 * Every company a host has discussed, with their standing view. The badge is
 * their SCORED stance only — a firm bullish/bearish call — so it never
 * contradicts the portfolio above. Names they only mentioned in passing read
 * as "Commentary" (neutral). Filterable by where they landed.
 */
export function HostCompanies({ host, rows }: { host: string; rows: HostCompanyRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "neutral"
        ? r.stance === "neutral" || r.stance === "mixed"
        : r.stance === filter,
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
        Bullish or bearish marks a firm call; commentary means they weighed in without picking a side.
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
                  <Link href={`/holding/${c.slug}`} className="flex items-center gap-2.5 font-medium">
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
                  {c.stance === "neutral" ? (
                    <span className="text-xs text-neutral-500">Commentary</span>
                  ) : (
                    <StanceBadge stance={c.stance} />
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
