import { currentStanceForHosts, isCallShaped, isPortfolioScored } from "../lib/calls";
import { MAX_PUBLISHED_QUOTE_CHARS } from "../lib/quotes";
import { store } from "./store";
import type { Host, IndexFund, IndexSnapshot, Thesis } from "../lib/types";

const BESTIES: Host[] = ["Chamath", "Jason", "Sacks", "Friedberg"];
const GUESTS: Host[] = ["Guest"];
const KNOWN_DELISTED_TICKERS = new Set(["X"]);

export interface QualityResult {
  errors: string[];
  warnings: string[];
}

function validateFund(
  snapshot: IndexSnapshot,
  fund: IndexFund | null | undefined,
  label: string,
  hosts: Host[],
  errors: string[],
) {
  if (!fund) return;
  const bySlug = new Map(snapshot.holdings.map((h) => [h.slug, h]));
  for (const c of fund.constituents) {
    const holding = bySlug.get(c.slug);
    if (!holding) {
      errors.push(`${label}: constituent ${c.slug} is not present in holdings`);
      continue;
    }
    const stance = currentStanceForHosts(holding.theses, hosts);
    if (stance !== "bull") {
      errors.push(`${label}: ${holding.company} (${c.ticker}) is ${stance}, not current bull`);
    }
  }
}

function validateDuplicateQuotes(snapshot: IndexSnapshot, errors: string[]) {
  const byQuote = new Map<string, Array<{ company: string; thesis: Thesis }>>();
  for (const h of snapshot.holdings) {
    for (const t of h.theses) {
      if (!t.quote) continue;
      // Explicit calls may legitimately share one quote — a host naming several
      // stocks in one breath ("25% in memory: SK Hynix 5×, Samsung 6×, Micron
      // 7×") is N real positions, not lazy reuse. Reuse is only a smell for
      // views/enumerations (which the build's list-mention filter already drops).
      if (t.callType && t.callType !== "view") continue;
      const key = t.quote.slice(0, 60).toLowerCase();
      const rows = byQuote.get(key) ?? [];
      rows.push({ company: h.company, thesis: t });
      byQuote.set(key, rows);
    }
  }
  for (const [quote, rows] of byQuote) {
    const companies = new Set(rows.map((row) => row.company));
    if (companies.size > 1) {
      const intentionalSharedCall = rows.every((row) => isCallShaped(row.thesis) && row.thesis.scoreNote);
      if (intentionalSharedCall) continue;
      errors.push(`quote reused across companies (${[...companies].join(", ")}): ${quote}`);
    }
  }
}

function validateQuoteLengths(snapshot: IndexSnapshot, errors: string[]) {
  for (const h of snapshot.holdings) {
    for (const t of h.theses) {
      if (t.quote.length > MAX_PUBLISHED_QUOTE_CHARS) {
        errors.push(`${t.id} quote is ${t.quote.length} chars, above ${MAX_PUBLISHED_QUOTE_CHARS}`);
      }
    }
  }
}

function validateMarketCoverage(snapshot: IndexSnapshot, errors: string[], warnings: string[]) {
  for (const h of snapshot.holdings) {
    if (!h.ticker || h.market) continue;
    if (KNOWN_DELISTED_TICKERS.has(h.ticker)) {
      warnings.push(`${h.company} (${h.ticker}) has no live market data because the ticker is delisted`);
    } else {
      errors.push(`${h.company} (${h.ticker}) is public but has no market data`);
    }
  }
}

function validateLowAttribution(snapshot: IndexSnapshot, warnings: string[]) {
  const low = snapshot.holdings.reduce(
    (n, h) => n + h.theses.filter((t) => t.attributionConfidence === "low").length,
    0,
  );
  if (low > 0) warnings.push(`${low} takes have low attribution confidence and should remain unscored`);
}

function validateHostFundTaxonomy(snapshot: IndexSnapshot, errors: string[]) {
  for (const [host, fund] of Object.entries(snapshot.hostFunds ?? {})) {
    if (!fund) continue;
    for (const c of fund.constituents) {
      if (!c.direction) errors.push(`${host} host fund: ${c.ticker} is missing exposure direction`);
      if (!c.callTypes || c.callTypes.length === 0) {
        errors.push(`${host} host fund: ${c.ticker} is missing scored-call taxonomy`);
      }
    }
  }
}

function validateScoredTakeTaxonomy(snapshot: IndexSnapshot, errors: string[]) {
  for (const h of snapshot.holdings) {
    for (const t of h.theses) {
      const topicSet = new Set(t.topics.map((topic) => topic.toLowerCase()));
      const isPublicTopPick =
        t.attributionConfidence !== "low" &&
        t.isPublic &&
        t.ticker &&
        t.host !== "Guest" &&
        t.host !== "Unknown" &&
        topicSet.has("top pick");
      if (isPublicTopPick && !isPortfolioScored(t)) {
        errors.push(`${t.id} is a public top-pick receipt but is not portfolio-scored`);
      }
      const isBestieBestPerformingAsset =
        t.attributionConfidence !== "low" &&
        t.host !== "Guest" &&
        t.host !== "Unknown" &&
        topicSet.has("best performing asset");
      if (isBestieBestPerformingAsset && !isPortfolioScored(t)) {
        errors.push(`${t.id} is a best-performing-asset pick but is not portfolio-scored`);
      }
      // No cross-field taxonomy invariants are needed anymore: callType is the
      // single scoring gate, trade direction is derived from callType + stance,
      // and structural tradability is computed from the ticker — there are no
      // longer redundant fields to police against each other here.
    }
  }
}

export function validateIndexSnapshot(snapshot: IndexSnapshot): QualityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  validateFund(snapshot, snapshot.indexFund, "Besties Index", BESTIES, errors);
  validateFund(snapshot, snapshot.guestiesFund, "Guesties Index", GUESTS, errors);
  validateScoredTakeTaxonomy(snapshot, errors);
  validateHostFundTaxonomy(snapshot, errors);
  validateDuplicateQuotes(snapshot, errors);
  validateQuoteLengths(snapshot, errors);
  validateMarketCoverage(snapshot, errors, warnings);
  validateLowAttribution(snapshot, warnings);
  return { errors, warnings };
}

export async function runQualityCheck(): Promise<void> {
  const snapshot = store.loadIndex();
  if (!snapshot) throw new Error("No data/holdings.json found. Run build-index first.");
  const result = validateIndexSnapshot(snapshot);
  for (const warning of result.warnings) console.log(`warning: ${warning}`);
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`error: ${error}`);
    throw new Error(`quality check failed with ${result.errors.length} error(s)`);
  }
  console.log(
    `quality ok: ${snapshot.holdings.length} holdings, ${snapshot.indexFund?.constituents.length ?? 0} Besties constituents`,
  );
}

if (process.argv[1]?.endsWith("pipeline/quality.ts")) {
  runQualityCheck().catch((err) => {
    console.error("\n✖", err.message ?? err);
    process.exit(1);
  });
}
