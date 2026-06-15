import fs from "node:fs";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { HOLDINGS_FILE } from "./config";
import { isMacroAsset } from "../lib/assets";
import type { IndexSnapshot, Thesis } from "../lib/types";

const SYSTEM = `You audit the DIRECTION assigned to COMMODITY / macro takes (gold,
oil, copper, lithium, uranium, silver, natural gas) extracted from a podcast.

A commodity take's stance must be an EXPLICIT directional claim about the
COMMODITY'S PRICE or value:
- bull = the speaker explicitly says the price will / should rise, that it's a
  good store of value, or that they personally own / are buying it as a bet.
- bear = explicitly says the price will / should fall (including a supply glut
  they tie to lower prices), or that something will displace it as a store of value.
- mixed = explicitly argues both directions.

The recorded stance is WRONG (verdict "relabel", almost always to "neutral")
when the take is any of these — none is a price claim:
- IMPORTANCE / STRATEGIC framing: "X is a critical mineral", "we need all energy
  sources", "the US should build a strategic reserve of copper".
- SUPPLY / ABUNDANCE facts: "the US has the largest lithium deposits", "gold is
  abundant on the moon". Abundance implies MORE supply, never a bull price claim.
- POLICY / geopolitics commentary with no stated price direction.
- A PASSING MENTION in a list: "aluminum, silicon, palladium, gold, everything
  you need".
- DEMAND / usage description with no view on where the price goes.

Direction is NEVER inferred. "Lithium is a strategic opportunity" or "copper is
critical to the supply chain" is NEUTRAL, not bull. A genuine bull needs
something like "I'm long gold", "gold keeps climbing", "buy it here". A genuine
bear needs something like "more supply will push prices down" or "Bitcoin will
displace gold".

KEEP the recorded stance unless the summary+quote CLEARLY fail this test. Lean
keep on plausible price claims; only relabel clear importance/supply/policy/list
commentary. Judge each take independently.`;

const Schema = z.object({
  takes: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(["keep", "relabel"]),
      newStance: z.enum(["bull", "bear", "neutral", "mixed"]).nullable(),
      reason: z.string(),
    }),
  ),
});

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    takes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["keep", "relabel"] },
          newStance: { type: ["string", "null"], enum: ["bull", "bear", "neutral", "mixed", null] },
          reason: { type: "string", description: "Short justification" },
        },
        required: ["id", "verdict", "newStance", "reason"],
      },
    },
  },
  required: ["takes"],
};

/**
 * Audits the stance on every directional take attached to a macro/commodity
 * holding (all hosts, all convictions) against a price-claim rubric — catching
 * the `extract-assets` over-tagging where importance/supply/policy framing was
 * recorded as a bull call. Dual-writes episode files + holdings.json; run
 * build-fund afterwards.
 */
export async function auditCommodityStance(): Promise<void> {
  if (!fs.existsSync(HOLDINGS_FILE)) throw new Error("No holdings.json — run build-index first.");
  const snapshot: IndexSnapshot = JSON.parse(fs.readFileSync(HOLDINGS_FILE, "utf8"));

  const candidates: Array<Thesis & { _company: string }> = [];
  for (const h of snapshot.holdings) {
    if (!isMacroAsset(h.ticker)) continue;
    for (const t of h.theses) {
      if (
        (t.stance === "bull" || t.stance === "bear" || t.stance === "mixed") &&
        t.attributionConfidence !== "low"
      ) {
        candidates.push({ ...t, _company: h.company });
      }
    }
  }
  console.log(`Auditing ${candidates.length} directional takes across macro/commodity holdings…`);

  const relabels = new Map<string, { from: string; to: string; reason: string; t: Thesis & { _company: string } }>();
  for (let i = 0; i < candidates.length; i += 40) {
    const chunk = candidates.slice(i, i + 40);
    const lines = chunk
      .map(
        (t) =>
          `id: ${t.id} | recorded stance: ${t.stance} | ${t.host} on ${t._company}\n  summary: ${t.summary}\n  quote: "${(t.quote || "").slice(0, 220)}"`,
      )
      .join("\n");
    const result = await callTool({
      system: SYSTEM,
      user: `Takes:\n\n${lines}`,
      toolName: "submit_audit",
      toolDescription: "Submit keep/relabel for every take id.",
      inputSchema: INPUT_SCHEMA,
      validate: Schema,
      maxTokens: 8192,
    });
    for (const v of result.takes) {
      const t = chunk.find((x) => x.id === v.id);
      if (!t || v.verdict !== "relabel" || !v.newStance || v.newStance === t.stance) continue;
      relabels.set(v.id, { from: t.stance, to: v.newStance, reason: v.reason, t });
    }
    console.log(`  judged ${Math.min(i + 40, candidates.length)}/${candidates.length}`);
  }

  // Apply to per-episode files (group relabels by episode).
  const byEpisode = new Map<string, Set<string>>();
  for (const [id, r] of relabels) {
    const set = byEpisode.get(r.t.episodeId) ?? new Set();
    set.add(id);
    byEpisode.set(r.t.episodeId, set);
  }
  for (const epId of byEpisode.keys()) {
    const theses = store.loadTheses(epId);
    let changed = false;
    for (const t of theses) {
      const r = relabels.get(t.id);
      if (r) {
        t.stance = r.to as Thesis["stance"];
        t.scoreReason = r.reason;
        changed = true;
      }
    }
    if (changed) store.saveTheses(epId, theses);
  }

  // Apply to the embedded copies in holdings.json.
  for (const h of snapshot.holdings) {
    for (const t of h.theses) {
      const r = relabels.get(t.id);
      if (r) {
        t.stance = r.to as Thesis["stance"];
        t.scoreReason = r.reason;
      }
    }
  }
  fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(snapshot, null, 2) + "\n");

  console.log(`\n✓ relabeled ${relabels.size} of ${candidates.length} commodity takes:`);
  for (const [, r] of relabels) {
    console.log(`  ${r.from} → ${r.to}  ${r.t.host} on ${r.t._company} (${r.t.episodeId})`);
    console.log(`      ${r.t.summary.slice(0, 100)}`);
    console.log(`      reason: ${r.reason.slice(0, 120)}`);
  }
  console.log("\nRun build-fund to recompute stances and funds.");
}
