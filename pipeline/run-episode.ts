import { store } from "./store";
import { transcribeEpisode } from "./transcribe";
import { nameSpeakers } from "./speakers";
import { extractTheses } from "./extract";
import { buildIndex } from "./build-index";
import { ASSETS, CRYPTO } from "../lib/assets";
import { sectorProxyInfo } from "../lib/proxies";
import { isQuoteVerbatim, normForMatch } from "../lib/quotes";
import { isPortfolioScored } from "../lib/calls";
import type { Episode, Host, Thesis, Transcript } from "../lib/types";

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
  // Same episode, same host, same exposure, same direction → one call, however
  // far apart the two mentions sit. Restating "I'm long OpenAI" 30 minutes later
  // is the same position, not a second one; keep the stronger-ranked row.
  return true;
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
const HANDOFF_HOSTS = ["Chamath", "Jason", "Sacks", "Friedberg"] as const;

/**
 * If an utterance OPENS by handing the floor to another host — "What do you got,
 * Chamath?" / "Chamath, what's your pick?" — and the diarizer merged that handoff
 * into the answer, the words that follow belong to the addressed host, not the
 * one the line is labeled. Returns that host, but only when the handoff is right
 * at the start, so normal mid-discussion cross-talk ("Jason, I disagree…") never
 * triggers it. Mechanical transcript repair, not a judgment.
 */
function handoffTarget(text: string, currentSpeaker: string): Host | null {
  const head = normForMatch(text.slice(0, 64));
  const lead = "(?:ok |okay |all right |alright |and |so |um |well )*";
  for (const h of HANDOFF_HOSTS) {
    if (h === currentSpeaker) continue;
    const n = h.toLowerCase();
    const addressed = new RegExp(`^${lead}${n} (?:what|whats|who|whos|how|your|you|give|go|tell|take|the floor)`);
    const handedTo = new RegExp(`^${lead}(?:what do you got|what is your|whats your|who is your|whos your|how about|go ahead|over to you|your (?:pick|turn|prediction)|the floor (?:is yours|goes to)) ${n}\\b`);
    if (addressed.test(head) || handedTo.test(head)) return h;
  }
  return null;
}

export function repairQuoteOwnership(theses: Thesis[], t: Transcript): Thesis[] {
  for (const th of theses) {
    if (!th.quote) continue;
    const sameHost = findQuoteUtterance(t, th.quote, th.host);
    if (sameHost) {
      // The quote is in the attributed host's lines — but if that utterance
      // opens by handing off to another host, the diarizer merged the handoff
      // into the answer; the take belongs to the addressed host.
      const tgt = handoffTarget(sameHost.text, th.host);
      if (tgt && tgt !== th.host) {
        const oldHost = th.host;
        th.host = tgt;
        th.id = rewriteHostInId(th.id, oldHost, tgt);
      }
      continue;
    }
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
 * Scoring fail-safe: a take must never score on a quote that isn't a faithful
 * verbatim excerpt of the transcript. After the LLM passes (verify, upgrade-
 * quotes) have had their chance to repair, any still-non-verbatim quote on a
 * scoreable take is demoted to low attribution confidence so it drops out of
 * the index/leaderboard. Views (never scored) are left untouched.
 */
export function enforceVerbatimQuotes(theses: Thesis[], t: Transcript): Thesis[] {
  const full = t.utterances.map((u) => u.text).join(" ");
  for (const th of theses) {
    if (!th.quote || !isPortfolioScored(th)) continue;
    if (!isQuoteVerbatim(th.quote, full)) th.attributionConfidence = "low";
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
export async function processEpisode(
  ep: Episode,
  opts: { retranscribe?: boolean; speakersExpected?: number } = {},
): Promise<number> {
  const tag = ep.id;
  store.saveEpisode(ep);

  let transcript = store.loadTranscript(ep.id);
  // `--retranscribe` forces a fresh AssemblyAI pass — used to repair a bad
  // diarization (e.g. a guest fused into a host's cluster) with a finer
  // `--speakers` hint, rather than reusing the merged transcript.
  if (!opts.retranscribe && transcript && transcript.utterances.length) {
    console.log(`[${tag}] cached transcript — skipping AssemblyAI`);
  } else {
    console.log(`[${tag}] transcribing…${opts.speakersExpected ? ` (speakers≈${opts.speakersExpected})` : ""}`);
    transcript = await transcribeEpisode(ep, { speakersExpected: opts.speakersExpected });
    store.saveTranscript(transcript);
  }

  await nameSpeakers(transcript, ep);
  store.saveTranscript(transcript);

  const theses = dedupeOverlappingTheses(
    enforceVerbatimQuotes(
      stampAttribution(
        snapQuoteTimestamps(repairQuoteOwnership(await extractTheses(ep, transcript), transcript), transcript),
        transcript,
      ),
      transcript,
    ),
  );
  store.saveTheses(ep.id, theses);
  console.log(`[${tag}] done — ${theses.length} theses`);
  return theses.length;
}

/** Process one episode end-to-end and rebuild the index (single-episode CLI path). */
export async function runEpisode(
  ep: Episode,
  opts: { retranscribe?: boolean; speakersExpected?: number } = {},
): Promise<void> {
  console.log(`Processing ${ep.id} — ${ep.title}\n`);
  await processEpisode(ep, opts);
  console.log("\nbuilding index…");
  await buildIndex();
  console.log(`\n✓ ${ep.id} complete — run \`npm run dev\` to view the site.`);
}
