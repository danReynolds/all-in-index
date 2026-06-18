import fs from "node:fs";
import path from "node:path";
import { getIndex, guestLinkMap } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { BackLink } from "@/app/components/BackLink";
import { PredictionsBoard, type PredYear, type FinPick } from "@/app/components/PredictionsBoard";
import type { Host } from "@/lib/types";
import type { PredictionsFile } from "@/pipeline/extract-predictions";

export const metadata = {
  title: "Predictions Scorecard",
  description: "The besties' year-ahead asset picks, scored against the market.",
};

function loadPredictions(): PredictionsFile | null {
  const f = path.join(process.cwd(), "data", "predictions.json");
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

// Financial categories whose directional picks we treat as asset calls even
// without a clean ticker. Everything else (political, media, deals) is dropped.
const FIN_CAT = /performing asset|business winner|business loser/i;

export default function PredictionsPage() {
  const data = loadPredictions();
  const { snapshot } = getIndex();
  const episodes = snapshot.episodes ?? {};
  const guestLinks = guestLinkMap();
  const tickerDomain = new Map<string, string | null>();
  for (const h of snapshot.holdings) if (h.ticker) tickerDomain.set(h.ticker.toUpperCase(), h.domain ?? null);

  if (!data || data.episodes.length === 0) {
    return (
      <div className="space-y-4">
        <BackLink href="/">Home</BackLink>
        <p className="text-neutral-500">No predictions extracted yet.</p>
      </div>
    );
  }

  const years: PredYear[] = data.episodes
    .map((ep) => {
      const toPick = (p: PredictionsFile["episodes"][number]["predictions"][number]): FinPick => ({
        speaker: p.host === "Guest" ? (p.guestName ?? "Guest") : p.host,
        host: p.host as Host,
        guestSlug: p.host === "Guest" && p.guestName ? (guestLinks[p.guestName] ?? null) : null,
        category: p.category,
        pick: p.pick,
        ticker: p.ticker,
        domain: p.ticker ? (tickerDomain.get(p.ticker.toUpperCase()) ?? null) : null,
        direction: p.direction,
        sinceReturn: p.sinceReturn,
        quote: p.quote,
        quoteStartMs: p.quoteStartMs,
        history: p.history ?? null,
        proxyTicker: p.proxyTicker ?? null,
        proxyNote: p.proxyNote ?? null,
      });
      // Every host's pick in the financial categories — graded where it maps to a
      // single ticker, shown but ungraded otherwise. Political/media/deal/trend
      // categories are left off (this is a markets scorecard).
      const picks = ep.predictions.filter((p) => FIN_CAT.test(p.category)).map(toPick);
      return { year: ep.year, episodeId: ep.id, date: ep.date, picks };
    })
    .filter((y) => y.picks.length > 0)
    .sort((a, b) => b.year - a.year);

  return (
    <div className="space-y-8">
      <BackLink href="/">Home</BackLink>

      <header className="rise space-y-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
          The annual picks game
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Predictions Scorecard</h1>
        <p className="max-w-2xl text-neutral-600 dark:text-neutral-400">
          Each January the besties call the year ahead. Here are their market picks, by category —
          graded against the market wherever a pick maps to a single ticker.
        </p>
      </header>

      <PredictionsBoard
        years={years}
        episodes={episodes}
        guestLinks={guestLinks}
        nowYear={new Date(data.generatedAt).getUTCFullYear()}
      />

      <p className="text-xs text-neutral-400">
        Picks are scored from the episode-day close — via the named ticker, or a representative
        sector ETF for theme calls (e.g. software → IGV, China tech → KWEB), labelled on each card.
        Directional verdicts use a ±2% dead zone. Political, media, and deal predictions are left
        off — this is a markets scorecard. As of {fmtDate(data.generatedAt)}.
      </p>
    </div>
  );
}
