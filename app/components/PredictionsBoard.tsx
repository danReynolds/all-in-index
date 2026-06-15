"use client";

import { useState } from "react";
import { pct, returnColor, callVerdict } from "@/lib/format";
import { HostAvatar } from "@/app/components/host";
import { GuestName } from "@/app/components/GuestName";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { ListenButton } from "@/app/components/player";
import type { EpisodeMeta, Host } from "@/lib/types";

export interface FinPick {
  speaker: string;
  host: Host;
  guestSlug: string | null;
  category: string;
  pick: string;
  ticker: string | null;
  domain: string | null;
  direction: "up" | "down" | null;
  sinceReturn: number | null;
  quoteStartMs: number | null;
}

export interface PredYear {
  year: number;
  episodeId: string;
  date: string;
  scored: FinPick[];
  other: FinPick[];
}

function verdictOf(p: FinPick) {
  if (!p.direction || p.sinceReturn == null) return null;
  return callVerdict(p.direction === "up" ? "bull" : "bear", p.sinceReturn);
}

function VerdictPill({ right }: { right: boolean | null }) {
  if (right === true)
    return (
      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
        ✓ Right
      </span>
    );
  if (right === false)
    return (
      <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-rose-300 ring-1 ring-inset ring-rose-500/30">
        ✗ Wrong
      </span>
    );
  return (
    <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-neutral-400 ring-1 ring-inset ring-white/10">
      Too early
    </span>
  );
}

function ScoredCard({
  p,
  meta,
  episodeId,
  guestSlug,
}: {
  p: FinPick;
  meta?: EpisodeMeta | null;
  episodeId: string;
  guestSlug: string | null;
}) {
  const v = verdictOf(p);
  const accent =
    v?.right === true
      ? "ring-emerald-500/25"
      : v?.right === false
        ? "ring-rose-500/25"
        : "ring-white/10";
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 ring-1 dark:border-neutral-800 dark:bg-neutral-900 ${accent}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2">
          <HostAvatar host={p.host} size="sm" />
          {p.host === "Guest" && guestSlug ? (
            <GuestName name={p.speaker} slug={guestSlug} className="text-sm font-semibold text-neutral-100" />
          ) : (
            <span className="text-sm font-semibold text-neutral-100">{p.speaker}</span>
          )}
        </span>
        <VerdictPill right={v?.right ?? null} />
      </div>

      <div>
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">{p.category}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <CompanyLogo name={p.pick} domain={p.domain} size="sm" />
          <span className="min-w-0 truncate font-display font-semibold">{p.pick}</span>
          {p.ticker && (
            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800">
              {p.ticker}
            </span>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-neutral-100 pt-2.5 text-xs dark:border-neutral-800/70">
        <span className="text-neutral-500">
          bet it would {p.direction === "up" ? "rise" : "fall"} ·{" "}
          <span className={`font-mono tabular-nums ${returnColor(p.sinceReturn)}`}>{pct(p.sinceReturn)}</span> since
        </span>
        {meta?.audioUrl && p.quoteStartMs != null && (
          <ListenButton meta={meta} episodeId={episodeId} startMs={p.quoteStartMs} caption={`${p.speaker} — ${p.category}`} />
        )}
      </div>
    </div>
  );
}

export function PredictionsBoard({
  years,
  episodes,
}: {
  years: PredYear[];
  episodes: Record<string, EpisodeMeta>;
  guestLinks: Record<string, string>;
}) {
  const [active, setActive] = useState(years[0]?.year);
  const yr = years.find((y) => y.year === active) ?? years[0];
  if (!yr) return null;

  const graded = yr.scored.filter((p) => verdictOf(p) != null);
  const right = graded.filter((p) => verdictOf(p)?.right === true).length;
  const wrong = graded.filter((p) => verdictOf(p)?.right === false).length;

  return (
    <div className="space-y-6">
      {/* Year tabs */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-800 dark:bg-neutral-950/70">
        {years.map((y) => (
          <button
            key={y.year}
            type="button"
            onClick={() => setActive(y.year)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              y.year === active
                ? "bg-neutral-900 text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-950"
                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            }`}
          >
            {y.year}
          </button>
        ))}
      </div>

      {/* Year summary */}
      <p className="text-sm text-neutral-500">
        Their year-ahead asset picks for <strong className="text-neutral-200">{yr.year}</strong>, scored against the
        market.{" "}
        {graded.length > 0 ? (
          <>
            <span className="text-emerald-400">{right} right</span> ·{" "}
            <span className="text-rose-400">{wrong} wrong</span>
            {graded.length - right - wrong > 0 ? ` · ${graded.length - right - wrong} too early` : ""} of{" "}
            {graded.length} gradeable.
          </>
        ) : (
          "None gradeable against a clean ticker yet."
        )}
      </p>

      {/* Graded calls */}
      {yr.scored.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {yr.scored.map((p, i) => (
            <ScoredCard key={i} p={p} meta={episodes[yr.episodeId]} episodeId={yr.episodeId} guestSlug={p.guestSlug} />
          ))}
        </div>
      )}

      {/* Other asset calls — financial but no clean ticker to grade */}
      {yr.other.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Other asset calls</h3>
          <p className="mb-3 text-xs text-neutral-400">Financial bets with no single ticker to grade against.</p>
          <ul className="space-y-2">
            {yr.other.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0">
                  <HostAvatar host={p.host} size="xs" />
                </span>
                <span className="min-w-0">
                  <span className="text-neutral-300">{p.speaker}</span>
                  <span className="text-neutral-500"> · {p.category}: </span>
                  <span className="text-neutral-200">{p.pick}</span>
                  {p.direction && (
                    <span className={p.direction === "up" ? "text-emerald-400" : "text-rose-400"}>
                      {" "}
                      {p.direction === "up" ? "↑" : "↓"}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
