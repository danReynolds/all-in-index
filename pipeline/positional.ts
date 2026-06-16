import fs from "node:fs";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { HOLDINGS_FILE } from "./config";
import type { IndexSnapshot, Thesis } from "../lib/types";

const CALL_TYPE_VALUES = ["view", "explicit_long", "explicit_short", "explicit_exit", "selection", "pair_trade", "basket"] as const;
const EXCLUDE_REASON_VALUES = ["conditional", "not_investment_call", "day_trade_aside"] as const;

const SYSTEM = `You classify podcast investment takes by callType — the single field that decides whether a take is a PORTFOLIO-SCORED CALL or commentary.

callType:
- "view" — commentary, analysis, or sentiment with NO portfolio action. This is the default. Strong opinions are still views: "I'm bullish", "exceptional business", "best positioned in AI", "they've stopped innovating", "those companies are toast". Criticizing a company you might still hold is commentary, not an exit.
- "explicit_long" — the speaker's own buy/own/long ("I'd own it here", "I bought more", "I'm long", "this is the trade", "I'd be buying this dip").
- "explicit_short" — an explicit short ("this is a short", "I'm short", "the short here is X").
- "explicit_exit" — a clear close/avoid that exits without opening a short ("I'd take profits", "I'm out", "wouldn't touch it").
- "selection" — a ranked investment pick ("my pick is X", "my #1 is X", "best place to invest"); the named companies in a "top picks / which would you bet on" answer are selections.
- "pair_trade" — a leg of a paired long/short ("long X / short Y", "own X over Y").
- "basket" — a named basket leg ("new Mag 7 basket").

Only the speaker's own transaction or selection language earns a non-"view" callType. Lean to "view" when unsure. Judge each take independently from its summary + quote.

Also set, when relevant:
- excludeReason: leave null normally. Set "conditional" / "day_trade_aside" / "not_investment_call" ONLY when the take is call-shaped (non-"view") but should be recorded without scoring; keep the descriptive callType and explain in scoreNote.
- scoreNote: optional one-line note — the evidence that made it a call, or the condition that gates it.`;

const Schema = z.object({
  takes: z.array(
    z.object({
      id: z.string(),
      callType: z.enum(CALL_TYPE_VALUES),
      excludeReason: z.enum(EXCLUDE_REASON_VALUES).nullable(),
      scoreNote: z.string().nullable(),
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
          callType: { type: "string", enum: [...CALL_TYPE_VALUES] },
          excludeReason: { type: ["string", "null"], enum: [...EXCLUDE_REASON_VALUES, null] },
          scoreNote: { type: ["string", "null"] },
        },
        required: ["id", "callType", "excludeReason", "scoreNote"],
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
  const pending = all.filter((x) => x.t.callType == null);
  console.log(`${all.length} theses total; judging ${pending.length} without a callType…`);
  if (pending.length === 0) return;

  const verdicts = new Map<string, z.infer<typeof Schema>["takes"][number]>();
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
      toolName: "submit_call_types",
      toolDescription: "Submit a callType (plus optional excludeReason/scoreNote) for every take id.",
      inputSchema: INPUT_SCHEMA,
      validate: Schema,
      maxTokens: 8192,
    });
    for (const v of result.takes) verdicts.set(v.id, v);
    console.log(`  judged ${Math.min(i + 60, pending.length)}/${pending.length}`);
  }

  // Write back per-episode files.
  for (const id of episodeIds) {
    const theses = store.loadTheses(id);
    let touched = false;
    for (const t of theses) {
      const v = verdicts.get(t.id);
      if (v) {
        t.callType = v.callType;
        t.excludeReason = v.excludeReason;
        t.scoreNote = v.scoreNote;
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
        const v = verdicts.get(t.id);
        if (v) {
          t.callType = v.callType;
          t.excludeReason = v.excludeReason;
          t.scoreNote = v.scoreNote;
        }
      }
    }
    fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  }

  const yes = [...verdicts.values()].filter((v) => v.callType !== "view").length;
  console.log(`✓ amended: ${yes} scored calls / ${verdicts.size - yes} views — run build-fund next.`);
}
