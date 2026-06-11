/**
 * Generates data/sample/holdings.json: a clearly-labelled illustrative fixture
 * so the site renders before any API keys are configured.
 *
 * Market data is REAL (fetched from Yahoo, anchored at the E274 air date).
 * Theses are illustrative placeholders — NOT real quotes or positions — and the
 * site shows a prominent banner saying so. Run the real pipeline to replace it.
 */
import fs from "node:fs";
import path from "node:path";
import { buildMarketData } from "./market";
import type { Holding, IndexSnapshot, Stance, Thesis } from "../lib/types";

const ANCHOR = "2026-05-22T00:00:00.000Z"; // E274 air date
const EP = { id: "E274", number: 274 };

type Seed = {
  company: string;
  ticker: string | null;
  isPublic: boolean;
  netStance: Stance;
  synthesis: string;
  theses: Array<Pick<Thesis, "host" | "stance" | "conviction" | "summary" | "topics">>;
};

const SEEDS: Seed[] = [
  {
    company: "Nvidia",
    ticker: "NVDA",
    isPublic: true,
    netStance: "bull",
    synthesis:
      "[SAMPLE] Illustrative synthesis only. The real pipeline writes a sourced, cross-host summary here derived from the actual episode discussion.",
    theses: [
      { host: "Chamath", stance: "bull", conviction: "high", summary: "[Sample] Illustrative bullish position on data-center demand.", topics: ["AI capex", "data center"] },
      { host: "Sacks", stance: "neutral", conviction: "medium", summary: "[Sample] Illustrative balanced take on valuation vs. growth.", topics: ["valuation"] },
      { host: "Friedberg", stance: "bull", conviction: "medium", summary: "[Sample] Illustrative view on compute scaling.", topics: ["compute", "scaling"] },
    ],
  },
  {
    company: "Tesla",
    ticker: "TSLA",
    isPublic: true,
    netStance: "mixed",
    synthesis: "[SAMPLE] Illustrative synthesis only — replace via the pipeline.",
    theses: [
      { host: "Chamath", stance: "bull", conviction: "medium", summary: "[Sample] Illustrative bull case on autonomy optionality.", topics: ["autonomy"] },
      { host: "Sacks", stance: "bear", conviction: "low", summary: "[Sample] Illustrative skeptical note on multiple.", topics: ["valuation"] },
    ],
  },
  {
    company: "AMD",
    ticker: "AMD",
    isPublic: true,
    netStance: "bull",
    synthesis: "[SAMPLE] Illustrative synthesis only — replace via the pipeline.",
    theses: [
      { host: "Jason", stance: "bull", conviction: "medium", summary: "[Sample] Illustrative bull case on the #2 accelerator.", topics: ["AI capex", "competition"] },
    ],
  },
  {
    company: "SpaceX",
    ticker: null,
    isPublic: false,
    netStance: "bull",
    synthesis: "[SAMPLE] Illustrative synthesis only. Private company — performance tracked via reported valuation marks once available.",
    theses: [
      { host: "Chamath", stance: "bull", conviction: "high", summary: "[Sample] Illustrative view on Starlink cash flow and the $2T case.", topics: ["Starlink", "valuation"] },
      { host: "Jason", stance: "bull", conviction: "high", summary: "[Sample] Illustrative view on launch dominance.", topics: ["launch"] },
      { host: "Friedberg", stance: "bull", conviction: "medium", summary: "[Sample] Illustrative view on Starship economics.", topics: ["Starship"] },
    ],
  },
  {
    company: "OpenAI",
    ticker: null,
    isPublic: false,
    netStance: "mixed",
    synthesis: "[SAMPLE] Illustrative synthesis only. Private company.",
    theses: [
      { host: "Sacks", stance: "mixed", conviction: "medium", summary: "[Sample] Illustrative take on the cost structure and competitive moat.", topics: ["moat", "spend"] },
      { host: "Friedberg", stance: "bull", conviction: "medium", summary: "[Sample] Illustrative view on product velocity.", topics: ["product"] },
    ],
  },
];

async function main() {
  const nowIso = new Date().toISOString();
  const holdings: Holding[] = [];

  for (const seed of SEEDS) {
    const theses: Thesis[] = seed.theses.map((t, i) => ({
      id: `${EP.id}-${(seed.ticker ?? seed.company).toLowerCase()}-${t.host}-${i}`,
      episodeId: EP.id,
      episodeNumber: EP.number,
      episodeDate: ANCHOR,
      company: seed.company,
      ticker: seed.ticker,
      isPublic: seed.isPublic,
      host: t.host,
      stance: t.stance,
      conviction: t.conviction,
      summary: t.summary,
      quote: "", // intentionally blank in sample — no fabricated quotes
      quoteStartMs: null,
      topics: t.topics,
      isSample: true,
    }));

    const market = seed.ticker
      ? await buildMarketData(seed.ticker, ANCHOR, nowIso)
      : null;
    if (market) console.log(`  ${seed.ticker}: since ${(market.returns.since! * 100).toFixed(1)}%`);

    holdings.push({
      slug: seed.ticker ? seed.ticker.toLowerCase() : seed.company.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      company: seed.company,
      ticker: seed.ticker,
      isPublic: seed.isPublic,
      theses,
      synthesis: seed.synthesis,
      netStance: seed.netStance,
      firstMentioned: ANCHOR,
      lastMentioned: ANCHOR,
      mentionCount: theses.length,
      market: market && market.source !== "none" ? market : null,
      isSample: true,
    });
  }

  const snapshot: IndexSnapshot = {
    generatedAt: nowIso,
    holdings,
    episodesProcessed: 1,
  };

  const out = path.join(process.cwd(), "data", "sample", "holdings.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`✓ wrote ${holdings.length} sample holdings to data/sample/holdings.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
