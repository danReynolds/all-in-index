import { store } from "./store";
import { transcribeEpisode } from "./transcribe";
import { nameSpeakers } from "./speakers";
import { extractTheses } from "./extract";
import { buildIndex } from "./build-index";
import type { Episode, Thesis, Transcript } from "../lib/types";

const normText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Snap each quote's timestamp to the words themselves, so "Listen · 1:19:01"
 * lands on the quote. The extractor's quoteStartSec comes from line prefixes
 * and can drift a minute or two; the utterance START isn't good enough either —
 * on this show an utterance is a whole monologue turn, and the quoted sentence
 * sits a median 21s (p95: 2min+) into it. So find the containing utterance and
 * interpolate by word offset across its duration.
 */
export function snapQuoteTimestamps(theses: Thesis[], t: Transcript): Thesis[] {
  for (const th of theses) {
    if (!th.quote) continue;
    const key = normText(th.quote).slice(0, 28);
    if (key.length < 12) continue;
    const hit =
      t.utterances.find((u) => u.speaker === th.host && normText(u.text).includes(key)) ??
      t.utterances.find((u) => normText(u.text).includes(key));
    if (!hit) continue;
    const nu = normText(hit.text);
    const idx = nu.indexOf(key);
    const wordsBefore = idx > 0 ? nu.slice(0, idx).split(" ").filter(Boolean).length : 0;
    const totalWords = nu.split(" ").filter(Boolean).length || 1;
    const durMs = Math.max(0, (hit.endMs ?? hit.startMs) - hit.startMs);
    const est = Math.round(hit.startMs + (durMs * wordsBefore) / totalWords);
    if (th.quoteStartMs == null || Math.abs(est - th.quoteStartMs) > 3_000) {
      th.quoteStartMs = est;
    }
  }
  return theses;
}

/**
 * Stamp each thesis with the naming pass's confidence for the cluster it came
 * from: locate the utterance at the quote timestamp (fall back to the host's
 * best-confidence cluster) and inherit that cluster's confidence.
 */
export function stampAttribution(theses: Thesis[], t: Transcript): Thesis[] {
  const conf = t.speakerConfidence ?? {};
  const rank = { low: 0, medium: 1, high: 2 } as const;
  for (const th of theses) {
    let cluster: string | null = null;
    if (th.quoteStartMs != null) {
      const u =
        t.utterances.find(
          (u) => th.quoteStartMs! >= u.startMs && th.quoteStartMs! < u.endMs,
        ) ??
        t.utterances.find((u) => u.startMs >= th.quoteStartMs!) ??
        null;
      if (u && u.speaker === th.host) cluster = u.cluster;
    }
    if (!cluster) {
      // Best-confidence cluster mapped to this host.
      const candidates = Object.entries(t.speakerMap).filter(([, h]) => h === th.host);
      candidates.sort((a, b) => (rank[conf[b[0]] ?? "high"] ?? 2) - (rank[conf[a[0]] ?? "high"] ?? 2));
      cluster = candidates[0]?.[0] ?? null;
    }
    th.attributionConfidence = cluster ? (conf[cluster] ?? "high") : "low";
  }
  return theses;
}

/**
 * Process one episode: transcribe → name speakers → extract theses, saving
 * each artifact. Does NOT rebuild the index (the caller does that once after a
 * batch). The transcript (the expensive AssemblyAI step) is cached on disk, so
 * re-running to iterate on prompts costs nothing extra.
 *
 * Returns the number of theses extracted.
 */
export async function processEpisode(ep: Episode): Promise<number> {
  const tag = ep.id;
  store.saveEpisode(ep);

  let transcript = store.loadTranscript(ep.id);
  if (transcript && transcript.utterances.length) {
    console.log(`[${tag}] cached transcript — skipping AssemblyAI`);
  } else {
    console.log(`[${tag}] transcribing…`);
    transcript = await transcribeEpisode(ep);
    store.saveTranscript(transcript);
  }

  await nameSpeakers(transcript, ep);
  store.saveTranscript(transcript);

  const theses = snapQuoteTimestamps(stampAttribution(await extractTheses(ep, transcript), transcript), transcript);
  store.saveTheses(ep.id, theses);
  console.log(`[${tag}] done — ${theses.length} theses`);
  return theses.length;
}

/** Process one episode end-to-end and rebuild the index (single-episode CLI path). */
export async function runEpisode(ep: Episode): Promise<void> {
  console.log(`Processing ${ep.id} — ${ep.title}\n`);
  await processEpisode(ep);
  console.log("\nbuilding index…");
  await buildIndex();
  console.log(`\n✓ ${ep.id} complete — run \`npm run dev\` to view the site.`);
}
