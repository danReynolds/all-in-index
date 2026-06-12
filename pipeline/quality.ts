import { currentStanceForHosts } from "../lib/calls";
import { MAX_PUBLISHED_QUOTE_CHARS } from "../lib/quotes";
import { store } from "./store";
import type { Host, IndexFund, IndexSnapshot } from "../lib/types";

const BESTIES: Host[] = ["Chamath", "Jason", "Sacks", "Friedberg"];
const GUESTS: Host[] = ["Guest"];
const KNOWN_DELISTED_TICKERS = new Set(["X"]);
const DIRECTIONAL_CALL_TYPES = new Set(["explicit_long", "explicit_short", "selection", "pair_trade", "basket"]);

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
  const byQuote = new Map<string, Set<string>>();
  for (const h of snapshot.holdings) {
    for (const t of h.theses) {
      if (!t.quote) continue;
      const key = t.quote.slice(0, 60).toLowerCase();
      const companies = byQuote.get(key) ?? new Set<string>();
      companies.add(h.company);
      byQuote.set(key, companies);
    }
  }
  for (const [quote, companies] of byQuote) {
    if (companies.size > 1) {
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
      if (t.scoreCondition && t.positional) {
        errors.push(`${t.id} has scoreCondition but is still positional`);
      }
      if (t.scoreCondition && t.scoreExclusionReason !== "conditional") {
        errors.push(`${t.id} has scoreCondition but is not marked scoreExclusionReason=conditional`);
      }
      if (!t.positional) continue;
      if (!t.callType) {
        errors.push(`${t.id} is positional but missing callType`);
        continue;
      }
      if (DIRECTIONAL_CALL_TYPES.has(t.callType) && !t.tradeDirection) {
        errors.push(`${t.id} is ${t.callType} but missing tradeDirection`);
      }
      if (t.callType === "explicit_long" && t.tradeDirection !== "long") {
        errors.push(`${t.id} explicit_long must use tradeDirection=long`);
      }
      if (t.callType === "explicit_short" && t.tradeDirection !== "short") {
        errors.push(`${t.id} explicit_short must use tradeDirection=short`);
      }
      if (t.callType === "explicit_exit" && t.tradeDirection != null) {
        errors.push(`${t.id} explicit_exit must not open a tradeDirection`);
      }
      if (t.callType === "pair_trade" && !t.pairTradeId) {
        errors.push(`${t.id} pair_trade is missing pairTradeId`);
      }
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
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
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
