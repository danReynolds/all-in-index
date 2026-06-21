"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { StanceBadge } from "@/app/components/badges";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { ListenButton } from "@/app/components/player";
import type { EpisodeMeta, Stance, Thesis } from "@/lib/types";

/** The host's most recent quoted take on a name — previewed inline on expand. */
export interface HostTakePreview {
  quote: string;
  stance: Stance;
  callType: Thesis["callType"];
  /** True only when this take is a scored position — else the badge reads "Commentary". */
  scored: boolean;
  episodeId: string;
  episodeNumber: number | null;
  episodeDate: string;
  quoteStartMs: number | null;
}

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
  take: HostTakePreview;
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
 * commentary. Filterable by where they landed; click a row to read the take
 * inline without leaving the page.
 */
export function HostCompanies({
  host,
  rows,
  episodes,
  episodeLinks,
}: {
  host: string;
  rows: HostCompanyRow[];
  episodes: Record<string, EpisodeMeta>;
  episodeLinks: Record<string, string | null>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (slug: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

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
        above. Everything else is commentary. Tap a row to read the take.
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
            {shown.map((c) => {
              const isOpen = open.has(c.slug);
              return (
                <Fragment key={c.slug}>
                  <tr
                    onClick={() => toggle(c.slug)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(c.slug);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={isOpen}
                    className="group cursor-pointer outline-none transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04]"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5 font-medium">
                        <Chevron open={isOpen} />
                        <CompanyLogo name={c.company} domain={c.domain} size="sm" />
                        <span className="group-hover:underline">{c.company}</span>
                        {c.ticker && (
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800">
                            {c.ticker}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StanceBadge stance={c.stance} scored={isCall(c)} />
                    </td>
                    <td className="hidden px-4 py-3 text-neutral-500 sm:table-cell">{fmtDate(c.lastDate)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-neutral-400">{c.count}</td>
                    <td className={`hidden px-4 py-3 text-right font-mono tabular-nums md:table-cell ${isCall(c) ? returnColor(c.sinceReturn) : ""}`}>
                      {isCall(c) && c.sinceReturn != null ? pct(c.sinceReturn) : "—"}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-neutral-50/60 dark:bg-neutral-900/40">
                      <td colSpan={5} className="px-4 pb-4 pt-0">
                        <TakePanel
                          row={c}
                          host={host}
                          meta={episodes[c.take.episodeId]}
                          fallbackLink={episodeLinks[c.take.episodeId]}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`shrink-0 text-neutral-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
    >
      <path d="M4 2.5L7.5 6L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The inline take preview revealed under an expanded row. */
function TakePanel({
  row,
  host,
  meta,
  fallbackLink,
}: {
  row: HostCompanyRow;
  host: string;
  meta?: EpisodeMeta | null;
  fallbackLink?: string | null;
}) {
  const { take, count } = row;
  return (
    <div className="max-w-[82vw] rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/60 sm:max-w-2xl">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
        <StanceBadge stance={take.stance} callType={take.callType} scored={take.scored} />
        <Link
          href={`/episode/${take.episodeId}`}
          className="font-mono text-[11px] hover:text-neutral-200 hover:underline"
          title="All takes from this episode"
        >
          {take.episodeNumber ? `E${take.episodeNumber}` : take.episodeId}
        </Link>
        <span>· {fmtDate(take.episodeDate)}</span>
        {(meta?.audioUrl || fallbackLink) && (
          <span>
            <ListenButton
              meta={meta}
              episodeId={take.episodeId}
              startMs={take.quoteStartMs}
              caption={`${host} on ${row.company}`}
              fallbackLink={fallbackLink}
            />
          </span>
        )}
      </div>
      <blockquote className="text-sm italic leading-relaxed text-neutral-600 break-words dark:text-neutral-300">
        “{take.quote}”
      </blockquote>
      <Link
        href={`/holding/${row.slug}#takes-${host.toLowerCase()}`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-200"
      >
        {count > 1 ? `View all ${count} takes` : "View on the company page"}
        <span className="arrow-nudge">→</span>
      </Link>
    </div>
  );
}
