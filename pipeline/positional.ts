import fs from "node:fs";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { HOLDINGS_FILE } from "./config";
import type { IndexSnapshot, Thesis } from "../lib/types";

const SYSTEM = `You classify podcast investment takes as POSITION CALLS or commentary.

positional = true ONLY when the statement clearly communicates whether the speaker would be IN or OUT of the stock right now — an expressed or unmistakably implied portfolio action or ownership stance:
- in: "I'd own it here", "I bought more", "this is the trade", "I'm long", "I'd be buying this dip"
- out: "I'd take profits", "I wouldn't touch it", "this is a short", "I'm out", "stay away"

positional = false for views WITHOUT ownership intent, however strong or detailed:
- praise of products, execution, or leadership ("Jensen is a genius", "best positioned in AI")
- criticism of strategy, innovation, or culture ("they've stopped innovating") — criticizing a company you might still hold is commentary, not an exit
- valuation musings, competitive analysis, growth observations without an in/out signal

Lean false when unsure — only clear in/out signals count. Judge each take independently.`;

const Schema = z.object({
  takes: z.array(z.object({ id: z.string(), positional: z.boolean() })),
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
          positional: { type: "boolean" },
        },
        required: ["id", "positional"],
      },
    },
  },
  required: ["takes"],
};

/**
 * One-time amendment: judge every existing thesis's positionality from its
 * summary + quote, writing the flag back to the per-episode theses files AND
 * patching the copies embedded in holdings.json (matched by id), so no
 * re-aggregation (and no synthesis spend) is needed.
 */
export async function amendPositional(): Promise<void> {
  const episodeIds = store.listEpisodeIds();
  const all: Array<{ episodeId: string; t: Thesis }> = [];
  for (const id of episodeIds) {
    for (const t of store.loadTheses(id)) all.push({ episodeId: id, t });
  }
  const pending = all.filter((x) => x.t.positional === undefined);
  console.log(`${all.length} theses total; judging ${pending.length} without a positional flag…`);
  if (pending.length === 0) return;

  const verdicts = new Map<string, boolean>();
  for (let i = 0; i < pending.length; i += 60) {
    const chunk = pending.slice(i, i + 60);
    const lines = chunk
      .map(
        ({ t }) =>
          `id: ${t.id} | ${t.host} | ${t.stance}/${t.conviction} | ${t.company}\n  summary: ${t.summary}\n  quote: "${(t.quote || "").slice(0, 200)}"`,
      )
      .join("\n");
    const result = await callTool({
      system: SYSTEM,
      user: `Classify each take:\n\n${lines}`,
      toolName: "submit_positionality",
      toolDescription: "Submit positional=true/false for every take id.",
      inputSchema: INPUT_SCHEMA,
      validate: Schema,
      maxTokens: 8192,
    });
    for (const v of result.takes) verdicts.set(v.id, v.positional);
    console.log(`  judged ${Math.min(i + 60, pending.length)}/${pending.length}`);
  }

  // Write back per-episode files.
  for (const id of episodeIds) {
    const theses = store.loadTheses(id);
    let touched = false;
    for (const t of theses) {
      if (verdicts.has(t.id)) {
        t.positional = verdicts.get(t.id);
        touched = true;
      }
    }
    if (touched) store.saveTheses(id, theses);
  }

  // Patch the embedded copies in holdings.json by id.
  if (fs.existsSync(HOLDINGS_FILE)) {
    const snapshot: IndexSnapshot = JSON.parse(fs.readFileSync(HOLDINGS_FILE, "utf8"));
    for (const h of snapshot.holdings) {
      for (const t of h.theses) {
        if (verdicts.has(t.id)) t.positional = verdicts.get(t.id);
      }
    }
    fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  }

  const yes = [...verdicts.values()].filter(Boolean).length;
  console.log(`✓ amended: ${yes} positional / ${verdicts.size - yes} commentary — run build-fund next.`);
}
