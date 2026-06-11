/**
 * Pipeline CLI.
 *
 *   npm run pipeline feed                 list latest episodes from the feed
 *   npm run pipeline market NVDA 2026-05-22   test market data for a ticker
 *   npm run pipeline run --number 274     full slice for one episode (needs keys)
 *   npm run pipeline run --latest         full slice for the latest roundtable
 *   npm run pipeline build-index          aggregate processed episodes -> holdings.json
 */
import { fetchFeed, selectEpisode } from "./rss";
import { buildMarketData } from "./market";
import { fmtMoney } from "../lib/format";

function fmtPct(x: number | null): string {
  if (x == null) return "  n/a ";
  const s = (x * 100).toFixed(1);
  return (x >= 0 ? "+" : "") + s + "%";
}

async function cmdFeed() {
  const eps = await fetchFeed();
  const roundtables = eps.filter((e) => e.kind === "roundtable").length;
  console.log(`${eps.length} episodes (${roundtables} roundtables)\n`);
  for (const e of eps.slice(0, 15)) {
    const dur = e.durationSec ? `${Math.round(e.durationSec / 60)}m` : "?";
    const tag = e.kind === "roundtable" ? "[RT]" : e.kind === "interview" ? "[IV]" : "[SP]";
    console.log(
      `${tag} ${e.id.padEnd(8)} ${e.date.slice(0, 10)} ${dur.padStart(5)}  ${e.title.slice(0, 64)}`,
    );
  }
}

async function cmdMarket(ticker: string, anchor: string) {
  if (!ticker || !anchor) throw new Error("usage: market <TICKER> <YYYY-MM-DD>");
  const asOf = new Date().toISOString();
  const md = await buildMarketData(ticker, anchor, asOf);
  console.log(`\n${ticker}  (source: ${md.source}${md.sourceSymbol ? `, symbol: ${md.sourceSymbol}` : ""}${md.currency ? `, currency: ${md.currency}` : ""})`);
  console.log(`  anchor ${md.anchorDate}  base ${fmtMoney(md.basePrice, md)}`);
  console.log(`  latest ${md.asOf}        ${fmtMoney(md.latestPrice, md)}`);
  console.log(`  returns  1m ${fmtPct(md.returns["1m"])}  3m ${fmtPct(md.returns["3m"])}  6m ${fmtPct(md.returns["6m"])}  1y ${fmtPct(md.returns["1y"])}  since ${fmtPct(md.returns.since)}`);
  console.log(`  history points: ${md.history.length}`);
}

function parseRunArgs(rest: string[]) {
  const opts: { id?: string; number?: number; roundtableOnly?: boolean } = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--latest") opts.roundtableOnly = true;
    else if (a === "--number") opts.number = parseInt(rest[++i], 10);
    else if (a === "--id") opts.id = rest[++i];
    else if (!a.startsWith("--")) opts.id = a;
  }
  return opts;
}

async function cmdRun(rest: string[]) {
  const opts = parseRunArgs(rest);
  const ep = await selectEpisode(opts);
  console.log(`Selected ${ep.id} — ${ep.title}\n`);
  const { runEpisode } = await import("./run-episode");
  await runEpisode(ep);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "feed":
      return cmdFeed();
    case "market":
      return cmdMarket(rest[0], rest[1]);
    case "run":
      return cmdRun(rest);
    case "build-index": {
      const { buildIndex } = await import("./build-index");
      return buildIndex();
    }
    case "quality": {
      const { runQualityCheck } = await import("./quality");
      return runQualityCheck();
    }
    case "build-fund": {
      const { buildFundOnly } = await import("./build-index");
      return buildFundOnly();
    }
    case "reextract": {
      const { reextractAll } = await import("./sync");
      const fs = await import("node:fs");
      const PENDING_FILE = "data/.reextract-pending.json";
      const pendingMode = rest.includes("--pending");
      const onlyIds = pendingMode
        ? (JSON.parse(fs.readFileSync(PENDING_FILE, "utf8")) as string[])
        : undefined;
      if (pendingMode && (!onlyIds || onlyIds.length === 0)) {
        console.log("Nothing pending — all episodes are on the current extraction rules.");
        return;
      }
      const failed = await reextractAll(5, onlyIds);
      // Persist the failure list so a retry only re-pays for what's missing.
      fs.writeFileSync(PENDING_FILE, JSON.stringify(failed, null, 2) + "\n");
      if (pendingMode && failed.length === 0) {
        console.log("All pending episodes re-extracted ✓ — run build-index next.");
      }
      return;
    }
    case "rename": {
      const { renameAll } = await import("./sync");
      return renameAll();
    }
    case "snap-timestamps": {
      const { snapQuoteTimestamps } = await import("./run-episode");
      const { store } = await import("./store");
      const fsMod = await import("node:fs");
      let snapped = 0;
      const verdictMap = new Map<string, number | null>();
      for (const id of store.listEpisodeIds()) {
        const tr = store.loadTranscript(id);
        if (!tr) continue;
        const theses = store.loadTheses(id);
        const before = theses.map((t) => t.quoteStartMs);
        snapQuoteTimestamps(theses, tr);
        theses.forEach((t, i) => {
          if (t.quoteStartMs !== before[i]) {
            snapped++;
            verdictMap.set(t.id, t.quoteStartMs ?? null);
          }
        });
        store.saveTheses(id, theses);
      }
      // patch holdings.json copies by id
      const HF = "data/holdings.json";
      if (fsMod.existsSync(HF)) {
        const snap = JSON.parse(fsMod.readFileSync(HF, "utf8"));
        for (const h of snap.holdings)
          for (const t of h.theses)
            if (verdictMap.has(t.id)) t.quoteStartMs = verdictMap.get(t.id);
        fsMod.writeFileSync(HF, JSON.stringify(snap, null, 2) + "\n");
      }
      console.log(`snapped ${snapped} quote timestamps to their matched utterances.`);
      return;
    }
    case "amend-positional": {
      const { amendPositional } = await import("./positional");
      return amendPositional();
    }
    case "purge-commentary": {
      const { purgeCommentary } = await import("./purge");
      return purgeCommentary();
    }
    case "sync": {
      const { sync } = await import("./sync");
      const limitIdx = rest.indexOf("--limit");
      const limit = limitIdx >= 0 ? parseInt(rest[limitIdx + 1], 10) : undefined;
      const concIdx = rest.indexOf("--concurrency");
      const concurrency = concIdx >= 0 ? parseInt(rest[concIdx + 1], 10) : undefined;
      const roundtableOnly = !rest.includes("--include-interviews");
      const includeOlder = rest.includes("--include-older");
      return sync({ limit, roundtableOnly, concurrency, includeOlder });
    }
    default:
      console.log(
        "commands:\n" +
          "  feed                                  list latest episodes\n" +
          "  market <TICKER> <YYYY-MM-DD>          test market data\n" +
          "  run [--latest|--number N|--id E274]   process one episode end-to-end\n" +
          "  sync [--limit N] [--include-interviews]  process new episodes + rebuild index\n" +
          "  build-index                           re-aggregate processed episodes\n" +
          "  quality                               validate generated data invariants",
      );
  }
}

main().catch((err) => {
  console.error("\n✖", err.message ?? err);
  process.exit(1);
});
