import { fetchFeed } from "./rss";
import { dedupeOverlappingTheses, processEpisode, repairQuoteOwnership, stampAttribution, snapQuoteTimestamps } from "./run-episode";
import { extractTheses, extractArgs, mapExtraction } from "./extract";
import { verifyArgs, applyVerdicts } from "./verify";
import { callToolBatch } from "./llm";
import { nameSpeakers } from "./speakers";
import { buildIndex } from "./build-index";
import { rescorePredictions } from "./extract-predictions";
import { extractAssets } from "./extract-assets";
import { nameGuests } from "./name-guests";
import { upgradeQuotes } from "./upgrade-quotes";
import { store } from "./store";
import type { Episode, Thesis } from "../lib/types";

/**
 * Re-run the (title-primed) speaker-naming pass across all cached episodes.
 * Episodes whose cluster→host mapping changed get their theses re-extracted;
 * unchanged episodes just get attribution-confidence stamps refreshed on their
 * existing theses. No AssemblyAI cost; one small + maybe one large Claude call
 * per episode.
 */
export async function renameAll(concurrency = 5, onlyIds?: string[]): Promise<void> {
  const only = onlyIds && onlyIds.length ? new Set(onlyIds) : null;
  const ids = store.listEpisodeIds().filter((id) => !only || only.has(id));
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
          const theses = dedupeOverlappingTheses(
            stampAttribution(
              snapQuoteTimestamps(repairQuoteOwnership(await extractTheses(ep, tr), tr), tr),
              tr,
            ),
          );
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
        const theses = dedupeOverlappingTheses(
          stampAttribution(
            snapQuoteTimestamps(repairQuoteOwnership(await extractTheses(ep, tr), tr), tr),
            tr,
          ),
        );
        // Guard: a transient empty extraction must never WIPE an episode that
        // previously had takes — treat it as a failure to retry, not a save.
        const prior = store.loadTheses(id).length;
        if (theses.length === 0 && prior > 0) {
          console.error(`[${id}] FAILED: extraction returned 0 takes but episode had ${prior} — not overwriting.`);
          failed.push(id);
          continue;
        }
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
      : // reextract only runs the COMPANY extractor; commodity takes and guest
        // names live in separate passes that get overwritten here. Run the full
        // sequence or they silently vanish from the site (empty Guesties
        // leaderboard, missing commodity holdings).
        "✓ re-extraction complete — now run: extract-assets → name-guests → build-index.",
  );
  return failed;
}

/**
 * Batch-API re-extraction: identical model/prompts/post-processing as
 * reextractAll, but the two LLM passes run through the Message Batches API (50%
 * cheaper, processed async). Phase 1 submits every episode's extract call as one
 * batch; phase 2 submits every episode's verify call as a second batch (verify
 * depends on phase-1 output); then the deterministic chain (repair → snap →
 * stamp → dedupe) runs locally per episode, exactly as the sync path does.
 * Returns the ids that failed (extract error/empty), retryable via --pending.
 */
export async function reextractAllBatched(onlyIds?: string[]): Promise<string[]> {
  const all = store.listEpisodeIds();
  const ids = (onlyIds ? all.filter((id) => onlyIds.includes(id)) : all).filter(
    (id) => store.loadEpisode(id) && store.loadTranscript(id),
  );
  console.log(`Re-extracting ${ids.length} episodes via Message Batches (50% cost, async)…`);
  const failed: string[] = [];

  // Phase 1 — extract (one batched request per episode).
  const extractResults = await callToolBatch(
    ids.map((id) => ({ customId: id, args: extractArgs(store.loadEpisode(id)!, store.loadTranscript(id)!) })),
    { label: "extract" },
  );
  const raw = new Map<string, Thesis[]>();
  for (const id of ids) {
    const r = extractResults.get(id);
    if (r?.ok) raw.set(id, mapExtraction(store.loadEpisode(id)!, r.value));
    else {
      console.error(`[${id}] extract failed: ${r && !r.ok ? r.error : "no result"}`);
      failed.push(id);
    }
  }

  // Phase 2 — verify (skip episodes that extracted nothing).
  const verifyItems = [...raw.entries()].flatMap(([id, theses]) => {
    const args = verifyArgs(store.loadEpisode(id)!, theses, store.loadTranscript(id)!);
    return args ? [{ customId: id, args }] : [];
  });
  const verifyResults = await callToolBatch(verifyItems, { label: "verify" });

  // Phase 3 — apply verdicts + deterministic chain + save, per episode.
  let saved = 0;
  for (const [id, rawTheses] of raw) {
    const tr = store.loadTranscript(id)!;
    let verified = rawTheses;
    const vr = verifyResults.get(id);
    if (vr?.ok) verified = applyVerdicts(rawTheses, tr, vr.value.verdicts);
    else if (verifyItems.some((v) => v.customId === id)) {
      console.warn(`  ⚠ verify failed for ${id} (${vr && !vr.ok ? vr.error : "no result"}) — keeping ${rawTheses.length} unverified`);
    }
    const theses = dedupeOverlappingTheses(
      stampAttribution(snapQuoteTimestamps(repairQuoteOwnership(verified, tr), tr), tr),
    );
    // Same guard as the sync path: never let a transient empty pass wipe takes.
    const prior = store.loadTheses(id).length;
    if (theses.length === 0 && prior > 0) {
      console.error(`[${id}] FAILED: 0 takes but episode had ${prior} — not overwriting.`);
      failed.push(id);
      continue;
    }
    store.saveTheses(id, theses);
    saved++;
  }
  console.log(
    `✓ batch re-extraction complete — saved ${saved}, ${failed.length} failed. ` +
      `Now run: extract-assets → name-guests → build-index.`,
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
  /**
   * Also process feed episodes OLDER than the newest one already processed.
   * Off by default: the libsyn feed carries the back catalog, so without this
   * guard every scheduled run would quietly backfill two old episodes.
   * Pass --include-older for a deliberate backfill.
   */
  includeOlder?: boolean;
}

/**
 * Process any episodes in the feed that haven't been processed yet (newest
 * first), with bounded concurrency, then rebuild the index once. This is what
 * the scheduled GitHub Action calls — so the site updates automatically when a
 * new episode drops, and backfills run in parallel.
 */
/**
 * Re-price the predictions scorecard in the same pass that refreshes the index,
 * so /predictions can't silently age while holdings stay fresh. This is the
 * cheap deterministic rescore (no LLM, no re-extraction — the picks don't
 * change, only their prices). Non-fatal: a predictions hiccup must never wedge
 * the primary holdings refresh + deploy, and the stale-price guard still covers
 * the index itself. (A brand-new annual predictions episode still needs a manual
 * `extract-predictions`; this only keeps existing picks marked-to-market.)
 */
async function refreshPredictions(): Promise<void> {
  try {
    await rescorePredictions();
  } catch (e) {
    console.warn(`⚠ predictions rescore skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function sync(opts: SyncOpts = {}): Promise<void> {
  const limit = opts.limit ?? 2;
  const roundtableOnly = opts.roundtableOnly ?? true;
  const concurrency = Math.max(1, opts.concurrency ?? 5);

  const eps = await fetchFeed();
  const pool = roundtableOnly ? eps.filter((e) => e.kind === "roundtable") : eps;
  const processed = new Set(store.listEpisodeIds());

  // Forward-only by default: only episodes newer than the newest processed.
  let dateFloor = "";
  if (!opts.includeOlder) {
    for (const id of processed) {
      const ep = store.loadEpisode(id);
      if (ep && ep.date > dateFloor) dateFloor = ep.date;
    }
  }

  const skippedOlder = pool.filter((e) => !processed.has(e.id) && e.date <= dateFloor).length;
  const todo = pool
    .filter((e) => !processed.has(e.id) && e.date > dateFloor)
    .slice(0, limit);

  if (todo.length === 0) {
    if (skippedOlder > 0) {
      console.log(
        `${skippedOlder} older unprocessed episode(s) in the feed — skipped (forward-only; use --include-older to backfill).`,
      );
    }
    console.log("Index is up to date — no new episodes. Rebuilding to refresh market data…");
    await buildIndex();
    await refreshPredictions();
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

  // processEpisode only runs the COMPANY extractor. Commodity takes
  // (extract-assets) and guest attribution (name-guests) live in separate
  // catalog passes — and building straight after, like this used to, ships a new
  // episode's guest takes UNNAMED, which the Guesties validator rejects ("has no
  // current open long call" — the #29 failure that wedged the cron). Run both for
  // the just-processed episodes, scoped to `ok` so each sync only re-LLMs the new
  // ones, not the whole back catalog.
  if (ok.length) {
    console.log("\nextract-assets (commodity takes) for new episodes…");
    await extractAssets(ok);
    console.log("name-guests (guest attribution) for new episodes…");
    await nameGuests(ok);
    // Upgrade messy/stitched quotes on scored picks to a clean verbatim line
    // BEFORE building — else the verbatim fail-safe silently demotes a real pick
    // (e.g. a ranked #2) out of scoring for a quote the LLM smoothed.
    console.log("upgrade-quotes (rescue scored picks with messy quotes) for new episodes…");
    await upgradeQuotes(ok);
  }

  console.log("\nbuilding index…");
  await buildIndex();
  await refreshPredictions();
  console.log("✓ backfill complete.");
}
