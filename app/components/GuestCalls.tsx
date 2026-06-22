"use client";

import Link from "next/link";
import { Fragment, useState, type CSSProperties } from "react";
import { pct, returnColor, fmtDate } from "@/lib/format";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { StanceBadge } from "@/app/components/badges";
import { ListenButton } from "@/app/components/player";
import type { EpisodeMeta, Stance } from "@/lib/types";

export interface GuestCallRow {
  slug: string;
  company: string;
  ticker: string | null;
  domain: string | null;
  stance: Stance;
  ret: number;
  alpha: number;
  date: string;
  /** The call take's id, so "see the full discussion" deep-links to that take. */
  takeId: string | null;
  quote: string | null;
  episodeId: string | null;
  episodeNumber: number | null;
  quoteStartMs: number | null;
}

/**
 * A guest's tracked calls as a scannable table where each row expands to the
 * words behind the number — and links into the full company discussion. Mirrors
 * the besties' HostCompanies interaction so a guest reads just as richly.
 */
export function GuestCalls({
  guest,
  rows,
  episodes,
  episodeLinks,
}: {
  guest: string;
  rows: GuestCallRow[];
  episodes: Record<string, EpisodeMeta>;
  episodeLinks: Record<string, string | null>;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (slug: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  return (
    <section
      className="rise rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6"
      style={{ "--d": "120ms" } as CSSProperties}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Their calls</h2>
      <p className="mb-4 mt-1 text-xs text-neutral-500">
        Each measured as if you&apos;d followed it from the day it aired. Tap a row to read the call in their words.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-4 font-medium">Company</th>
              <th className="hidden py-2 pr-4 font-medium sm:table-cell">Call</th>
              <th className="hidden py-2 pr-4 font-medium md:table-cell">Date</th>
              <th className="py-2 pr-4 text-right font-medium">Return</th>
              <th className="py-2 text-right font-medium">vs S&amp;P</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
            {rows.map((r) => {
              const isOpen = open.has(r.slug);
              return (
                <Fragment key={r.slug}>
                  <tr
                    onClick={() => toggle(r.slug)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(r.slug);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={isOpen}
                    className="group cursor-pointer outline-none transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04]"
                  >
                    <td className="py-2.5 pr-4">
                      <span className="flex items-center gap-2 font-medium">
                        <Chevron open={isOpen} />
                        <CompanyLogo name={r.company} domain={r.domain} size="sm" />
                        <span className="group-hover:underline">{r.company}</span>
                        {r.ticker && <span className="font-mono text-xs text-neutral-400">{r.ticker}</span>}
                      </span>
                    </td>
                    <td className="hidden py-2.5 pr-4 sm:table-cell">
                      <StanceBadge stance={r.stance} />
                    </td>
                    <td className="hidden py-2.5 pr-4 text-neutral-500 md:table-cell">{fmtDate(r.date)}</td>
                    <td className={`py-2.5 pr-4 text-right font-mono tabular-nums ${returnColor(r.ret)}`}>{pct(r.ret)}</td>
                    <td className={`py-2.5 text-right font-mono font-semibold tabular-nums ${returnColor(r.alpha)}`}>
                      {r.alpha >= 0 ? "+" : ""}
                      {(r.alpha * 100).toFixed(1)}pp
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-neutral-50/60 dark:bg-neutral-900/40">
                      <td colSpan={5} className="px-2 pb-4 pt-0 sm:px-4">
                        <CallPanel
                          guest={guest}
                          row={r}
                          meta={episodes[r.episodeId ?? ""]}
                          fallbackLink={episodeLinks[r.episodeId ?? ""]}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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

/** The take behind a call, revealed when its row is expanded. */
function CallPanel({
  guest,
  row,
  meta,
  fallbackLink,
}: {
  guest: string;
  row: GuestCallRow;
  meta?: EpisodeMeta | null;
  fallbackLink?: string | null;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
        <StanceBadge stance={row.stance} />
        {row.episodeId && (
          <Link
            href={`/episode/${row.episodeId}`}
            className="font-mono text-[11px] hover:text-neutral-200 hover:underline"
            title="All takes from this episode"
          >
            {row.episodeNumber ? `E${row.episodeNumber}` : row.episodeId}
          </Link>
        )}
        <span>· {fmtDate(row.date)}</span>
        {row.episodeId && (meta?.audioUrl || fallbackLink) && (
          <span>
            <ListenButton
              meta={meta}
              episodeId={row.episodeId}
              startMs={row.quoteStartMs}
              caption={`${guest} on ${row.company}`}
              fallbackLink={fallbackLink}
            />
          </span>
        )}
      </div>
      {row.quote ? (
        <blockquote className="text-sm italic leading-relaxed text-neutral-600 break-words dark:text-neutral-300">
          “{row.quote}”
        </blockquote>
      ) : (
        <p className="text-sm text-neutral-500">No direct quote captured for this call.</p>
      )}
      <Link
        href={`/holding/${row.slug}${row.takeId ? `?call=${row.takeId}` : ""}#takes-guest`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-200"
      >
        See the full discussion <span className="arrow-nudge">→</span>
      </Link>
    </div>
  );
}
