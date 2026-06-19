"use client";

import Link from "next/link";
import { pct, returnColor, fmtDate, fmtMoney } from "@/lib/format";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { HostStack } from "@/app/components/host";
import { SortableTable, type Column } from "@/app/components/SortableTable";
import type { BearCall, GuestLeaderboardEntry, Host, IndexConstituent } from "@/lib/types";

type WithDomain<T> = T & { domain: string | null };

function NameCell({ company, ticker, domain }: { company: string; ticker: string; domain: string | null }) {
  return (
    <span className="flex items-center gap-2.5 font-medium">
      <CompanyLogo name={company} domain={domain} size="sm" />
      <span className="group-hover:underline">{company}</span>
      <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800">
        {ticker}
      </span>
    </span>
  );
}

/** /the-index constituents — long basket, sortable by every numeric column. */
export function ConstituentsTable({ rows }: { rows: Array<WithDomain<IndexConstituent>> }) {
  const columns: Array<Column<WithDomain<IndexConstituent>>> = [
    { key: "rank", header: "#", render: (_r, i) => <span className="text-neutral-400 tabular-nums">{i + 1}</span> },
    {
      key: "company",
      header: "Company",
      sortValue: (r) => r.company.toLowerCase(),
      defaultDir: "asc",
      render: (r) => <NameCell company={r.company} ticker={r.ticker} domain={r.domain} />,
    },
    { key: "entry", header: "Entry", hide: "sm", sortValue: (r) => r.entryDate, cellClass: "text-neutral-500", render: (r) => fmtDate(r.entryDate) },
    {
      key: "move",
      header: "Entry → now",
      align: "right",
      hide: "md",
      cellClass: "font-mono tabular-nums text-neutral-500",
      render: (r) => `${fmtMoney(r.entryPrice, r)} → ${fmtMoney(r.latestPrice, r)}`,
    },
    {
      key: "return",
      header: "Return",
      align: "right",
      sortValue: (r) => r.sinceReturn,
      cellClass: (r) => `font-mono tabular-nums ${returnColor(r.sinceReturn)}`,
      render: (r) => pct(r.sinceReturn),
    },
    {
      key: "sp",
      header: "S&P",
      align: "right",
      hide: "sm",
      sortValue: (r) => r.benchmarkReturn,
      cellClass: "font-mono tabular-nums text-neutral-500",
      render: (r) => pct(r.benchmarkReturn),
    },
    {
      key: "alpha",
      header: "Alpha",
      align: "right",
      sortValue: (r) => r.alpha,
      cellClass: (r) => `font-mono font-semibold tabular-nums ${returnColor(r.alpha)}`,
      render: (r) => `${r.alpha >= 0 ? "+" : ""}${(r.alpha * 100).toFixed(1)}pp`,
    },
  ];
  return (
    <SortableTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.slug}
      getHref={(r) => `/holding/${r.slug}`}
      initialSort={{ key: "alpha", dir: "desc" }}
    />
  );
}

/** The Bear Book — short scoreboard, sortable. */
export function BearBookTable({ rows, asOfMs }: { rows: Array<WithDomain<BearCall>>; asOfMs: number }) {
  const columns: Array<Column<WithDomain<BearCall>>> = [
    {
      key: "company",
      header: "Company",
      sortValue: (r) => r.company.toLowerCase(),
      defaultDir: "asc",
      render: (r) => <NameCell company={r.company} ticker={r.ticker} domain={r.domain} />,
    },
    {
      key: "since",
      header: "Bear since",
      hide: "sm",
      sortValue: (r) => r.entryDate,
      cellClass: "text-neutral-500",
      render: (r) => {
        const ageDays = Math.round((asOfMs - Date.parse(r.entryDate)) / 86400000);
        return (
          <>
            {fmtDate(r.entryDate)}
            {ageDays > 90 && (
              <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400" title="No fresh take since — view may be stale">
                · {ageDays}d
              </span>
            )}
          </>
        );
      },
    },
    { key: "who", header: "Who", hide: "md", render: (r) => <HostStack hosts={r.hosts as Host[]} size="sm" /> },
    {
      key: "stock",
      header: "Stock since",
      align: "right",
      sortValue: (r) => r.sinceReturn,
      cellClass: (r) => `font-mono tabular-nums ${returnColor(r.sinceReturn)}`,
      render: (r) => pct(r.sinceReturn),
    },
    {
      key: "short",
      header: "If shorted",
      align: "right",
      sortValue: (r) => Math.max(-r.sinceReturn, -1),
      cellClass: (r) => `font-mono tabular-nums ${returnColor(Math.max(-r.sinceReturn, -1))}`,
      render: (r) => {
        const short = Math.max(-r.sinceReturn, -1);
        const wiped = -r.sinceReturn < -1;
        return (
          <span title={wiped ? "Capped at −100% — a real short can only lose what you put in." : undefined}>
            {pct(short)}
            {wiped && <span className="text-neutral-500">*</span>}
          </span>
        );
      },
    },
    {
      key: "verdict",
      header: "Verdict",
      align: "right",
      sortValue: (r) => r.sinceReturn,
      cellClass: "text-xs font-semibold",
      render: (r) =>
        r.sinceReturn > 0.02 ? (
          <span className="text-rose-500 dark:text-rose-400">✗ wrong</span>
        ) : r.sinceReturn < -0.02 ? (
          <span className="text-emerald-600 dark:text-emerald-400">✓ right</span>
        ) : (
          <span className="text-neutral-400">· early</span>
        ),
    },
  ];
  return (
    <SortableTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.slug}
      getHref={(r) => `/holding/${r.slug}`}
      initialSort={{ key: "stock", dir: "desc" }}
    />
  );
}

/** Guest leaderboard — ranked by follow-return, sortable. */
export function GuestLeaderboardTable({ rows }: { rows: GuestLeaderboardEntry[] }) {
  // The ranking is scored guests only; commentary-only guests (no calls) keep
  // their page but aren't ranked — there's no follow-return to rank them by.
  const ranked = rows.filter((r) => r.followReturn != null);
  const columns: Array<Column<GuestLeaderboardEntry>> = [
    {
      key: "guest",
      header: "Guest",
      sortValue: (r) => r.guest.toLowerCase(),
      defaultDir: "asc",
      render: (r, i) => (
        <>
          <span className="mr-2 inline-block w-4 text-right font-mono text-xs text-neutral-400">{i + 1}</span>
          <Link href={`/guest/${r.slug}`} className="relative z-10 font-medium group-hover:underline">
            {r.guest}
          </Link>
        </>
      ),
    },
    { key: "calls", header: "Calls", align: "right", sortValue: (r) => r.calls, cellClass: "tabular-nums text-neutral-500", render: (r) => r.calls },
    {
      key: "follow",
      header: "Follow return",
      align: "right",
      sortValue: (r) => r.followReturn ?? 0,
      cellClass: (r) => `font-mono tabular-nums ${returnColor(r.followReturn)}`,
      render: (r) => pct(r.followReturn),
    },
    {
      key: "alpha",
      header: "vs S&P",
      align: "right",
      hide: "sm",
      sortValue: (r) => r.alpha ?? 0,
      cellClass: "font-mono tabular-nums",
      render: (r) => <span className={returnColor(r.alpha)}>{(r.alpha ?? 0) >= 0 ? "+" : ""}{((r.alpha ?? 0) * 100).toFixed(1)}pp</span>,
    },
    {
      key: "best",
      header: "Best call",
      align: "right",
      hide: "md",
      render: (r) =>
        r.best ? (
          <Link href={`/holding/${r.best.slug}`} className="relative z-10 font-mono text-xs hover:underline">
            <span className="text-neutral-500 dark:text-neutral-300">{r.best.ticker}</span>{" "}
            <span className={returnColor(r.best.ret)}>{r.best.ret >= 0 ? "+" : ""}{(r.best.ret * 100).toFixed(0)}%</span>
          </Link>
        ) : (
          <span className="text-neutral-400">—</span>
        ),
    },
  ];
  return (
    <SortableTable
      rows={ranked}
      columns={columns}
      rowKey={(r) => r.slug}
      getHref={(r) => `/guest/${r.slug}`}
      initialSort={{ key: "follow", dir: "desc" }}
      rowClass="group transition-colors hover:bg-violet-50/40 dark:hover:bg-violet-950/20"
    />
  );
}
