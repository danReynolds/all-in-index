"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { pct, returnColor, fmtDate, callVerdict } from "@/lib/format";
import { currentCall, displayStance } from "@/lib/calls";
import { StanceBadge } from "@/app/components/badges";
import { Sparkline } from "@/app/components/Sparkline";
import { HostAvatar } from "@/app/components/host";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { REGULAR_HOSTS } from "@/lib/types";
import { HOST_UI } from "@/lib/hosts";
import type { Holding, Host, Stance } from "@/lib/types";

type SortKey = "latest" | "takes" | "best" | "worst";

const SORTS: Array<[SortKey, string]> = [
  ["latest", "Latest take"],
  ["takes", "Most takes"],
  ["best", "Best"],
  ["worst", "Worst"],
];

const STANCES: Array<[Stance | "all", string]> = [
  ["all", "All"],
  ["bull", "Bullish"],
  ["bear", "Bearish"],
  ["mixed", "Mixed"],
  ["neutral", "Neutral"],
];

function Pills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div className="inline-flex rounded-full bg-neutral-900/70 p-0.5 text-xs ring-1 ring-inset ring-white/10">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-full px-2.5 py-1 transition-all active:scale-95 ${
            v === value
              ? "bg-neutral-100 font-medium text-neutral-900"
              : "text-neutral-400 hover:text-neutral-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** The homepage public-companies table, with client-side sort and filters. */
export function HoldingsTable({
  holdings,
  title = "Tracked calls · public companies",
  subtitle = "scored vs the market",
}: {
  holdings: Holding[];
  title?: string;
  subtitle?: string;
}) {
  const [sort, setSort] = useState<SortKey>("latest");
  const [stance, setStance] = useState<Stance | "all">("all");
  const [host, setHost] = useState<Host | null>(null);
  const shown = useMemo(() => {
    let list = holdings;
    if (stance !== "all") list = list.filter((h) => displayStance(h.theses) === stance);
    if (host) list = list.filter((h) => h.theses.some((t) => t.host === host));
    const since = (h: Holding) => h.market?.returns.since;
    return list.slice().sort((a, b) => {
      switch (sort) {
        case "latest":
          return b.lastMentioned.localeCompare(a.lastMentioned);
        case "takes":
          return b.mentionCount - a.mentionCount;
        case "best":
          return (since(b) ?? -Infinity) - (since(a) ?? -Infinity);
        case "worst":
          return (since(a) ?? Infinity) - (since(b) ?? Infinity);
      }
    });
  }, [holdings, sort, stance, host]);

  const dateLabel = sort === "latest" ? "Last take" : "First call";

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
        <span className="text-xs text-neutral-500">
          {shown.length === holdings.length
            ? `${holdings.length} tracked, ${subtitle}`
            : `${shown.length} of ${holdings.length}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          {REGULAR_HOSTS.map((h) => {
            const on = host === h;
            return (
              <button
                key={h}
                type="button"
                onClick={() => setHost(on ? null : h)}
                title={on ? "Show everyone" : `Only companies ${h} has takes on`}
                aria-pressed={on}
                className={`rounded-full transition-all duration-150 hover:scale-110 active:scale-90 ${
                  host && !on ? "opacity-30 grayscale hover:opacity-60" : ""
                }`}
                style={on ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 3.5px ${HOST_UI[h].hex}` } : undefined}
              >
                <HostAvatar host={h} size="sm" />
              </button>
            );
          })}
        </div>
        <Pills value={stance} onChange={setStance} options={STANCES} />
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] uppercase tracking-wider text-neutral-600 sm:inline">sort</span>
          <Pills value={sort} onChange={setSort} options={SORTS} />
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Stance</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Who</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">{dateLabel}</th>
              <th className="px-4 py-3 text-right font-medium">Since</th>
              <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
            {shown.map((h) => (
              <tr key={h.slug} className="group transition-colors hover:bg-white/[0.025]">
                <td className="px-4 py-3">
                  <Link href={`/holding/${h.slug}`} className="flex items-center gap-2.5 font-medium">
                    <CompanyLogo name={h.company} domain={h.domain} size="sm" />
                    <span className="group-hover:underline">{h.company}</span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800">{h.ticker}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const ds = displayStance(h.theses);
                    return ds === "none" ? (
                      <span
                        className="text-neutral-500"
                        title="No take on this name clears the scoring bar (medium+ conviction, verified speaker) — views shown on the holding page, nothing scored."
                      >
                        —
                      </span>
                    ) : (
                      <StanceBadge stance={ds} />
                    );
                  })()}
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <span className="flex -space-x-1.5">
                    {[...new Set(h.theses.map((t) => t.host))].map((th) =>
                      th !== "Guest" && th !== "Unknown" ? (
                        <Link
                          key={th}
                          href={`/host/${th.toLowerCase()}`}
                          title={`${th}'s track record`}
                          className="rounded-full ring-2 ring-neutral-900 transition-transform hover:z-10 hover:scale-110"
                        >
                          <HostAvatar host={th} size="sm" />
                        </Link>
                      ) : (
                        <span key={th} className="rounded-full ring-2 ring-neutral-900">
                          <HostAvatar host={th} size="sm" />
                        </span>
                      ),
                    )}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-neutral-500 md:table-cell">
                  {fmtDate(sort === "latest" ? h.lastMentioned : h.firstMentioned)}
                </td>
                <td className={`px-4 py-3 text-right font-mono tabular-nums ${returnColor(h.market?.returns.since)}`}>
                  {h.market ? (
                    <>
                      {pct(h.market.returns.since)}
                      {(() => {
                        const cc = currentCall(h);
                        const v = cc ? callVerdict(cc.stance, cc.ret) : null;
                        if (!v || v.right == null) return null;
                        return (
                          <span
                            title={`${v.label} (judged since the current stance was adopted, ${fmtDate(cc!.sinceDate)})`}
                            className={`ml-1.5 font-sans text-[11px] ${v.right ? "text-emerald-400" : "text-rose-400"}`}
                          >
                            {v.right ? "✓" : "✗"}
                          </span>
                        );
                      })()}
                    </>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-right lg:table-cell">
                  {h.market && h.market.history.length > 1 ? (
                    <Sparkline points={h.market.history.map(([, c]) => c)} animate={false} className="ml-auto inline-block align-middle" />
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-500">
                  No companies match — try a different stance or host.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
