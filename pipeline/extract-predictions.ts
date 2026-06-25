import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { buildMarketData } from "./market";
import { findQuoteUtterance } from "./run-episode";
import { REGULAR_HOSTS } from "../lib/types";
import type { Transcript } from "../lib/types";
import { sectorProxyInfo, SECTOR_PROXY_PROMPT, SECTOR_PROXY_TICKER_VALUES } from "../lib/proxies";

const HOST_VALUES = [...REGULAR_HOSTS, "Guest"] as const;
const OUT_FILE = path.join(process.cwd(), "data", "predictions.json");

const SYSTEM = `You extract the formal PREDICTIONS from an All-In annual-predictions episode.

These episodes run a recurring format: each participant gives picks for named
categories (biggest political winner/loser, biggest business winner/loser, best
performing asset, worst performing asset, biggest surprise, most anticipated
trend, etc.). Extract each participant's pick(s) per category.

- ATTRIBUTION — attribute every pick to the speaker in the BRACKETED LABEL of
  the utterance that actually states it ("[3847s Chamath] …I'd pick the
  supercycle in tech" → Chamath). The label is the source of truth for WHO made
  the pick. Do NOT attribute by who the moderator called on: these rounds move
  fast and a host routinely answers out of turn or jumps in ahead of the person
  who was asked. "What do you got, Sacks?" tells you who was INVITED, not who
  answered — if the next labelled speaker is someone else, the pick is theirs.
- A participant may also circle back to an earlier category later ("by the way,
  on best performing asset, one we didn't talk about…"). Capture that as a pick
  in that earlier category, attributed to its bracketed speaker.
- A participant usually gives ONE pick per category, but sometimes gives several
  distinct, ranked answers ("my number one is Huawei… and the second is
  Polymarket"). When they do, output ONE prediction object PER distinct pick —
  same host and category, in the order spoken, each with its OWN pick text,
  ticker/direction, and quote. NEVER merge distinct picks into a single pick
  string (no "Huawei; Polymarket"). This is different from a single themed bet
  that merely names example companies ("the defense primes — Boeing, Lockheed,
  Raytheon"; "the wagering space — Robinhood and Coinbase"): that stays ONE pick
  (use \`tickers\` to score it as an equal-weight basket). Rule of thumb: separate
  answers → separate rows; one theme/space named with examples → one row.
- category: the show's category name, normalized (e.g. "Best performing asset").
- pick: a SINGLE prediction, concise (e.g. "Uranium", "MSTR collapses", "Google").
- ticker: ONLY for asset picks that map cleanly to a tradable US-listed ticker
  or major ETF (use the single most representative one; null otherwise).
  Commodities: Copper=CPER, Oil=USO, Gold=GLD, Silver=SLV, Uranium=URA,
  Lithium=LIT, Bitcoin=null.
- tickers: when the pick EXPLICITLY names MULTIPLE publicly-traded companies (a
  basket, e.g. "Robinhood and Coinbase" or "the gambling names — DraftKings,
  Coinbase, Robinhood"), list ALL their US-listed tickers here, INCLUDING the
  one in \`ticker\` — we score an equal-weight blend of them. Omit any name that
  isn't publicly US-listed (private companies, unlisted foreign names). null for
  single-name picks, theme picks, and any pick naming only one public company.
- sectorProxy: for a SECTOR/THEME asset pick with no direct ticker that IS
  fairly represented by one of these liquid ETFs, set it to that ticker
  (direction still comes from the category/direction, not the proxy); null
  otherwise, and null whenever ticker is set. Available proxies:
${SECTOR_PROXY_PROMPT}
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
  tickers: z.array(z.string()).nullable().optional(),
  sectorProxy: z.string().nullable().optional(),
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
          tickers: { type: ["array", "null"], items: { type: "string" }, description: "All US-listed tickers when the pick names multiple public companies (a basket); scored equal-weight. null otherwise." },
          sectorProxy: { type: ["string", "null"], enum: [...SECTOR_PROXY_TICKER_VALUES, null], description: "Representative ETF for a sector/theme pick with no direct ticker; null otherwise" },
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
  /** Stock/proxy return from the episode date to asOf (tracked picks only).
   *  For a basket, this is the equal-weight blend of the constituents. */
  sinceReturn: number | null;
  /** Sparse [isoDate, close] price path since the episode, for the pick's chart.
   *  For a basket, an equal-weight index normalized to 100 at the episode date. */
  history?: Array<[string, number]>;
  /** When a sector/theme pick is tracked via a representative ETF, the proxy
   *  symbol and a short label of what it represents (null for direct tickers). */
  proxyTicker?: string | null;
  proxyNote?: string | null;
  /** When the pick names multiple public companies, the equal-weight basket:
   *  each constituent ticker and its own since-call return (null if unpriced). */
  basket?: Array<{ ticker: string; sinceReturn: number | null }>;
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

/** Blend constituent price paths into one equal-weight index normalized to 100
 *  at the episode date. Each name is rebased to its own first close, then we
 *  average (forward-filling the last known value for names sampled on other
 *  days). The index's total return equals the equal-weight mean of the legs. */
function blendEqualWeight(histories: Array<Array<[string, number]>>): Array<[string, number]> {
  const valid = histories.filter((h) => h.length > 1);
  if (!valid.length) return [];
  const norm = valid.map((h) => new Map(h.map(([d, c]) => [d, c / (h[0][1] || 1)])));
  const dates = [...new Set(valid.flatMap((h) => h.map(([d]) => d)))].sort();
  const last = valid.map(() => 1);
  const out: Array<[string, number]> = [];
  for (const d of dates) {
    norm.forEach((m, i) => {
      const v = m.get(d);
      if (v != null) last[i] = v;
    });
    out.push([d, +((last.reduce((s, v) => s + v, 0) / last.length) * 100).toFixed(2)]);
  }
  return out;
}

/** Price an equal-weight basket of named tickers from the episode date to now:
 *  the blended return, a blended index for the chart, and each leg's own return
 *  (for the "how it's scored" breakdown). Unpriceable legs are kept as null. */
async function scoreBasket(
  tickers: string[],
  epDate: string,
  nowIso: string,
): Promise<{ sinceReturn: number | null; history: Array<[string, number]>; legs: Array<{ ticker: string; sinceReturn: number | null }> }> {
  const priced = await Promise.all(
    tickers.map(async (t) => {
      try {
        const md = await buildMarketData(t.toUpperCase(), epDate, nowIso);
        return { ticker: t.toUpperCase(), sinceReturn: md.returns.since, history: md.history ?? [] };
      } catch {
        return { ticker: t.toUpperCase(), sinceReturn: null, history: [] as Array<[string, number]> };
      }
    }),
  );
  const legs = priced.map(({ ticker, sinceReturn }) => ({ ticker, sinceReturn }));
  const withReturn = priced.filter((p) => p.sinceReturn != null);
  if (!withReturn.length) return { sinceReturn: null, history: [], legs };
  const sinceReturn = withReturn.reduce((s, p) => s + (p.sinceReturn as number), 0) / withReturn.length;
  const history = blendEqualWeight(withReturn.map((p) => p.history));
  return { sinceReturn, history, legs };
}

// The financial categories we surface; only these get ETF proxies (the rest are
// political/media/deal/trend picks we don't score). The sector→ETF proxy map
// itself lives in lib/proxies.ts (shared with the /proxy detail pages).
const FIN_CAT = /performing asset|business winner|business loser/i;

function directionFromCategory(category: string): "up" | "down" | null {
  const c = category.toLowerCase();
  if (/best performing|business winner/.test(c)) return "up";
  if (/worst performing|business loser/.test(c)) return "down";
  return null;
}

/** Resolve what symbol to price a pick on: its own ticker, or a sector ETF proxy.
 *  Proxies apply only to financial-category picks with no direct ticker. */
function resolveProxy(p: { pick: string; ticker: string | null; sectorProxy?: string | null; category: string; direction: "up" | "down" | null }): {
  symbol: string | null;
  proxyTicker: string | null;
  proxyNote: string | null;
  direction: "up" | "down" | null;
} {
  if (p.ticker) return { symbol: p.ticker.toUpperCase(), proxyTicker: null, proxyNote: null, direction: p.direction };
  if (!FIN_CAT.test(p.category)) return { symbol: null, proxyTicker: null, proxyNote: null, direction: p.direction };
  // The LLM names the representative ETF (sectorProxy) for sector/theme picks —
  // no text matching here. Unknown tickers resolve to null and stay untracked.
  const proxy = sectorProxyInfo(p.sectorProxy);
  if (!proxy) return { symbol: null, proxyTicker: null, proxyNote: null, direction: p.direction };
  // A "biggest business winner/loser" pick may carry no explicit direction — the
  // category states the bet, so infer it for the proxy verdict.
  return { symbol: proxy.ticker, proxyTicker: proxy.ticker, proxyNote: proxy.note, direction: p.direction ?? directionFromCategory(p.category) };
}

const GROUNDABLE_SPEAKERS = new Set<string>([...REGULAR_HOSTS, "Guest"]);

/**
 * Deterministically anchor each pick's attribution to the diarized speaker who
 * actually said it. The model still mislabels picks in these fast rounds — by
 * the moderator's hand-off ("what do you got, Sacks?" then a DIFFERENT host
 * answers) or by a name spoken mid-utterance ("go ahead, Shamath. I would
 * pick…" is the SPEAKER's own pick, not Chamath's). So we ignore conversational
 * cues and take the speaker label of the utterance the quote belongs to as the
 * source of truth — the same mechanical grounding repairQuoteOwnership applies
 * to the index theses. Picks whose quote can't be located, or that resolve to
 * "Unknown", keep the model's attribution.
 */
function groundHostsByQuote(preds: z.infer<typeof Item>[], tr: Transcript): number {
  let fixed = 0;
  for (const p of preds) {
    if (!p.quote) continue;
    const owner = findQuoteUtterance(tr, p.quote);
    if (!owner || !GROUNDABLE_SPEAKERS.has(owner.speaker) || owner.speaker === p.host) continue;
    p.host = owner.speaker as z.infer<typeof Item>["host"];
    if (owner.speaker !== "Guest") p.guestName = null; // a regular host owns it, not the guest
    fixed++;
  }
  return fixed;
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

    const regrounded = groundHostsByQuote(result.predictions, tr);
    if (regrounded) console.log(`  ↻ re-attributed ${regrounded} pick(s) to the diarized speaker who said them`);

    const nowIso = new Date().toISOString();
    const scored: ScoredPrediction[] = [];
    for (const p of result.predictions) {
      const common = {
        host: p.host,
        guestName: p.guestName,
        category: p.category,
        pick: p.pick,
        quote: p.quote,
        quoteStartMs: p.quoteStartSec != null ? p.quoteStartSec * 1000 : null,
      };
      // A pick naming 2+ public companies is scored as an equal-weight basket.
      const basketTickers =
        FIN_CAT.test(p.category) && p.tickers && p.tickers.length >= 2
          ? [...new Set(p.tickers.map((t) => t.toUpperCase()))]
          : null;
      if (basketTickers) {
        const b = await scoreBasket(basketTickers, ep.date, nowIso);
        scored.push({
          ...common,
          ticker: p.ticker?.toUpperCase() ?? basketTickers[0],
          direction: p.direction ?? directionFromCategory(p.category),
          sinceReturn: b.sinceReturn,
          history: b.history.length ? b.history : undefined,
          proxyTicker: null,
          proxyNote: null,
          basket: b.legs,
        });
        continue;
      }
      const r = resolveProxy(p);
      const m = r.symbol ? await scoreTicker(r.symbol, ep.date, nowIso) : { sinceReturn: null, history: [] };
      scored.push({
        ...common,
        ticker: p.ticker?.toUpperCase() ?? null,
        direction: r.direction,
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
      // Re-price a basket from its stored constituents (equal-weight).
      if (p.basket && p.basket.length >= 2) {
        const b = await scoreBasket(p.basket.map((l) => l.ticker), ep.date, nowIso);
        p.sinceReturn = b.sinceReturn;
        p.history = b.history.length ? b.history : undefined;
        p.basket = b.legs;
        p.proxyTicker = null;
        p.proxyNote = null;
        n++;
        priced++;
        continue;
      }
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
