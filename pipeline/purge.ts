import fs from "node:fs";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { HOLDINGS_FILE } from "./config";
import type { IndexSnapshot, Thesis } from "../lib/types";

const SYSTEM = `You audit an investing site's extracted podcast takes and flag ones that should never have been emitted.

Flag remove=true ONLY when a take is PURELY consumer/product experience with NO claim about the company as an investment:
- thanking a company for a gift, perk, or swag ("thanks for sending me the gold card")
- product shout-outs, plugs, or personal usage anecdotes ("I love my Model S")
- praise of an event, app experience, or customer service

Keep (remove=false) anything with a genuine investment angle, however thin: valuation, growth, competitive position, market share, ownership intent, business trajectory.
Example to REMOVE: "Chamath thanked Robinhood for sending him their gold card" — gratitude for swag.
Example to KEEP: "Jason argues Robinhood's product velocity is winning consumer brokerage" — product point in service of a competitive claim.

Lean remove=false when unsure. Judge each take independently.`;

const Schema = z.object({
  takes: z.array(z.object({ id: z.string(), remove: z.boolean() })),
});

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    takes: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, remove: { type: "boolean" } },
        required: ["id", "remove"],
      },
    },
  },
  required: ["takes"],
};

/**
 * Surgical cleanup: find pure product-praise takes that slipped through
 * extraction and delete them — from the per-episode files AND the embedded
 * copies in holdings.json (counts and date ranges repaired; empty holdings
 * dropped). Run build-fund afterwards to recompute stances and funds.
 */
export async function purgeCommentary(): Promise<void> {
  const episodeIds = store.listEpisodeIds();
  const all: Thesis[] = [];
  for (const id of episodeIds) all.push(...store.loadTheses(id));
  console.log(`Judging ${all.length} takes for product-praise leakage…`);

  const removeIds = new Set<string>();
  const removed: string[] = [];
  for (let i = 0; i < all.length; i += 60) {
    const chunk = all.slice(i, i + 60);
    const lines = chunk
      .map(
        (t) =>
          `id: ${t.id} | ${t.host} | ${t.stance}/${t.conviction} | ${t.company}\n  summary: ${t.summary}\n  quote: "${(t.quote || "").slice(0, 180)}"`,
      )
      .join("\n");
    const result = await callTool({
      system: SYSTEM,
      user: `Takes:\n\n${lines}`,
      toolName: "submit_audit",
      toolDescription: "Submit remove=true/false for every take id.",
      inputSchema: INPUT_SCHEMA,
      validate: Schema,
      maxTokens: 8192,
    });
    for (const v of result.takes) {
      if (v.remove) {
        removeIds.add(v.id);
        const t = chunk.find((x) => x.id === v.id);
        if (t) removed.push(`${t.host} on ${t.company} (${t.stance}): ${t.summary.slice(0, 70)}`);
      }
    }
    console.log(`  judged ${Math.min(i + 60, all.length)}/${all.length}`);
  }

  // Delete from per-episode files.
  for (const id of episodeIds) {
    const theses = store.loadTheses(id);
    const kept = theses.filter((t) => !removeIds.has(t.id));
    if (kept.length !== theses.length) store.saveTheses(id, kept);
  }

  // Patch holdings.json: drop takes, repair counts/dates, drop empty holdings.
  if (fs.existsSync(HOLDINGS_FILE)) {
    const snapshot: IndexSnapshot = JSON.parse(fs.readFileSync(HOLDINGS_FILE, "utf8"));
    snapshot.holdings = snapshot.holdings
      .map((h) => {
        const theses = h.theses.filter((t) => !removeIds.has(t.id));
        if (theses.length === h.theses.length) return h;
        const dates = theses.map((t) => t.episodeDate).sort();
        return {
          ...h,
          theses,
          mentionCount: theses.length,
          firstMentioned: dates[0] ?? h.firstMentioned,
          lastMentioned: dates[dates.length - 1] ?? h.lastMentioned,
        };
      })
      .filter((h) => h.theses.length > 0);
    fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  }

  console.log(`\n✓ removed ${removeIds.size} product-praise take(s):`);
  removed.forEach((r) => console.log(`  ✗ ${r}`));
  console.log("\nRun build-fund to recompute stances and funds.");
}
