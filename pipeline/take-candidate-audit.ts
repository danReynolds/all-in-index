import { isPortfolioScored } from "../lib/calls";
import { REGULAR_HOSTS } from "../lib/types";
import { store } from "./store";
import type { Host, Thesis, Transcript } from "../lib/types";

type Coverage = "portfolio" | "excluded" | "view" | "low_attribution" | "missing";

interface EntityAlias {
  company: string;
  ticker: string | null;
  aliases: string[];
}

export interface TakeCandidateMatch {
  id: string;
  company: string;
  coverage: Exclude<Coverage, "missing">;
  deltaSec: number | null;
}

export interface TakeCandidate {
  episodeId: string;
  startMs: number;
  speaker: Host;
  kinds: string[];
  text: string;
  entities: string[];
  coverage: Coverage;
  matches: TakeCandidateMatch[];
}

export interface TakeCandidateAuditReport {
  thesisEpisodeCount: number;
  scannedEpisodeIds: string[];
  missingTranscriptEpisodeIds: string[];
  skippedPortfolioReceipts: Array<{
    episodeId: string;
    id: string;
    host: Host;
    company: string;
    coverage: Exclude<Coverage, "missing">;
  }>;
  candidates: TakeCandidate[];
  needsReview: TakeCandidate[];
}

const BESTIE_SET = new Set<Host>(REGULAR_HOSTS);
const MATCH_WINDOW_MS = 180_000;

const HIGH_SIGNAL_PATTERNS: Array<[string, RegExp]> = [
  ["ranked_pick", /\b(?:my|our)\s+(?:number\s*(?:one|1)|#1|top)\s+(?:pick|stock|company|asset|investment|choice)\b/i],
  ["numbered_pick", /\bmy\s+number\s*(?:one|1)\s+is\b/i],
  ["prediction_pick", /\bmy\s+(?:prediction|pick)\s+for\s+(?:20\d{2}|best\s+performing\s+asset)\b/i],
  ["business_winner", /\bbiggest\s+business\s+winner\b/i],
  ["business_loser", /\bbiggest\s+business\s+loser\b/i],
  ["best_asset", /\bbest\s+performing\s+asset\b/i],
  ["explicit_selection", /\bi\s+(?:will|would|'ll|’ll)\s+pick\b/i],
  ["explicit_long_short", /\bi\s+(?:would\s+be\s+|am\s+|'m\s+|’m\s+)?(?:long|short)\b/i],
  ["pair_trade", /\b(?:long|short)\s+[^.?!]{1,80}\s+(?:and|\/)\s+(?:long|short)\b/i],
  ["best_invest", /\bbest\s+(?:place|company|asset|stock|way)\s+to\s+(?:invest|own|play|bet)\b/i],
  ["place_bet", /\bplace(?:d)?\s+a\s+bet\b/i],
  ["short_sp", /\b(?:go\s+)?short\s+(?:the\s+)?s\s*&?\s*p\b/i],
];

const MODERATOR_PROMPT = /\b(?:who\s+do\s+you\s+(?:have|predict)|what\s+(?:do\s+you\s+got|will\s+be|is)\s+the|do\s+you\s+have\s+a\s+prediction|what'?s\s+your\s+prediction|let'?s\s+do\s+our|let'?s\s+let|go\s+ahead)\b/i;
const PERSONAL_PICK = /\b(?:my\s+(?:prediction|pick|number)|i\s+(?:think|will|would|'ll|’ll|am|'m|’m)|i\s+went\s+with|i\s+picked|i\s+placed|i'?m\s+going\s+with)\b/i;
const RECAP_ONLY = /\b(?:last\s+year|in\s+2024|you\s+said|i\s+said|looks\s+like|recap|nailed|was\s+up|was\s+down)\b/i;
const CURRENT_PICK = /\b(?:my\s+(?:prediction|pick)\s+for\s+20\d{2}|my\s+number\s*(?:one|1)|i\s+(?:will|would|'ll|’ll)\s+pick|i\s+would\s+be\s+(?:long|short)|i'?m\s+going\s+with|i\s+think\s+[^.?!]{0,80}\s+(?:will|is\s+going\s+to|are\s+going\s+to)|biggest\s+business\s+(?:winner|loser)\s+of\s+20\d{2}\s+(?:is|are))\b/i;
const NON_INVESTMENT_GAME = /\b(?:founder|entrepreneur|draft|least\s+want\s+to\s+short|movie|box\s+office)\b/i;
const NON_INVESTMENT_CONTEXT = /\b(?:training\s+new\s+associates|startup|roadmap|what\s+would\s+we\s+advise)\b/i;
const READBACK_OF_OTHER_HOST = /\bwhat\s+do\s+you\s+got,\s+chamath\?\s+so\s+let\s+me\s+preface\b/i;
const MODERATOR_HANDOFF = /(?:sacks|sachs|chamath|friedberg|freeberg|jason),?\s+what\s+do\s+you\s+got/i;
const BEST_ASSET_TRANSITION = /best\s+performing\s+asset[.?!]?\s*$/i;
const OWN_BEST_ASSET_PICK = /\b(?:my\s+pick\s+for\s+best\s+performing\s+asset|i\s+think\s+[^.?!]{0,80}\s+(?:is|will\s+be|is\s+going\s+to\s+be)\s+[^.?!]{0,80}best\s+performing\s+asset|best\s+performing\s+asset\s+will\s+be)\b/i;
const BEST_ASSET_RECAP_PROMPT = /\blast\s+year'?s\s+prediction\b.*\bwhat\s+do\s+you\s+got\s+for\s+this\s+year'?s\s+best\s+performing\s+asset\b/i;
const COMMON_TICKER_WORDS = new Set(["ALL", "ARE", "AT", "BE", "BY", "FOR", "HAS", "IT", "NOW", "ON", "SO", "X", "AI"]);
const INVESTMENT_EXPLICIT_KINDS = new Set([
  "business_winner",
  "business_loser",
  "best_asset",
  "best_invest",
  "explicit_long_short",
  "pair_trade",
  "prediction_pick",
  "short_sp",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|corp|corporation|co|ltd|llc|plc|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function addAlias(set: Set<string>, value: string | null | undefined) {
  if (!value) return;
  const alias = normalize(value);
  if (alias.length >= 4 || alias.includes(" ")) set.add(alias);
}

function entityAliases(): EntityAlias[] {
  const byCompany = new Map<string, EntityAlias>();
  for (const episodeId of store.listEpisodeIds()) {
    for (const t of store.loadTheses(episodeId)) {
      const key = normalize(t.company);
      if (!key) continue;
      const entry = byCompany.get(key) ?? {
        company: t.company,
        ticker: t.ticker ?? null,
        aliases: [],
      };
      const aliases = new Set(entry.aliases);
      addAlias(aliases, t.company);
      if (t.ticker && t.ticker.length >= 3 && !COMMON_TICKER_WORDS.has(t.ticker.toUpperCase())) {
        addAlias(aliases, t.ticker);
      }
      entry.aliases = [...aliases];
      entry.ticker ??= t.ticker ?? null;
      byCompany.set(key, entry);
    }
  }

  const manual: Record<string, string[]> = {
    Amazon: ["amazon", "aws"],
    Anthropic: ["anthropic", "claude"],
    Apple: ["apple", "iphone", "siri"],
    Coinbase: ["coinbase"],
    Google: ["google", "alphabet", "gemini", "waymo"],
    Huawei: ["huawei"],
    Meta: ["meta", "facebook", "instagram"],
    Microsoft: ["microsoft", "azure", "github"],
    "Credit Default Swaps": ["cds", "credit default swaps"],
    "Magnificent 7": ["mag 7", "mag seven", "magnificent 7"],
    NVIDIA: ["nvidia", "gpu"],
    OpenAI: ["openai", "open ai"],
    Polymarket: ["polymarket", "prediction markets"],
    "IPO Market": ["ipo", "ipos", "new public companies", "new market cap"],
    "Capital Equipment": ["capital equipment", "accelerated depreciation"],
    "Stablecoins / USD Stablecoin sector": ["stablecoins", "stablecoin usage", "dollar denominated stablecoins"],
    "S&P 500 / US Equities (broad market)": ["s&p", "s p", "sp500", "s&p 500"],
    "Enterprise Application Software (SaaS)": ["software industrial complex", "enterprise saas", "vertical saas"],
    Tesla: ["tesla", "elon", "optimus", "robotaxi", "robo taxi"],
  };
  for (const [company, aliases] of Object.entries(manual)) {
    const key = normalize(company);
    const entry = byCompany.get(key) ?? { company, ticker: null, aliases: [] };
    entry.aliases = [...new Set([...entry.aliases, ...aliases.map(normalize)])];
    byCompany.set(key, entry);
  }

  return [...byCompany.values()].filter((e) => e.aliases.length > 0);
}

function containsAlias(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

function mentionedEntities(text: string, aliases: EntityAlias[]): EntityAlias[] {
  return aliases.filter((entity) => entity.aliases.some((alias) => containsAlias(text, alias)));
}

function candidateKinds(text: string): string[] {
  const kinds = HIGH_SIGNAL_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
  if (kinds.length === 0) return [];
  if (NON_INVESTMENT_GAME.test(text)) return [];
  if (NON_INVESTMENT_CONTEXT.test(text) && !kinds.some((kind) => INVESTMENT_EXPLICIT_KINDS.has(kind))) return [];
  if (READBACK_OF_OTHER_HOST.test(text)) return [];
  if (MODERATOR_HANDOFF.test(text)) return [];
  if (kinds.length === 1 && kinds[0] === "best_asset" && BEST_ASSET_TRANSITION.test(text) && !OWN_BEST_ASSET_PICK.test(text)) return [];
  if (kinds.includes("best_asset") && BEST_ASSET_RECAP_PROMPT.test(text) && !OWN_BEST_ASSET_PICK.test(text)) return [];
  if (MODERATOR_PROMPT.test(text) && !PERSONAL_PICK.test(text)) return [];
  if (RECAP_ONLY.test(text) && !CURRENT_PICK.test(text)) return [];
  return kinds;
}

function sameEntity(t: Thesis, entity: EntityAlias): boolean {
  if (t.ticker && entity.ticker && t.ticker === entity.ticker) return true;
  const thesisName = normalize(t.company);
  return thesisName === normalize(entity.company) || entity.aliases.some((alias) => containsAlias(t.company, alias));
}

function thesisCoverage(t: Thesis): Exclude<Coverage, "missing"> {
  if (t.attributionConfidence === "low") return "low_attribution";
  if (isPortfolioScored(t)) {
    if (t.scoreCondition || t.scoreExclusionReason || !t.ticker || !t.isPublic) return "excluded";
    return "portfolio";
  }
  if (t.scoreCondition || t.scoreExclusionReason) return "excluded";
  return "view";
}

function candidateCoverage(matches: TakeCandidateMatch[]): Coverage {
  if (matches.length === 0) return "missing";
  if (matches.some((m) => m.coverage === "portfolio")) return "portfolio";
  if (matches.some((m) => m.coverage === "excluded")) return "excluded";
  if (matches.some((m) => m.coverage === "view")) return "view";
  return "low_attribution";
}

function findMatches(
  theses: Thesis[],
  speaker: Host,
  startMs: number,
  entities: EntityAlias[],
): TakeCandidateMatch[] {
  const sameHost = theses.filter((t) => t.host === speaker);
  const byEntity = entities.length > 0
    ? sameHost.filter((t) => entities.some((entity) => sameEntity(t, entity)))
    : sameHost;
  return byEntity
    .map((t) => ({
      t,
      deltaMs: t.quoteStartMs == null ? null : t.quoteStartMs - startMs,
    }))
    .filter(({ deltaMs }) => deltaMs == null || Math.abs(deltaMs) <= MATCH_WINDOW_MS)
    .sort((a, b) => Math.abs(a.deltaMs ?? 0) - Math.abs(b.deltaMs ?? 0))
    .slice(0, 3)
    .map(({ t, deltaMs }) => ({
      id: t.id,
      company: t.company,
      coverage: thesisCoverage(t),
      deltaSec: deltaMs == null ? null : Math.round(deltaMs / 1000),
    }));
}

export function auditTranscriptCandidates(episodeId: string, transcript: Transcript): TakeCandidate[] {
  const aliases = entityAliases();
  const theses = store.loadTheses(episodeId);
  const out: TakeCandidate[] = [];

  for (const u of transcript.utterances) {
    if (!BESTIE_SET.has(u.speaker)) continue;
    const kinds = candidateKinds(u.text);
    if (kinds.length === 0) continue;
    const entities = mentionedEntities(u.text, aliases);
    if (
      entities.length === 0 &&
      kinds.every((kind) => ["business_winner", "business_loser", "explicit_selection", "explicit_long_short", "place_bet"].includes(kind))
    ) {
      continue;
    }
    if (kinds.length === 1 && kinds[0] === "place_bet" && /\b(?:do\s+not|don'?t|not)\s+place\s+a\s+bet\b/i.test(u.text)) {
      continue;
    }
    const matches = findMatches(theses, u.speaker, u.startMs, entities);
    out.push({
      episodeId,
      startMs: u.startMs,
      speaker: u.speaker,
      kinds,
      text: u.text,
      entities: entities.map((e) => (e.ticker ? `${e.company} (${e.ticker})` : e.company)),
      matches,
      coverage: candidateCoverage(matches),
    });
  }

  return out;
}

export function auditEpisodeCandidates(episodeId: string): TakeCandidate[] {
  const transcript = store.loadTranscript(episodeId);
  if (!transcript) return [];
  return auditTranscriptCandidates(episodeId, transcript);
}

export function auditAllCandidates(): TakeCandidate[] {
  return buildTakeCandidateAuditReport().candidates;
}

export function buildTakeCandidateAuditReport(): TakeCandidateAuditReport {
  const episodeIds = store.listEpisodeIds().filter((episodeId) => store.loadTheses(episodeId).length > 0).sort();
  const scannedEpisodeIds: string[] = [];
  const missingTranscriptEpisodeIds: string[] = [];
  const skippedPortfolioReceipts: TakeCandidateAuditReport["skippedPortfolioReceipts"] = [];
  const candidates: TakeCandidate[] = [];
  for (const episodeId of episodeIds) {
    const theses = store.loadTheses(episodeId);
    const transcript = store.loadTranscript(episodeId);
    if (!transcript) {
      missingTranscriptEpisodeIds.push(episodeId);
      skippedPortfolioReceipts.push(
        ...theses
          .filter((t) => t.attributionConfidence !== "low" && isPortfolioScored(t))
          .map((t) => ({
            episodeId,
            id: t.id,
            host: t.host,
            company: t.company,
            coverage: thesisCoverage(t),
          })),
      );
      continue;
    }
    scannedEpisodeIds.push(episodeId);
    candidates.push(...auditTranscriptCandidates(episodeId, transcript));
  }
  const needsReview = candidates.filter((c) => c.coverage === "missing" || c.coverage === "view");
  return {
    thesisEpisodeCount: episodeIds.length,
    scannedEpisodeIds,
    missingTranscriptEpisodeIds,
    skippedPortfolioReceipts,
    candidates,
    needsReview,
  };
}

export function runTakeCandidateAudit(): void {
  const showAll = process.argv.includes("--all");
  const report = buildTakeCandidateAuditReport();
  const { candidates, needsReview } = report;
  console.log(`Scanned ${report.scannedEpisodeIds.length}/${report.thesisEpisodeCount} episodes with thesis files and cached transcripts.`);
  if (report.missingTranscriptEpisodeIds.length > 0) {
    console.log(
      `warning: skipped ${report.missingTranscriptEpisodeIds.length} episode(s) without cached transcript.json: ${report.missingTranscriptEpisodeIds.join(", ")}`,
    );
  }
  if (report.skippedPortfolioReceipts.length > 0) {
    console.log(
      `warning: skipped transcripts contain ${report.skippedPortfolioReceipts.length} existing portfolio-scored receipt(s): ${report.skippedPortfolioReceipts
        .slice(0, 12)
        .map((t) => `${t.id}=${t.coverage}`)
        .join("; ")}`,
    );
  }
  console.log(`${candidates.length} high-signal transcript candidates`);
  for (const host of REGULAR_HOSTS) {
    const hostRows = candidates.filter((c) => c.speaker === host);
    const hostReview = needsReview.filter((c) => c.speaker === host);
    console.log(`${host}: ${hostRows.length} candidates, ${hostReview.length} need review`);
  }

  if (showAll) {
    printCandidates("\nAll candidates:", candidates);
  }

  if (needsReview.length === 0) {
    const skippedNote = report.skippedPortfolioReceipts.length > 0
      ? ` ${report.skippedPortfolioReceipts.length} existing portfolio-scored receipt(s) remain transcript-skipped.`
      : "";
    console.log(`\nNo uncovered high-signal candidates in scanned transcripts.${skippedNote}`);
    return;
  }

  printCandidates("\nNeeds review:", needsReview);
}

function printCandidates(label: string, candidates: TakeCandidate[]): void {
  console.log(label);
  for (const c of candidates.slice(0, 120)) {
    const at = `${c.episodeId} ${Math.round(c.startMs / 1000)}s ${c.speaker}`;
    const entities = c.entities.length ? c.entities.join(", ") : "no entity match";
    const matches = c.matches.length
      ? c.matches.map((m) => `${m.id}=${m.coverage}${m.deltaSec == null ? "" : `(${m.deltaSec}s)`}`).join("; ")
      : "none";
    console.log(`\n${at} [${c.kinds.join(", ")}] ${c.coverage}`);
    console.log(`  entities: ${entities}`);
    console.log(`  matches: ${matches}`);
    console.log(`  ${c.text.slice(0, 280)}`);
  }
  if (candidates.length > 120) console.log(`\n... ${candidates.length - 120} more candidate(s) omitted.`);
}

if (process.argv[1]?.endsWith("pipeline/take-candidate-audit.ts")) {
  runTakeCandidateAudit();
}
