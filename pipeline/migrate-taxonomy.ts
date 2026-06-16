/**
 * One-time migration: collapse the old 7-field scoring taxonomy
 * (positional, callType, tradeDirection, pairTradeId, scoreReason,
 * scoreCondition, scoreExclusionReason) into the new 3-field model
 * (callType, excludeReason, scoreNote) across every stored theses.json and the
 * embedded copies in holdings.json.
 *
 * SAFETY: for every take we compute its OLD isPortfolioScored + trade direction
 * with the pre-refactor logic (inlined below) and its NEW values with the
 * shipped lib/calls.ts, and assert they are identical. If ANY take's scoring
 * decision would change, we write nothing and print the offenders — the whole
 * point of the restructure is to preserve the takes exactly.
 *
 *   npx tsx pipeline/migrate-taxonomy.ts          # verify only (dry run)
 *   npx tsx pipeline/migrate-taxonomy.ts --write  # verify, then write
 */
import fs from "node:fs";
import { store } from "./store";
import { HOLDINGS_FILE } from "./config";
import { isPortfolioScored, tradeDirectionForTake } from "../lib/calls";
import type { CallType, ExcludeReason, IndexSnapshot, Thesis, TradeDirection } from "../lib/types";

/** A stored take as it exists on disk today, before migration. */
type LegacyThesis = Thesis & {
  positional?: boolean;
  tradeDirection?: TradeDirection | null;
  pairTradeId?: string | null;
  scoreReason?: string | null;
  scoreCondition?: string | null;
  scoreExclusionReason?: string | null;
};

const SCOREABLE = new Set<CallType>([
  "explicit_long",
  "explicit_short",
  "explicit_exit",
  "selection",
  "pair_trade",
  "basket",
]);
const JUDGMENT_EXCLUSIONS = new Set<ExcludeReason>([
  "conditional",
  "not_investment_call",
  "day_trade_aside",
]);

// --- the pre-refactor scoring logic, inlined verbatim so we can diff against it ---
function oldIsScored(t: LegacyThesis): boolean {
  return t.positional === true || (t.callType != null && SCOREABLE.has(t.callType));
}
function oldDirection(t: LegacyThesis): TradeDirection | null {
  if (!oldIsScored(t)) return null;
  if (t.tradeDirection === "long" || t.tradeDirection === "short") return t.tradeDirection;
  if (t.callType === "explicit_short") return "short";
  if (t.callType === "explicit_exit") return null;
  if (t.callType === "explicit_long" || t.callType === "selection" || t.callType === "basket") {
    return t.stance === "bull" ? "long" : null;
  }
  if (t.callType === "pair_trade") {
    if (t.stance === "bull") return "long";
    if (t.stance === "bear") return "short";
  }
  return t.stance === "bull" ? "long" : null;
}

interface Mismatch {
  id: string;
  field: "scored" | "direction";
  old: unknown;
  next: unknown;
}

function migrateTake(t: LegacyThesis, mismatches: Mismatch[]): Thesis {
  const oldScored = oldIsScored(t);
  const oldDir = oldDirection(t);

  // callType: the single gate. A non-scored take is a view; a scored take keeps
  // its existing scoreable shape, else we reconstruct the shape from direction.
  let callType: CallType;
  if (!oldScored) {
    callType = "view";
  } else if (t.callType && SCOREABLE.has(t.callType)) {
    callType = t.callType;
  } else if (oldDir === "short") {
    callType = "explicit_short";
  } else if (oldDir === "long") {
    callType = "explicit_long";
  } else {
    callType = "explicit_exit"; // scored but opens no direction
  }

  // excludeReason: judgment-only, and only on non-scored takes (a scored take is
  // by definition not excluded). Structural exclusions are dropped — derived now.
  let excludeReason: ExcludeReason | null = null;
  if (!oldScored) {
    const ser = t.scoreExclusionReason as ExcludeReason | undefined | null;
    if (ser && JUDGMENT_EXCLUSIONS.has(ser)) excludeReason = ser;
    else if (t.scoreCondition) excludeReason = "conditional";
  }

  const scoreNote = t.scoreCondition || t.scoreReason || null;

  const next: LegacyThesis = { ...t, callType, excludeReason, scoreNote };
  delete next.positional;
  delete next.tradeDirection;
  delete next.pairTradeId;
  delete next.scoreReason;
  delete next.scoreCondition;
  delete next.scoreExclusionReason;
  const clean = next as Thesis;

  // The contract: scoring behavior must be unchanged.
  const newScored = isPortfolioScored(clean);
  const newDir = tradeDirectionForTake(clean);
  if (newScored !== oldScored) mismatches.push({ id: t.id, field: "scored", old: oldScored, next: newScored });
  if (newDir !== oldDir) mismatches.push({ id: t.id, field: "direction", old: oldDir, next: newDir });

  return clean;
}

function main() {
  const write = process.argv.includes("--write");
  const mismatches: Mismatch[] = [];
  let takes = 0;
  let scored = 0;
  const callTypeCounts: Record<string, number> = {};
  const excludeCounts: Record<string, number> = {};

  // Migrate each per-episode file (in memory first).
  const episodeIds = store.listEpisodeIds();
  const migratedByEpisode = new Map<string, Thesis[]>();
  for (const id of episodeIds) {
    const theses = store.loadTheses(id) as unknown as LegacyThesis[];
    const migrated = theses.map((t) => {
      const m = migrateTake(t, mismatches);
      takes++;
      if (isPortfolioScored(m)) scored++;
      callTypeCounts[m.callType ?? "view"] = (callTypeCounts[m.callType ?? "view"] ?? 0) + 1;
      if (m.excludeReason) excludeCounts[m.excludeReason] = (excludeCounts[m.excludeReason] ?? 0) + 1;
      return m;
    });
    migratedByEpisode.set(id, migrated);
  }

  console.log(`Scanned ${takes} takes across ${episodeIds.length} episodes.`);
  console.log(`  scored calls: ${scored}  (${takes - scored} views)`);
  console.log(`  callType: ${JSON.stringify(callTypeCounts)}`);
  console.log(`  excludeReason: ${Object.keys(excludeCounts).length ? JSON.stringify(excludeCounts) : "none"}`);

  if (mismatches.length) {
    console.error(`\n✖ ${mismatches.length} takes would change scoring behavior — NOT writing:`);
    for (const m of mismatches.slice(0, 40)) {
      console.error(`  ${m.id}  ${m.field}: ${JSON.stringify(m.old)} → ${JSON.stringify(m.next)}`);
    }
    process.exit(1);
  }
  console.log("\n✓ every take's isPortfolioScored + tradeDirection is unchanged.");

  if (!write) {
    console.log("\nDry run. Re-run with --write to apply.");
    return;
  }

  for (const [id, migrated] of migratedByEpisode) store.saveTheses(id, migrated);

  // Migrate the embedded copies in holdings.json the same way.
  if (fs.existsSync(HOLDINGS_FILE)) {
    const snapshot: IndexSnapshot = JSON.parse(fs.readFileSync(HOLDINGS_FILE, "utf8"));
    const sink: Mismatch[] = [];
    for (const h of snapshot.holdings) {
      h.theses = (h.theses as unknown as LegacyThesis[]).map((t) => migrateTake(t, sink));
    }
    if (sink.length) {
      console.error(`✖ holdings.json had ${sink.length} mismatches — aborting before write.`);
      process.exit(1);
    }
    fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  }

  console.log("✓ wrote per-episode files + holdings.json.");
}

main();
