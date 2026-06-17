"use client";

import { useMemo, useState, type ReactNode } from "react";
import { LinkRow } from "./LinkRow";

type Dir = "asc" | "desc";

export type Column<T> = {
  /** Stable id for the column (used as the sort key). */
  key: string;
  header: string;
  align?: "left" | "right";
  /** Provide to make the column sortable; omit for a static column. */
  sortValue?: (row: T) => number | string;
  /** Direction applied on the first click of this header (default "desc"). */
  defaultDir?: Dir;
  render: (row: T, index: number) => ReactNode;
  /** Extra <td> classes, static or per-row (e.g. return coloring). */
  cellClass?: string | ((row: T) => string);
  /** Responsive hide breakpoint, mirroring the rest of the site's tables. */
  hide?: "sm" | "md" | "lg";
};

const HIDE: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

/**
 * A client-side sortable table. Click a header to sort by that column (toggles
 * asc/desc); columns without a `sortValue` stay static. Rows navigate to
 * `getHref(row)` when provided, reusing LinkRow so the whole row is clickable.
 */
export function SortableTable<T>({
  rows,
  columns,
  getHref,
  initialSort,
  rowKey,
  rowClass = "group transition-colors hover:bg-white/[0.025]",
  headClass = "border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:border-neutral-800",
  emptyMessage = "Nothing to show.",
}: {
  rows: T[];
  columns: Array<Column<T>>;
  getHref?: (row: T) => string;
  initialSort?: { key: string; dir: Dir };
  rowKey: (row: T) => string;
  rowClass?: string;
  headClass?: string;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: Dir } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sgn = sort.dir === "asc" ? 1 : -1;
    return rows
      .map((row, i) => ({ row, i }))
      .sort((a, b) => {
        const av = col.sortValue!(a.row);
        const bv = col.sortValue!(b.row);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return cmp !== 0 ? cmp * sgn : a.i - b.i; // stable
      })
      .map((x) => x.row);
  }, [rows, columns, sort]);

  function toggle(col: Column<T>) {
    if (!col.sortValue) return;
    setSort((prev) =>
      prev && prev.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: col.defaultDir ?? "desc" },
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full text-sm">
        <thead className={headClass}>
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={`px-4 py-3 font-medium ${col.align === "right" ? "text-right" : ""} ${col.hide ? HIDE[col.hide] : ""}`}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(col)}
                      className={`inline-flex items-center gap-1 uppercase tracking-[0.16em] transition-colors hover:text-neutral-700 dark:hover:text-neutral-200 ${
                        active ? "text-neutral-700 dark:text-neutral-200" : ""
                      } ${col.align === "right" ? "flex-row-reverse" : ""}`}
                    >
                      {col.header}
                      <span className="text-[9px] opacity-60">{active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
          {sorted.map((row, i) => {
            const cells = columns.map((col) => {
              const extra = typeof col.cellClass === "function" ? col.cellClass(row) : col.cellClass ?? "";
              return (
                <td
                  key={col.key}
                  className={`px-4 py-3 ${col.align === "right" ? "text-right" : ""} ${col.hide ? HIDE[col.hide] : ""} ${extra}`}
                >
                  {col.render(row, i)}
                </td>
              );
            });
            const href = getHref?.(row);
            return href ? (
              <LinkRow key={rowKey(row)} href={href} className={rowClass}>
                {cells}
              </LinkRow>
            ) : (
              <tr key={rowKey(row)} className={rowClass}>
                {cells}
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-neutral-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
