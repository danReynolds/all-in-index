import { store } from "./store";
import { transcribeEpisode } from "./transcribe";
import { nameSpeakers } from "./speakers";
import { extractTheses } from "./extract";
import { buildIndex } from "./build-index";
import { ASSETS, CRYPTO } from "../lib/assets";
import { sectorProxyInfo } from "../lib/proxies";
import type { Episode, Thesis, Transcript } from "../lib/types";

const SCOREABLE_CALL_TYPES = new Set<Thesis["callType"]>([
  "explicit_long",
  "explicit_short",
  "explicit_exit",
  "selection",
  "pair_trade",
  "basket",
]);

const normText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function quoteFragments(quote: string): string[] {
  const parts = quote
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map(normText)
    .filter((frag) => frag.length >= 12);
  return parts.length ? parts : [normText(quote)].filter((frag) => frag.length >= 12);
}

function words(s: string): string[] {
  return normText(s).split(" ").filter(Boolean);
}

function hasWordsInOrder(hay: string, needle: string): boolean {
  const hayWords = words(hay);
  const needleWords = words(needle);
  if (needleWords.length < 5) return false;
  let pos = 0;
  for (const word of needleWords) {
    const idx = hayWords.indexOf(word, pos);
    if (idx === -1) return false;
    pos = idx + 1;
  }
  return true;
}

function quoteMatches(text: string, quote: string): boolean {
  const hay = normText(text);
  const fragments = quoteFragments(quote);
  if (!fragments.length) return false;
  return fragments.every((frag) => hay.includes(frag) || hasWordsInOrder(text, frag));
}

function findQuoteUtterance(
  t: Transcript,
  quote: string,
  speaker?: Thesis["host"] | null,
): Transcript["utterances"][number] | null {
  const utterances = speaker ? t.utterances.filter((u) => u.speaker === speaker) : t.utterances;
  const exact = utterances.find((u) => quoteMatches(u.text, quote));
  if (exact) return exact;

  for (let i = 0; i < t.utterances.length; i++) {
    const first = t.utterances[i];
    if (speaker && first.speaker !== speaker) continue;
    let text = "";
    for (let j = i; j < Math.min(t.utterances.length, i + 3); j++) {
      const next = t.utterances[j];
      if (next.speaker !== first.speaker) break;
      text = `${text} ${next.text}`;
      if (quoteMatches(text, quote)) return first;
    }
  }
  return null;
}

function quoteOffsetMs(utterance: Transcript["utterances"][number], quote: string): number {
  const fragments = quoteFragments(quote);
  const nu = normText(utterance.text);
  const firstHit = fragments
    .map((frag) => nu.indexOf(frag))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const wordsBefore = firstHit > 0 ? nu.slice(0, firstHit).split(" ").filter(Boolean).length : 0;
  const totalWords = nu.split(" ").filter(Boolean).length || 1;
  const durMs = Math.max(0, (utterance.endMs ?? utterance.startMs) - utterance.startMs);
  return Math.round(utterance.startMs + (durMs * wordsBefore) / totalWords);
}

function rewriteHostInId(id: string, from: string, to: string): string {
  return id.includes(`-${from}-`) ? id.replace(`-${from}-`, `-${to}-`) : id;
}

function normEntity(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(?:basket|sector|macro|asset|commodit(?:y|ies)|stocks?|etfs?|general)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const CANONICAL_ASSET_PROXY = new Map(ASSETS.map((a) => [normEntity(a.name), a.proxy.toUpperCase()]));

/**
 * The ETF/ticker a row is effectively priced on: its own ticker, the sector
 * proxy the LLM chose, or the commodity/crypto proxy its name resolves to. Lets
 * dedup see that "Oil" and a "hydrocarbons … basket" are the same exposure even
 * though their names normalize differently — the entity-key bug that let one
 * commodity short survive as two scored rows.
 */
function effectiveProxyTicker(t: Thesis): string | null {
  if (t.ticker) return t.ticker.toUpperCase();
  if (t.sectorProxy) return sectorProxyInfo(t.sectorProxy)?.ticker ?? null;
  const e = normEntity(t.company);
  const tokens = new Set(e.split(" "));
  for (const a of [...ASSETS, ...CRYPTO]) {
    const name = normEntity(a.name);
    if (e === name || tokens.has(name) || a.keywords.some((k) => e.includes(normEntity(k)))) {
      return a.proxy.toUpperCase();
    }
  }
  return null;
}

function sameExposure(a: Thesis, b: Thesis): boolean {
  if (normEntity(a.company) === normEntity(b.company)) return true;
  const pa = effectiveProxyTicker(a);
  return pa != null && pa === effectiveProxyTicker(b);
}

function opposedStance(a: Thesis["stance"], b: Thesis["stance"]): boolean {
  return (a === "bull" && b === "bear") || (a === "bear" && b === "bull");
}

function overlapsSameCall(a: Thesis, b: Thesis): boolean {
  if (a.episodeId !== b.episodeId || a.host !== b.host) return false;
  if (!sameExposure(a, b)) return false;
  // Two directionally-opposite remarks are distinct calls, never a duplicate.
  if (opposedStance(a.stance, b.stance)) return false;
  if (a.quoteStartMs != null && b.quoteStartMs != null && Math.abs(a.quoteStartMs - b.quoteStartMs) <= 5_000) {
    return true;
  }
  return quoteMatches(a.quote, b.quote) || quoteMatches(b.quote, a.quote);
}

function thesisRank(t: Thesis): number {
  const canonicalProxy = CANONICAL_ASSET_PROXY.get(normEntity(t.company));
  return (
    (t.ticker ? 100 : 0) +
    (canonicalProxy && t.ticker?.toUpperCase() === canonicalProxy ? 60 : 0) +
    (t.attributionConfidence === "high" ? 30 : t.attributionConfidence === "medium" ? 15 : 0) +
    (SCOREABLE_CALL_TYPES.has(t.callType) ? 10 : 0) +
    (t.scoreNote ? 3 : 0) +
    Math.min(t.quote.length / 1000, 1)
  );
}

export function dedupeOverlappingTheses(theses: Thesis[]): Thesis[] {
  const kept: Thesis[] = [];
  for (const t of theses) {
    const idx = kept.findIndex((existing) => overlapsSameCall(existing, t));
    if (idx === -1) {
      kept.push(t);
      continue;
    }
    if (thesisRank(t) > thesisRank(kept[idx])) {
      kept[idx] = t;
    }
  }
  return kept;
}

/**
 * Mechanical quote-ownership repair. The LLM is instructed to attribute by the
 * transcript line prefix, but moderator handoffs sometimes tempt it to assign
 * the next speaker's words to the addressed host. If the supporting quote does
 * not appear in the attributed host's own lines but does appear in another
 * resolved speaker's line, move the take to the quote owner before scoring.
 */
export function repairQuoteOwnership(theses: Thesis[], t: Transcript): Thesis[] {
  for (const th of theses) {
    if (!th.quote) continue;
    const sameHost = findQuoteUtterance(t, th.quote, th.host);
    if (sameHost) continue;
    const owner = findQuoteUtterance(t, th.quote);
    if (!owner || owner.speaker === "Unknown" || owner.speaker === th.host) continue;
    const oldHost = th.host;
    th.host = owner.speaker;
    th.id = rewriteHostInId(th.id, oldHost, owner.speaker);
  }
  return theses;
}

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
    const hit =
      findQuoteUtterance(t, th.quote, th.host) ??
      findQuoteUtterance(t, th.quote);
    if (!hit) continue;
    const est = quoteOffsetMs(hit, th.quote);
    const currentSpeaker = th.quoteStartMs == null
      ? null
      : t.utterances.find((u) => th.quoteStartMs! >= u.startMs && th.quoteStartMs! < u.endMs)?.speaker ?? null;
    if (th.quoteStartMs == null || Math.abs(est - th.quoteStartMs) > 3_000 || currentSpeaker !== th.host) {
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
      else if (u && u.speaker !== th.host) {
        const owner = findQuoteUtterance(t, th.quote, th.host);
        if (owner) cluster = owner.cluster;
        else {
          th.attributionConfidence = "low";
          continue;
        }
      }
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

  const theses = dedupeOverlappingTheses(
    stampAttribution(
      snapQuoteTimestamps(repairQuoteOwnership(await extractTheses(ep, transcript), transcript), transcript),
      transcript,
    ),
  );
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
