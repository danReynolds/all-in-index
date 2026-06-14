import Link from "next/link";
import type { CSSProperties } from "react";
import { pct, returnColor } from "@/lib/format";
import { HOST_UI, RANK_MEDAL } from "@/lib/hosts";
import { HostAvatar } from "@/app/components/host";
import { Reveal } from "@/app/components/Reveal";
import type { LeaderboardEntry } from "@/lib/types";

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const ranked = entries.filter((e) => e.positions > 0);
  if (ranked.length === 0) return null;

  return (
    <Reveal stagger>
      <section className="space-y-3">
      <div className="stagger-item flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight">Bestie Leaderboard</h2>
        <span className="text-xs text-neutral-500">each host&apos;s own scored public calls</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ranked.map((e, i) => {
          const ui = HOST_UI[e.host];
          return (
            <Link
              href={`/host/${e.host.toLowerCase()}`}
              key={e.host}
              style={{ "--d": `${80 + i * 90}ms` } as CSSProperties}
              className={`stagger-item card-lift sheen group relative overflow-hidden rounded-2xl border bg-white p-4 dark:bg-neutral-900 ${
                i === 0
                  ? "border-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.3)] dark:border-amber-500/40"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              {/* tinted glow + ghosted rank numeral */}
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl"
                style={{ background: ui.hex }}
              />
              <span className="pointer-events-none absolute -bottom-5 right-1 select-none font-display text-8xl font-bold leading-none text-white/[0.05]">
                {i + 1}
              </span>
              <div className="flex items-center justify-between">
                <span className="text-2xl">{RANK_MEDAL[i] ?? ""}</span>
                <span className="inline-block transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
                  <HostAvatar host={e.host} size="lg" />
                </span>
              </div>
              <div className="mt-3 font-display text-lg font-semibold">{ui.name}</div>
              <div className={`text-2xl font-bold tabular-nums ${returnColor(e.portfolioReturn)}`}>
                {pct(e.portfolioReturn)}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                vs S&amp;P {pct(e.benchmarkReturn)} ·{" "}
                <span className={returnColor(e.alpha)}>
                  {e.alpha >= 0 ? "+" : ""}
                  {(e.alpha * 100).toFixed(1)}pp
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-xs text-neutral-500 dark:border-neutral-800">
                <span>{e.positions} {e.positions === 1 ? "position" : "positions"}</span>
                {e.topCall && (
                  <span>
                    top: <span className="font-mono text-neutral-700 dark:text-neutral-300">{e.topCall.ticker}</span>{" "}
                    <span className={returnColor(e.topCall.alpha)}>{e.topCall.alpha >= 0 ? "+" : ""}{(e.topCall.alpha * 100).toFixed(0)}pp</span>
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      </section>
    </Reveal>
  );
}
