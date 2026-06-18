"use client";

import Link from "next/link";
import { useState } from "react";
import { HostAvatar } from "@/app/components/host";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { STANCE_META, returnColor, pct } from "@/lib/format";
import { HOST_UI } from "@/lib/hosts";
import type { HostFlipDetail, StancePathPoint } from "@/lib/insights";

/** "Dec '24" from an ISO date. */
function monthYear(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) + " '" + String(d.getUTCFullYear()).slice(2);
}

function StancePath({ path }: { path: StancePathPoint[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {path.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-neutral-500">→</span>}
          <span className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${STANCE_META[p.stance].dot}`} />
            <span className="text-xs font-medium text-neutral-300">{STANCE_META[p.stance].label}</span>
            <span className="font-mono text-[10px] text-neutral-500">{monthYear(p.date)}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

export function FlipTracker({ byHost }: { byHost: HostFlipDetail[] }) {
  const [open, setOpen] = useState<string | null>(byHost.find((h) => h.flips > 0)?.host ?? null);
  const maxFlips = Math.max(1, ...byHost.map((f) => f.flips));

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="mb-1 text-sm font-semibold text-neutral-700 dark:text-neutral-200">By host</h3>
      <p className="mb-3 text-xs text-neutral-400">Tap a bestie to see every name they reversed on.</p>
      <div className="space-y-1.5">
        {byHost.map((f) => {
          const isOpen = open === f.host;
          const disabled = f.flips === 0;
          return (
            <div key={f.host} className="rounded-xl">
              <button
                type="button"
                disabled={disabled}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : f.host)}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                  disabled ? "cursor-default opacity-60" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                } ${isOpen ? "bg-neutral-50 dark:bg-neutral-800/60" : ""}`}
              >
                <HostAvatar host={f.host} size="md" />
                <span className="w-20 text-sm font-medium">{f.host}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(f.flips / maxFlips) * 100}%`, background: HOST_UI[f.host].hex }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-sm tabular-nums">{f.flips}</span>
                {!disabled && (
                  <span
                    className={`w-3 text-neutral-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                    aria-hidden
                  >
                    ›
                  </span>
                )}
              </button>

              {isOpen && f.names.length > 0 && (
                <div className="mt-1 space-y-1 pb-1 pl-2">
                  {f.names.map((n) => (
                    <Link
                      key={n.slug}
                      href={`/holding/${n.slug}#takes-${f.host.toLowerCase()}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-neutral-100 px-3 py-2.5 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-600"
                    >
                      <span className="flex w-full items-center gap-2 sm:w-48 sm:shrink-0">
                        <CompanyLogo name={n.company} domain={n.domain} size="sm" />
                        <span className="truncate text-sm font-medium">{n.company}</span>
                        {n.ticker && (
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800">
                            {n.ticker}
                          </span>
                        )}
                      </span>
                      {/* The journey gets the open middle space — no more wrapping in a half-column. */}
                      <span className="min-w-0 flex-1">
                        <StancePath path={n.path} />
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 ring-1 ring-inset ring-amber-500/25 dark:text-amber-400">
                          {n.flips}× flip{n.flips === 1 ? "" : "s"}
                        </span>
                        {n.sinceReturn != null && (
                          <span className={`font-mono text-xs tabular-nums ${returnColor(n.sinceReturn)}`}>
                            {pct(n.sinceReturn)}
                          </span>
                        )}
                      </span>
                    </Link>
                  ))}
                  <Link
                    href={`/host/${f.host.toLowerCase()}`}
                    className="inline-flex items-center gap-1 px-3 pt-1 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    {f.host}&apos;s full track record →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
