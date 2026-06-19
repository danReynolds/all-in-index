import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { callTool } from "./llm";
import { buildMarketData } from "./market";
import { buildIndexFund, buildWindowFund, buildBearBook, buildGuestLeaderboard, BESTIES, GUESTS } from "./index-fund";
import { canonicalize } from "./entities";
import { ensureCompanyMeta } from "./descriptions";
import { currentStanceFromTheses, isCallShaped } from "../lib/calls";
import { sectorProxyInfo } from "../lib/proxies";
import { trimPublishedQuote } from "../lib/quotes";
import { store } from "./store";
import { REGULAR_HOSTS } from "../lib/types";
import type {
  Holding,
  Host,
  IndexFund,
  IndexSnapshot,
  LeaderboardEntry,
  Stance,
  Thesis,
} from "../lib/types";

/** Score each host by how their OWN portfolio-scored public calls performed. */
async function buildLeaderboard(
  holdings: Holding[],
  nowIso: string,
): Promise<{ entries: LeaderboardEntry[]; hostFunds: Partial<Record<Host, IndexFund | null>> }> {
  const entries: LeaderboardEntry[] = [];
  const hostFunds: Partial<Record<Host, IndexFund | null>> = {};
  for (const host of REGULAR_HOSTS) {
    // Window-based: in the market only while the host's portfolio-scored calls carry exposure.
    const fund = await buildWindowFund(holdings, nowIso, host);
    hostFunds[host] = fund;
    const top = fund?.constituents[0] ?? null;
    entries.push({
      host,
      positions: fund?.constituents.length ?? 0,
      portfolioReturn: fund?.portfolioReturn ?? 0,
      benchmarkReturn: fund?.benchmarkReturn ?? 0,
      alpha: fund ? fund.portfolioReturn - fund.benchmarkReturn : 0,
      topCall: top ? { ticker: top.ticker, alpha: top.alpha } : null,
    });
  }
  // Rank by return; hosts with no tradable calls sink to the bottom.
  entries.sort((a, b) => {
    if (a.positions === 0 && b.positions === 0) return 0;
    if (a.positions === 0) return 1;
    if (b.positions === 0) return -1;
    return b.portfolioReturn - a.portfolioReturn;
  });
  return { entries, hostFunds };
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|corp|corporation|co|ltd|llc|plc|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugFor(ticker: string | null, name: string): string {
  if (ticker) return ticker.toLowerCase();
  return normalizeName(name).replace(/\s+/g, "-");
}

/**
 * A holding's stance is its CURRENT stance: the balance of each host's latest
 * scored take (see lib/calls.ts) — not an all-history vote, which goes stale
 * on names the table's view evolved on (e.g. bearish 2024 → bullish 2026).
 */
function netStance(theses: Thesis[]): Stance {
  return currentStanceFromTheses(theses);
}

const SynthSchema = z.object({ synthesis: z.string() });

export function shouldKeepThesisForIndex(
  t: Thesis,
  sharedQuoteCompanyCount: number,
): boolean {
  if (sharedQuoteCompanyCount > 1 && !isCallShaped(t) && !t.scoreNote) {
    return false;
  }
  if (t.conviction === "low" && t.stance === "neutral") return false;
  return true;
}

/**
 * Attach the representative ETF the extractor chose for a sector/theme/macro
 * basket (Thesis.sectorProxy), so the call can be priced. Only for a scoreable
 * call with no direct ticker — the LLM's having named a proxy IS the gate
 * (replacing the old regex term-list + matcher). The proxy is disclosed in the
 * scoreNote; structural exclusion from the company funds is handled downstream.
 */
export function attachSectorProxy(t: Thesis): void {
  if (t.ticker || !isCallShaped(t) || t.excludeReason || !t.sectorProxy) return;
  const proxy = sectorProxyInfo(t.sectorProxy);
  if (!proxy) return;
  t.ticker = proxy.ticker;
  t.isPublic = true;
  t.scoreNote = t.scoreNote
    ? `${t.scoreNote} ETF proxy: ${proxy.note}.`
    : `ETF proxy: ${proxy.note}; quote is an explicit sector/theme call.`;
}

// Synthesis cache: keyed by the holding's exact take-set, so unchanged
// holdings never re-spend tokens (the 6-hourly cron would otherwise
// re-synthesize ~125 holdings every run).
const SYNTH_CACHE_FILE = path.join(process.cwd(), "data", "syntheses.json");

function takeSetKey(company: string, theses: Thesis[]): string {
  const basis = company + "|" + theses.map((t) => t.id).sort().join(",");
  let h = 5381;
  for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function loadSynthCache(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(SYNTH_CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}
const SYNTH_SYSTEM = `You summarize the All-In hosts' collective view on a single company, based ONLY on the provided per-host theses.

Write 2–4 sentences that:
- capture the overall stance and the main reasons given,
- note where hosts agree or disagree (attribute by name),
- stay strictly faithful to the supplied material — do not add outside facts or invent views.
Neutral, factual tone. No hype.`;

async function synthesize(company: string, theses: Thesis[]): Promise<string> {
  const material = theses
    .map(
      (t) =>
        `- ${t.host} (${t.stance}, ${t.conviction} conviction, ${t.episodeDate.slice(0, 10)}): ${t.summary} | quote: "${t.quote}"`,
    )
    .join("\n");
  const { synthesis } = await callTool({
    system: SYNTH_SYSTEM,
    user: `Company: ${company}\n\nPer-host theses:\n${material}`,
    toolName: "submit_synthesis",
    toolDescription: "Submit the synthesized cross-host view.",
    inputSchema: {
      type: "object",
      properties: { synthesis: { type: "string" } },
      required: ["synthesis"],
    },
    validate: SynthSchema,
    maxTokens: 1024,
  });
  return synthesis;
}

/**
 * Aggregate every processed episode's theses into company-level holdings,
 * attach market performance (anchored at first mention), synthesize the
 * cross-host view, and write data/holdings.json.
 */
export async function buildIndex(): Promise<IndexSnapshot> {
  const episodeIds = store.listEpisodeIds();
  const allTheses: Thesis[] = [];
  for (const id of episodeIds) allTheses.push(...store.loadTheses(id));
  console.log(`Aggregating ${allTheses.length} theses from ${episodeIds.length} episodes…`);

  // Canonicalize entity names/tickers (merge variants, drop crypto tickers).
  for (const t of allTheses) {
    t.quote = trimPublishedQuote(t.quote);
    const c = canonicalize(t.company, t.ticker, t.isPublic);
    t.company = c.company;
    t.ticker = c.ticker;
    t.isPublic = c.isPublic;
    attachSectorProxy(t);
  }

  // Drop weak / non-substantive theses so we never surface passing mentions:
  //  - passive news-list mentions, where one quote is reused across multiple
  //    companies without a call-shaped pick/trade
  //  - low-conviction non-views (hedged + neutral, no directional take)
  const quoteCompanies = new Map<string, Set<string>>();
  for (const t of allTheses) {
    if (!t.quote) continue;
    const key = t.quote.slice(0, 40).toLowerCase();
    (quoteCompanies.get(key) ?? quoteCompanies.set(key, new Set()).get(key)!).add(t.company);
  }
  const theses = allTheses.filter((t) => {
    const shared = t.quote
      ? quoteCompanies.get(t.quote.slice(0, 40).toLowerCase())
      : null;
    return shouldKeepThesisForIndex(t, shared?.size ?? 1);
  });
  console.log(`Kept ${theses.length} substantive theses (dropped ${allTheses.length - theses.length} weak/passing-mention).`);

  // Group by normalized company name first, then merge name-variants that
  // resolve to the same ticker (e.g. "Google"/"Alphabet" -> GOOGL,
  // "Amazon"/"Amazon Web Services" -> AMZN) so each ticker is a single holding
  // with a unique slug.
  const byName = new Map<string, Thesis[]>();
  for (const t of theses) {
    const key = normalizeName(t.company);
    (byName.get(key) ?? byName.set(key, []).get(key)!).push(t);
  }
  const groups = new Map<string, Thesis[]>();
  for (const [nameKey, ts] of byName) {
    const ticker = ts.map((t) => t.ticker).find((x): x is string => !!x) ?? null;
    const canonical = ticker ? ticker.toUpperCase() : nameKey;
    (groups.get(canonical) ?? groups.set(canonical, []).get(canonical)!).push(...ts);
  }

  const nowIso = new Date().toISOString();
  const holdings: Holding[] = [];
  const synthCache = loadSynthCache();
  let synthHits = 0;
  let synthMisses = 0;

  for (const theses of groups.values()) {
    theses.sort((a, b) => a.episodeDate.localeCompare(b.episodeDate));
    const ticker =
      theses.map((t) => t.ticker).find((x): x is string => !!x) ?? null;
    // Most frequent display name.
    const nameCounts = new Map<string, number>();
    for (const t of theses) nameCounts.set(t.company, (nameCounts.get(t.company) ?? 0) + 1);
    const company = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const firstMentioned = theses[0].episodeDate;
    const lastMentioned = theses[theses.length - 1].episodeDate;
    const isPublic = theses.some((t) => t.isPublic) || !!ticker;

    const market = ticker
      ? await buildMarketData(ticker, firstMentioned, nowIso)
      : null;

    const synthKey = takeSetKey(company, theses);
    let synthesis = synthCache[synthKey];
    if (synthesis) {
      synthHits++;
    } else {
      synthesis = await synthesize(company, theses);
      synthCache[synthKey] = synthesis;
      synthMisses++;
    }

    holdings.push({
      slug: slugFor(ticker, company),
      company,
      ticker,
      isPublic,
      theses: theses.slice().reverse(), // newest first for display
      synthesis,
      netStance: netStance(theses),
      firstMentioned,
      lastMentioned,
      mentionCount: theses.length,
      market: market && market.source !== "none" ? market : null,
    });
  }

  holdings.sort((a, b) => b.lastMentioned.localeCompare(a.lastMentioned));
  fs.writeFileSync(SYNTH_CACHE_FILE, JSON.stringify(synthCache, null, 2) + "\n");
  console.log(`Syntheses: ${synthHits} cached, ${synthMisses} generated.`);

  await ensureCompanyMeta(holdings);

  console.log("Building the Besties index (hosts' bullish public calls vs S&P)…");
  const indexFund = await buildIndexFund(holdings, nowIso, BESTIES);
  console.log("Building the Guesties index (guests' bullish public calls)…");
  const guestiesFund = await buildIndexFund(holdings, nowIso, GUESTS);

  console.log("Building the Bestie leaderboard…");
  const { entries: leaderboard, hostFunds } = await buildLeaderboard(holdings, nowIso);
  console.log("Building the Bear Book…");
  const bearBook = await buildBearBook(holdings);
  console.log("Building the Guesties leaderboard…");
  const guestLeaderboard = await buildGuestLeaderboard(holdings);
  const episodes = buildEpisodeMap(episodeIds);

  const snapshot: IndexSnapshot = {
    generatedAt: nowIso,
    holdings,
    episodesProcessed: episodeIds.length,
    indexFund,
    guestiesFund,
    leaderboard,
    guestLeaderboard,
    hostFunds,
    episodes,
    bearBook,
  };
  // Regression floor: holdings only grow as episodes accrue, so a material drop
  // signals a broken run (partial feed/cache/extraction failure), not real data.
  // Refuse to overwrite a healthy catalog with a gutted one — throwing here aborts
  // the bot's run before it can commit, leaving the last good holdings.json intact.
  const priorCount = (() => {
    try {
      return store.loadIndex()?.holdings?.length ?? 0;
    } catch {
      return 0;
    }
  })();
  if (priorCount >= 20 && holdings.length < priorCount * 0.8) {
    throw new Error(
      `Refusing to write index: holdings dropped ${priorCount} → ${holdings.length} (>20%). ` +
        `That looks like a broken run, not real data — investigate before committing.`,
    );
  }

  store.saveIndex(snapshot);
  console.log(`✓ wrote ${holdings.length} holdings to data/holdings.json`);
  logFund("Besties", indexFund);
  logFund("Guesties", guestiesFund);
  return snapshot;
}

function buildEpisodeMap(
  episodeIds: string[],
): NonNullable<IndexSnapshot["episodes"]> {
  const map: NonNullable<IndexSnapshot["episodes"]> = {};
  for (const id of episodeIds) {
    const ep = store.loadEpisode(id);
    if (ep)
      map[id] = {
        title: ep.title,
        link: ep.link,
        date: ep.date,
        number: ep.number,
        audioUrl: ep.audioUrl ?? null,
      };
  }
  return map;
}

function logFund(name: string, f: IndexFund | null) {
  if (!f) {
    console.log(`✓ ${name}: no tradable bullish calls`);
    return;
  }
  console.log(
    `✓ ${name}: ${f.constituents.length} positions, ` +
      `${(f.portfolioReturn * 100).toFixed(1)}% vs S&P ${(f.benchmarkReturn * 100).toFixed(1)}% ` +
      `(${(f.outperformance * 100).toFixed(1)}pp)`,
  );
}

/**
 * Recompute ONLY the constructed index from the existing holdings.json and write
 * it back — no Claude calls, so it's cheap to iterate on the index methodology.
 */
export async function buildFundOnly(): Promise<void> {
  const snapshot = store.loadIndex();
  if (!snapshot) throw new Error("No data/holdings.json yet — run the pipeline first.");
  const nowIso = new Date().toISOString();
  console.log(`Recomputing indexes from ${snapshot.holdings.length} holdings…`);
  // Re-apply the scoring rules to stored stances (pure math, no Claude).
  for (const h of snapshot.holdings) h.netStance = netStance(h.theses);
  // Fill any missing company profiles (cached — only new names spend tokens).
  await ensureCompanyMeta(snapshot.holdings);
  snapshot.indexFund = await buildIndexFund(snapshot.holdings, nowIso, BESTIES);
  snapshot.guestiesFund = await buildIndexFund(snapshot.holdings, nowIso, GUESTS);
  const lb = await buildLeaderboard(snapshot.holdings, nowIso);
  snapshot.leaderboard = lb.entries;
  snapshot.hostFunds = lb.hostFunds;
  snapshot.episodes = buildEpisodeMap(store.listEpisodeIds());
  snapshot.bearBook = await buildBearBook(snapshot.holdings);
  snapshot.guestLeaderboard = await buildGuestLeaderboard(snapshot.holdings);
  snapshot.generatedAt = nowIso;
  store.saveIndex(snapshot);
  logFund("Besties", snapshot.indexFund);
  logFund("Guesties", snapshot.guestiesFund);
}
