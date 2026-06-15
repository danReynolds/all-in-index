import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { getIndex, guestLinkMap } from "@/lib/data";
import { pct, returnColor, fmtDate, callVerdict } from "@/lib/format";
import { HostAvatar } from "@/app/components/host";
import { GuestName } from "@/app/components/GuestName";
import { ListenButton } from "@/app/components/player";
import { Reveal } from "@/app/components/Reveal";
import { BackLink } from "@/app/components/BackLink";
import type { Host } from "@/lib/types";
import type { PredictionsFile, ScoredPrediction } from "@/pipeline/extract-predictions";

export const metadata = {
  title: "Predictions Scorecard — The All-Index",
  description: "The annual predictions episodes, extracted and scored against the market.",
};

function loadPredictions(): PredictionsFile | null {
  const f = path.join(process.cwd(), "data", "predictions.json");
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function speakerLabel(p: ScoredPrediction): string {
  return p.host === "Guest" ? (p.guestName ?? "Guest") : p.host;
}

export default function PredictionsPage() {
  const data = loadPredictions();
  const { snapshot } = getIndex();
  const episodes = snapshot.episodes ?? {};
  const guestLinks = guestLinkMap();

  if (!data || data.episodes.length === 0) {
    return (
      <div className="space-y-4">
        <BackLink href="/">Home</BackLink>
        <p className="text-neutral-500">No predictions extracted yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <BackLink href="/">Home</BackLink>

      <header className="rise space-y-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
          The annual picks game
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Predictions Scorecard
        </h1>
        <p className="max-w-2xl text-neutral-600 dark:text-neutral-400">
          Every formal prediction from the year-ahead episodes — asset picks scored against the
          market from the day they were made. Not financial advice; receipts included.
        </p>
      </header>

      {data.episodes.map((ep) => {
        const bySpeaker = new Map<string, ScoredPrediction[]>();
        for (const p of ep.predictions) {
          const k = speakerLabel(p);
          (bySpeaker.get(k) ?? bySpeaker.set(k, []).get(k)!).push(p);
        }
        return (
          <Reveal key={ep.id}>
            <section className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl font-bold tracking-tight">{ep.year} predictions</h2>
                <span className="text-xs text-neutral-500">
                  <Link href={`/episode/${ep.id}`} className="font-mono hover:underline">
                    {ep.id}
                  </Link>{" "}
                  · {fmtDate(ep.date)}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[...bySpeaker.entries()].map(([speaker, picks]) => {
                  const hostKey = picks[0].host as Host;
                  return (
                    <div
                      key={speaker}
                      className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <HostAvatar host={hostKey} size="md" />
                        {hostKey === "Guest" && guestLinks[speaker] ? (
                          <GuestName
                            name={speaker}
                            slug={guestLinks[speaker]}
                            className="font-display font-semibold"
                          />
                        ) : (
                          <span className="font-display font-semibold">{speaker}</span>
                        )}
                      </div>
                      <ul className="space-y-2.5">
                        {picks.map((p, i) => {
                          const v =
                            p.direction && p.sinceReturn != null
                              ? callVerdict(p.direction === "up" ? "bull" : "bear", p.sinceReturn)
                              : null;
                          return (
                            <li key={i} className="text-sm">
                              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                                {p.category}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-medium text-neutral-100">{p.pick}</span>
                                {p.ticker && (
                                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-500 dark:bg-neutral-800">
                                    {p.ticker}
                                  </span>
                                )}
                                {p.sinceReturn != null && (
                                  <span className={`font-mono text-xs tabular-nums ${returnColor(p.direction === "down" ? -p.sinceReturn : p.sinceReturn)}`}>
                                    {pct(p.sinceReturn)}
                                  </span>
                                )}
                                {v && v.right != null && (
                                  <span className={`text-[11px] font-semibold ${v.right ? "text-emerald-400" : "text-rose-400"}`}>
                                    {v.right ? "✓ right" : "✗ wrong"}
                                  </span>
                                )}
                                {episodes[ep.id]?.audioUrl && p.quoteStartMs != null && (
                                  <span className="text-xs">
                                    <ListenButton
                                      meta={episodes[ep.id]}
                                      episodeId={ep.id}
                                      startMs={p.quoteStartMs}
                                      caption={`${speaker} — ${p.category}`}
                                    />
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          </Reveal>
        );
      })}

      <p className="text-xs text-neutral-400">
        Tickered picks are scored from the episode-day close via the named ticker or ETF proxy;
        directional verdicts use a ±2% dead zone. As of {fmtDate(data.generatedAt)}.
      </p>
    </div>
  );
}
