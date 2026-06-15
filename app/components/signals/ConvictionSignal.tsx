"use client";

import Link from "next/link";
import { useState } from "react";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { HostStack } from "@/app/components/host";
import type { ConvictionBucketDetail } from "@/lib/insights";

const pp = (x: number | null) => (x == null ? "—" : (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp");

const BLURB: Record<string, string> = {
  high: "“This is a great buy.” Stated plainly, with conviction.",
  medium: "A clear positive view, but qualified or in passing.",
  low: "A hedged lean — these never enter the index, shown for contrast.",
};

export function ConvictionSignal({ buckets }: { buckets: ConvictionBucketDetail[] }) {
  const [open, setOpen] = useState<string | null>(null);
  // One shared scale so the three bars are visually comparable.
  const maxAbs = Math.max(0.0001, ...buckets.map((b) => Math.abs(b.meanAlpha ?? 0)));

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="space-y-1.5">
        {buckets.map((b) => {
          const positive = (b.meanAlpha ?? 0) >= 0;
          const w = b.meanAlpha == null ? 0 : (Math.abs(b.meanAlpha) / maxAbs) * 100;
          const isOpen = open === b.label;
          const canOpen = b.members.length > 0;
          return (
            <div key={b.label}>
              <button
                type="button"
                disabled={!canOpen}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : b.label)}
                className={`flex w-full items-center gap-4 rounded-xl px-2 py-2 text-left transition-colors ${
                  canOpen ? "hover:bg-neutral-50 dark:hover:bg-neutral-800/60" : "cursor-default"
                } ${isOpen ? "bg-neutral-50 dark:bg-neutral-800/60" : ""}`}
              >
                <span className="w-16 shrink-0 text-sm font-medium capitalize">{b.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className={`h-full rounded-full transition-all ${positive ? "bg-emerald-500" : "bg-rose-500"}`}
                    style={{ width: `${w}%` }}
                  />
                </div>
                <span
                  className={`w-20 text-right font-mono text-sm tabular-nums ${
                    positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {pp(b.meanAlpha)}
                </span>
                <span className="hidden w-14 text-right text-xs text-neutral-400 sm:inline">
                  {b.n} {b.n === 1 ? "call" : "calls"}
                </span>
                {canOpen && (
                  <span className={`w-3 text-neutral-400 transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>
                    ›
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="mb-1 ml-2 mt-1 space-y-1">
                  <p className="px-1 pb-1 text-xs text-neutral-400">{BLURB[b.label]}</p>
                  {b.members.map((m) => (
                    <Link
                      key={m.slug}
                      href={`/holding/${m.slug}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 px-3 py-2 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-600"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <CompanyLogo name={m.company} domain={m.domain} size="sm" />
                        <span className="truncate text-sm font-medium">{m.company}</span>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800">
                          {m.ticker}
                        </span>
                        <HostStack hosts={m.hosts} size="sm" />
                      </span>
                      <span
                        className={`shrink-0 font-mono text-xs tabular-nums ${
                          m.alpha >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {m.alpha >= 0 ? "+" : ""}
                        {(m.alpha * 100).toFixed(0)}pp
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
