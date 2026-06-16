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
  /** Stock/proxy return from the episode date to asOf (tracked picks only). */
  sinceReturn: number | null;
  /** Sparse [isoDate, close] price path since the episode, for the pick's chart. */
  history?: Array<[string, number]>;
  /** When a sector/theme pick is tracked via a representative ETF, the proxy
   *  symbol and a short label of what it represents (null for direct tickers). */
  proxyTicker?: string | null;
  proxyNote?: string | null;
}

/** Price the named ticker from the episode date to now: return + sparse history. */
async function scoreTicker(
  ticker: string,
  epDate: string,
  nowIso: string,
): Promise<{ sinceReturn: number | null; history: Array<[string, number]> }> {
  try {
    const md = await buildMarketData(ticker.toUpperCase(), epDate, nowIso);
    return { sinceReturn: md.returns.since, history: md.history ?? [] };
  } catch {
    return { sinceReturn: null, history: [] };
  }
}

// The financial categories we surface; only these get ETF proxies (the rest are
// political/media/deal/trend picks we don't score).
const FIN_CAT = /performing asset|business winner|business loser/i;

// Curated sector/theme → representative ETF proxies. A pick with no single
// ticker but a clear, well-known sector lens is tracked via the proxy; fuzzy or
// private picks (Polymarket, "California real estate", "young workers") match
// nothing and stay untracked. The UI labels every proxy transparently.
const SECTOR_PROXIES: Array<{ test: RegExp; ticker: string; note: string }> = [
  { test: /mag(nificent)?[\s-]*(7|seven)/i, ticker: "MAGS", note: "Magnificent Seven ETF" },
  { test: /chinese tech|china (internet|tech)/i, ticker: "KWEB", note: "China internet ETF" },
  { test: /software industrial complex|enterprise (application )?software|legacy (enterprise )?saas|vertical saas/i, ticker: "IGV", note: "software sector ETF" },
  { test: /robotic|autonomous hardware/i, ticker: "BOTZ", note: "robotics & AI ETF" },
  { test: /defense (and|&) aerospace|aerospace (and|&) defense|legacy defense/i, ticker: "ITA", note: "aerospace & defense ETF" },
  { test: /critical (metals|minerals|elements)|rare[\s-]?earth|strategic metals/i, ticker: "REMX", note: "rare-earth & strategic-metals ETF" },
  { test: /\bipo(s)?\b|new ipos/i, ticker: "IPO", note: "Renaissance IPO ETF" },
  { test: /tech supercycle|technology supercycle|u\.?s\.? equities/i, ticker: "QQQ", note: "Nasdaq-100 ETF" },
];

function directionFromCategory(category: string): "up" | "down" | null {
  const c = category.toLowerCase();
  if (/best performing|business winner/.test(c)) return "up";
  if (/worst performing|business loser/.test(c)) return "down";
  return null;
}

/** Resolve what symbol to price a pick on: its own ticker, or a sector ETF proxy.
 *  Proxies apply only to financial-category picks with no direct ticker. */
function resolveProxy(p: { pick: string; ticker: string | null; category: string; direction: "up" | "down" | null }): {
  symbol: string | null;
  proxyTicker: string | null;
  proxyNote: string | null;
  direction: "up" | "down" | null;
} {
  if (p.ticker) return { symbol: p.ticker.toUpperCase(), proxyTicker: null, proxyNote: null, direction: p.direction };
  if (!FIN_CAT.test(p.category)) return { symbol: null, proxyTicker: null, proxyNote: null, direction: p.direction };
  const proxy = SECTOR_PROXIES.find((x) => x.test.test(p.pick));
  if (!proxy) return { symbol: null, proxyTicker: null, proxyNote: null, direction: p.direction };
  // A "biggest business winner/loser" pick may carry no explicit direction — the
  // category states the bet, so infer it for the proxy verdict.
  return { symbol: proxy.ticker, proxyTicker: proxy.ticker, proxyNote: proxy.note, direction: p.direction ?? directionFromCategory(p.category) };
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
      const r = resolveProxy(p);
      const m = r.symbol ? await scoreTicker(r.symbol, ep.date, nowIso) : { sinceReturn: null, history: [] };
      scored.push({
        host: p.host,
        guestName: p.guestName,
        category: p.category,
        pick: p.pick,
        ticker: p.ticker?.toUpperCase() ?? null,
        direction: r.direction,
        quote: p.quote,
        quoteStartMs: p.quoteStartSec != null ? p.quoteStartSec * 1000 : null,
        sinceReturn: m.sinceReturn,
        history: m.history.length ? m.history : undefined,
        proxyTicker: r.proxyTicker,
        proxyNote: r.proxyNote,
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

/**
 * Re-price the existing predictions (sinceReturn + sparse history per tickered
 * pick) WITHOUT re-running the LLM extraction — cheap, deterministic, safe to
 * re-run on a schedule as prices move.
 */
export async function rescorePredictions(): Promise<void> {
  if (!fs.existsSync(OUT_FILE)) throw new Error("No predictions.json — run extract-predictions first.");
  const data: PredictionsFile = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
  const nowIso = new Date().toISOString();
  let priced = 0;
  for (const ep of data.episodes) {
    let n = 0;
    for (const p of ep.predictions) {
      const r = resolveProxy(p);
      p.proxyTicker = r.proxyTicker;
      p.proxyNote = r.proxyNote;
      if (r.direction && !p.direction) p.direction = r.direction; // record inferred direction for proxy picks
      if (!r.symbol) {
        p.sinceReturn = null;
        p.history = undefined;
        continue;
      }
      const m = await scoreTicker(r.symbol, ep.date, nowIso);
      p.sinceReturn = m.sinceReturn;
      p.history = m.history.length ? m.history : undefined;
      n++;
      priced++;
    }
    console.log(`  ${ep.id} (${ep.year}): repriced ${n} picks (direct + proxy)`);
  }
  data.generatedAt = nowIso;
  fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n✓ repriced ${priced} picks → ${OUT_FILE}`);
}
