import { fetchFeed } from "./rss";
import { processEpisode, stampAttribution, snapQuoteTimestamps } from "./run-episode";
import { extractTheses } from "./extract";
import { nameSpeakers } from "./speakers";
import { buildIndex } from "./build-index";
import { store } from "./store";
import type { Episode } from "../lib/types";

/**
 * Re-run the (title-primed) speaker-naming pass across all cached episodes.
 * Episodes whose cluster→host mapping changed get their theses re-extracted;
 * unchanged episodes just get attribution-confidence stamps refreshed on their
 * existing theses. No AssemblyAI cost; one small + maybe one large Claude call
 * per episode.
 */
export async function renameAll(concurrency = 5): Promise<void> {
  const ids = store.listEpisodeIds();
  console.log(`Re-naming speakers for ${ids.length} episodes…`);
  const changed: string[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const ep = store.loadEpisode(id);
      const tr = store.loadTranscript(id);
      if (!ep || !tr) continue;
      const before = JSON.stringify(tr.speakerMap);
      try {
        await nameSpeakers(tr, ep);
      } catch (e) {
        console.error(`[${id}] naming FAILED: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      store.saveTranscript(tr);
      if (JSON.stringify(tr.speakerMap) !== before) {
        console.log(`[${id}] mapping CHANGED ${before} -> ${JSON.stringify(tr.speakerMap)}`);
        changed.push(id);
      } else {
        const theses = store.loadTheses(id);
        store.saveTheses(id, stampAttribution(theses, tr));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));

  console.log(`\n${changed.length} episode(s) changed mapping: ${changed.join(", ") || "none"}`);
  if (changed.length) {
    console.log("Re-extracting changed episodes…");
    let c2 = 0;
    async function reworker() {
      while (c2 < changed.length) {
        const id = changed[c2++];
        const ep = store.loadEpisode(id)!;
        const tr = store.loadTranscript(id)!;
        try {
          const theses = snapQuoteTimestamps(stampAttribution(await extractTheses(ep, tr), tr), tr);
          store.saveTheses(id, theses);
        } catch (e) {
          console.error(`[${id}] re-extract FAILED: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, changed.length) }, reworker));
  }
  console.log("✓ rename complete — now run build-index (or build-fund if mappings were unchanged).");
}

/**
 * Re-run thesis extraction on all already-transcribed episodes (uses cached
 * transcripts + existing speaker labels — no AssemblyAI cost). Use after
 * changing the extraction prompt. Does NOT rebuild the index; run build-index
 * after.
 */
export async function reextractAll(
  concurrency = 5,
  onlyIds?: string[],
): Promise<string[]> {
  const all = store.listEpisodeIds();
  const ids = onlyIds ? all.filter((id) => onlyIds.includes(id)) : all;
  console.log(`Re-extracting theses for ${ids.length} episodes (concurrency ${concurrency})…`);
  const failed: string[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const ep = store.loadEpisode(id);
      const tr = store.loadTranscript(id);
      if (!ep || !tr) {
        console.log(`[${id}] skipped (missing episode/transcript)`);
        continue;
      }
      try {
        const theses = snapQuoteTimestamps(stampAttribution(await extractTheses(ep, tr), tr), tr);
        store.saveTheses(id, theses);
      } catch (e) {
        console.error(`[${id}] FAILED: ${e instanceof Error ? e.message : e}`);
        failed.push(id);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  console.log(
    failed.length
      ? `✗ ${failed.length} episode(s) failed — retry with \`reextract --pending\` after fixing the cause.`
      : "✓ re-extraction complete — now run build-index.",
  );
  return failed;
}

export interface SyncOpts {
  /** Max number of new episodes to process this run. */
  limit?: number;
  /** Only process roundtable episodes (the four-host shows). */
  roundtableOnly?: boolean;
  /** How many episodes to transcribe/extract concurrently. */
  concurrency?: number;
}

/**
 * Process any episodes in the feed that haven't been processed yet (newest
 * first), with bounded concurrency, then rebuild the index once. This is what
 * the scheduled GitHub Action calls — so the site updates automatically when a
 * new episode drops, and backfills run in parallel.
 */
export async function sync(opts: SyncOpts = {}): Promise<void> {
  const limit = opts.limit ?? 2;
  const roundtableOnly = opts.roundtableOnly ?? true;
  const concurrency = Math.max(1, opts.concurrency ?? 5);

  const eps = await fetchFeed();
  const pool = roundtableOnly ? eps.filter((e) => e.kind === "roundtable") : eps;
  const processed = new Set(store.listEpisodeIds());
  const todo = pool.filter((e) => !processed.has(e.id)).slice(0, limit);

  if (todo.length === 0) {
    console.log("Index is up to date — no new episodes. Rebuilding to refresh market data…");
    await buildIndex();
    return;
  }

  console.log(
    `Processing ${todo.length} new episode(s) with concurrency ${concurrency}:\n` +
      todo.map((e) => `  ${e.id}  ${e.title.slice(0, 60)}`).join("\n") +
      "\n",
  );

  const ok: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  let cursor = 0;

  async function worker() {
    while (cursor < todo.length) {
      const ep: Episode = todo[cursor++];
      try {
        await processEpisode(ep);
        ok.push(ep.id);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`[${ep.id}] FAILED: ${error}`);
        failed.push({ id: ep.id, error });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, todo.length) }, worker),
  );

  console.log(`\nProcessed ${ok.length} ok, ${failed.length} failed.`);
  if (failed.length) {
    for (const f of failed) console.log(`  ✖ ${f.id}: ${f.error}`);
  }

  console.log("\nbuilding index…");
  await buildIndex();
  console.log("✓ backfill complete.");
}
