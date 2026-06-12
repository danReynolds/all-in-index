import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { buildMarketData } from "./market";
import { REGULAR_HOSTS } from "../lib/types";

const HOST_VALUES = [...REGULAR_HOSTS, "Guest"] as const;
const OUT_FILE = path.join(process.cwd(), "data", "predictions.json");

const SYSTEM = `You extract the formal PREDICTIONS from an All-In annual-predictions episode.

These episodes run a recurring format: each participant gives picks for named
categories (biggest political winner/loser, biggest business winner/loser, best
performing asset, worst performing asset, biggest surprise, most anticipated
trend, etc.). Extract each participant's pick per category.

- category: the show's category name, normalized (e.g. "Best performing asset").
- pick: the prediction itself, concise (e.g. "Uranium", "MSTR collapses", "Google").
- ticker: ONLY for asset picks that map cleanly to a tradable US-listed ticker
  or major ETF (use the obvious one; null otherwise). Commodities: Copper=CPER,
  Oil=USO, Gold=GLD, Silver=SLV, Uranium=URA, Lithium=LIT, Bitcoin=null.
- direction: "up" if the pick is a bet on appreciation (best asset), "down" for
  declines (worst asset / collapse calls), null when not directional.
- quote: SHORT verbatim excerpt (<= 240 chars) of the speaker making the pick,
  copied exactly, with quoteStartSec from the "[<sec>s Speaker]" prefix.
- Only the formal picks segments — not general discussion.`;

const Item = z.object({
  host: z.enum(HOST_VALUES),
  guestName: z.string().nullable(),
  category: z.string(),
  pick: z.string(),
  ticker: z.string().nullable(),
  direction: z.enum(["up", "down"]).nullable(),
  quote: z.string(),
  quoteStartSec: z.number().nullable(),
});
const Schema = z.object({ predictions: z.array(Item) });

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    predictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          host: { type: "string", enum: [...HOST_VALUES] },
          guestName: { type: ["string", "null"] },
          category: { type: "string" },
          pick: { type: "string" },
          ticker: { type: ["string", "null"] },
          direction: { type: ["string", "null"], enum: ["up", "down", null] },
          quote: { type: "string" },
          quoteStartSec: { type: ["number", "null"] },
        },
        required: ["host", "guestName", "category", "pick", "ticker", "direction", "quote", "quoteStartSec"],
      },
    },
  },
  required: ["predictions"],
};

export interface ScoredPrediction {
  host: string;
  guestName: string | null;
  category: string;
  pick: string;
  ticker: string | null;
  direction: "up" | "down" | null;
  quote: string;
  quoteStartMs: number | null;
  /** Stock/proxy return from the episode date to asOf (tickered picks only). */
  sinceReturn: number | null;
}

export interface PredictionsFile {
  generatedAt: string;
  episodes: Array<{
    id: string;
    title: string;
    date: string;
    year: number;
    predictions: ScoredPrediction[];
  }>;
}

/** Extract + score the annual predictions episodes into data/predictions.json. */
export async function extractPredictions(): Promise<void> {
  const out: PredictionsFile = { generatedAt: new Date().toISOString(), episodes: [] };

  for (const epId of store.listEpisodeIds()) {
    const ep = store.loadEpisode(epId);
    if (!ep || !/predictions/i.test(ep.title)) continue;
    const tr = store.loadTranscript(epId);
    if (!tr) continue;
    console.log(`Extracting predictions from ${epId} — ${ep.title}`);

    let text = tr.utterances
      .map((u) => `[${Math.round(u.startMs / 1000)}s ${u.speaker}] ${u.text}`)
      .join("\n");
    if (text.length > 160_000) text = text.slice(0, 160_000);

    const result = await callTool({
      system: SYSTEM,
      user: `Episode ${epId} — "${ep.title}" (${ep.date.slice(0, 10)}).\n\nTranscript:\n\n${text}`,
      toolName: "submit_predictions",
      toolDescription: "Submit the formal predictions made in this episode.",
      inputSchema: INPUT_SCHEMA,
      validate: Schema,
      maxTokens: 8192,
    });

    const nowIso = new Date().toISOString();
    const scored: ScoredPrediction[] = [];
    for (const p of result.predictions) {
      let sinceReturn: number | null = null;
      if (p.ticker) {
        try {
          const md = await buildMarketData(p.ticker.toUpperCase(), ep.date, nowIso);
          sinceReturn = md.returns.since;
        } catch {
          sinceReturn = null;
        }
      }
      scored.push({
        host: p.host,
        guestName: p.guestName,
        category: p.category,
        pick: p.pick,
        ticker: p.ticker?.toUpperCase() ?? null,
        direction: p.direction,
        quote: p.quote,
        quoteStartMs: p.quoteStartSec != null ? p.quoteStartSec * 1000 : null,
        sinceReturn,
      });
    }

    const yearMatch = ep.title.match(/20\d\d/);
    out.episodes.push({
      id: epId,
      title: ep.title,
      date: ep.date,
      year: yearMatch ? parseInt(yearMatch[0], 10) : new Date(ep.date).getUTCFullYear(),
      predictions: scored,
    });
    console.log(`  ✓ ${scored.length} predictions (${scored.filter((p) => p.ticker).length} tickered)`);
  }

  out.episodes.sort((a, b) => b.year - a.year);
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
  console.log(`\n✓ wrote ${OUT_FILE}`);
}
