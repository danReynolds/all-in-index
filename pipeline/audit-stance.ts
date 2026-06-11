import fs from "node:fs";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { HOLDINGS_FILE } from "./config";
import type { IndexSnapshot, Thesis } from "../lib/types";

const BESTIES = new Set(["Chamath", "Jason", "Sacks", "Friedberg"]);

const SYSTEM = `You audit the DIRECTION assigned to investment takes extracted from a podcast.

A take's stance must be an ECONOMIC claim about the company:
- bull = the take asserts the company's economic position or value is improving / strong
- bear = deteriorating or at material risk
- mixed = the speaker explicitly argues both sides

The recorded stance is WRONG when it encodes APPROVAL or DISAPPROVAL of conduct
instead of economic direction. The canonical error: "They're pursuing regulatory
capture to lock in monopolistic control" recorded as bear — that is moral
disapproval; as an economic claim, a locked-in monopoly strengthens the company.
Correct label there: neutral (or bull if the speaker frames the lock-in as
succeeding and durable).

KEEP the recorded stance (verdict "keep") unless the summary+quote CLEARLY fail
the economic-direction test. Lean keep — do not re-litigate plausible labels.
Legitimate BEAR inputs include: legal/antitrust threats to a revenue stream,
competitive erosion, demand or brand damage, structural execution failure,
funding/valuation risk. Legitimate BULL inputs include: growth, share gains,
durable competitive advantage, improving economics.

When the stance is wrong, verdict "relabel" with the stance the take's economic
content actually supports — usually "neutral" for pure conduct/governance/policy
disapproval with no determinable economic direction. Judge each independently.`;

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
 * One-shot conservative audit of every take whose stance can move a holding:
 * relabels takes whose recorded direction encodes approval/disapproval rather
 * than an economic claim (the E275 "regulatory capture as bear" class).
 * Dual-writes episode files + holdings.json. Run build-fund afterwards.
 */
export async function auditStance(): Promise<void> {
  const episodeIds = store.listEpisodeIds();
  const candidates: Thesis[] = [];
  for (const id of episodeIds) {
    for (const t of store.loadTheses(id)) {
      if (
        BESTIES.has(t.host) &&
        t.conviction !== "low" &&
        t.attributionConfidence !== "low" &&
        t.stance !== "neutral"
      ) {
        candidates.push(t);
      }
    }
  }
  console.log(`Auditing direction on ${candidates.length} scored directional takes…`);

  const relabels = new Map<string, { from: string; to: string; reason: string; t: Thesis }>();
  for (let i = 0; i < candidates.length; i += 50) {
    const chunk = candidates.slice(i, i + 50);
    const lines = chunk
      .map(
        (t) =>
          `id: ${t.id} | recorded stance: ${t.stance} | ${t.host} on ${t.company}\n  summary: ${t.summary}\n  quote: "${(t.quote || "").slice(0, 200)}"`,
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
    console.log(`  judged ${Math.min(i + 50, candidates.length)}/${candidates.length}`);
  }

  // Apply to per-episode files.
  for (const id of episodeIds) {
    const theses = store.loadTheses(id);
    let changed = false;
    for (const t of theses) {
      const r = relabels.get(t.id);
      if (r) {
        t.stance = r.to as Thesis["stance"];
        changed = true;
      }
    }
    if (changed) store.saveTheses(id, theses);
  }

  // Apply to the embedded copies in holdings.json.
  if (fs.existsSync(HOLDINGS_FILE)) {
    const snapshot: IndexSnapshot = JSON.parse(fs.readFileSync(HOLDINGS_FILE, "utf8"));
    for (const h of snapshot.holdings) {
      for (const t of h.theses) {
        const r = relabels.get(t.id);
        if (r) t.stance = r.to as Thesis["stance"];
      }
    }
    fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  }

  console.log(`\n✓ relabeled ${relabels.size} of ${candidates.length} takes:`);
  for (const [, r] of relabels) {
    console.log(`  ${r.from} → ${r.to}  ${r.t.host} on ${r.t.company} (${r.t.episodeId})`);
    console.log(`      ${r.t.summary.slice(0, 100)}`);
    console.log(`      reason: ${r.reason.slice(0, 110)}`);
  }
  console.log("\nRun build-fund to recompute stances and funds.");
}
