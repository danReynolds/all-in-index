"use client";

import Link from "next/link";
import { useState } from "react";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { HostStack } from "@/app/components/host";
import type { AlphaCall, ConsensusSplitDetail } from "@/lib/insights";

const pp = (x: number | null) => (x == null ? "—" : (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "pp");

function CallList({ calls }: { calls: AlphaCall[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {calls.map((c) => (
        <Link
          key={c.slug}
          href={`/holding/${c.slug}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 px-3 py-2 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-600"
        >
          <span className="flex min-w-0 items-center gap-2">
            <CompanyLogo name={c.company} domain={c.domain} size="sm" />
            <span className="truncate text-sm font-medium">{c.company}</span>
            <HostStack hosts={c.hosts} size="sm" />
          </span>
          <span
            className={`shrink-0 font-mono text-xs tabular-nums ${
              c.alpha >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {c.alpha >= 0 ? "+" : ""}
            {(c.alpha * 100).toFixed(0)}pp
          </span>
        </Link>
      ))}
    </div>
  );
}

export function ConsensusCards({ split }: { split: ConsensusSplitDetail }) {
  const [open, setOpen] = useState<"consensus" | "solo" | null>(null);

  const card = (
    key: "consensus" | "solo",
    label: string,
    side: ConsensusSplitDetail["consensus"],
    good?: boolean,
  ) => {
    const isOpen = open === key;
    return (
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setOpen(isOpen ? null : key)}
        className={`rounded-2xl border bg-white p-5 text-left transition-colors dark:bg-neutral-900 ${
          good ? "border-emerald-200 dark:border-emerald-900/60" : "border-neutral-200 dark:border-neutral-800"
        } ${isOpen ? "ring-2 ring-inset ring-emerald-500/30" : "hover:border-neutral-300 dark:hover:border-neutral-600"}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500">{label}</span>
          <span className={`text-neutral-400 transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>
            ›
          </span>
        </div>
        <div className={`mt-1 text-3xl font-bold tabular-nums ${good ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
          {pp(side.meanAlpha)}
        </div>
        <div className="mt-1 text-xs text-neutral-400">
          mean alpha vs S&amp;P · {side.n} {side.n === 1 ? "call" : "calls"} · tap to see them
        </div>
      </button>
    );
  };

  const shown = open ? split[open] : null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {card("consensus", "When 2+ besties agreed", split.consensus, true)}
        {card("solo", "When just one called it", split.solo)}
      </div>
      {shown && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
            {shown.n} {open === "consensus" ? "consensus" : "solo"} calls · best first
          </p>
          <CallList calls={shown.calls} />
        </div>
      )}
    </div>
  );
}
