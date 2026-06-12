import fs from "node:fs";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { HOLDINGS_FILE } from "./config";
import type { IndexSnapshot, Thesis } from "../lib/types";

const CALL_TYPE_VALUES = ["view", "explicit_long", "explicit_short", "explicit_exit", "selection", "pair_trade", "basket"] as const;
const TRADE_DIRECTION_VALUES = ["long", "short"] as const;
const SCORE_EXCLUSION_VALUES = ["conditional", "private", "macro_asset", "crypto", "benchmark_or_etf", "unpriced", "not_investment_call", "day_trade_aside"] as const;

const SYSTEM = `You classify podcast investment takes as PORTFOLIO-SCORED CALLS or commentary.

positional = true ONLY when the statement clearly communicates a portfolio-scoreable call — an expressed or unmistakably implied portfolio action, ownership stance, ranked investment selection, or pair/basket leg:
- in: "I'd own it here", "I bought more", "this is the trade", "I'm long", "I'd be buying this dip"
- out: "I'd take profits", "I wouldn't touch it", "this is a short", "I'm out", "stay away"
- selection: "my pick is X", "my #1 is X", "if I could only bet on two: X and Y", "best place to invest", "new Mag 7 basket"
- pair/basket: "long X / short Y", "own X over Y", "X belongs in the basket"

positional = false for views WITHOUT ownership intent, however strong or detailed:
- praise of products, execution, or leadership ("Jensen is a genius", "best positioned in AI")
- criticism of strategy, innovation, or culture ("they've stopped innovating") — criticizing a company you might still hold is commentary, not an exit
- valuation musings, competitive analysis, growth observations without an in/out signal
- sentiment alone ("I'm bullish", "I wouldn't sleep on it", "exceptional business") unless the segment is explicitly asking for ranked picks or investment selections

For every take, also classify:
- callType: "view" for non-positional commentary; "explicit_long" for direct buy/own/long calls; "explicit_short" for direct short calls; "explicit_exit" for clear close/avoid language that exits without opening a short; "selection" for ranked investment picks; "pair_trade" for each leg of a paired long/short trade; "basket" for named basket legs.
- tradeDirection: "long" only when the row opens a long exposure; "short" only when the speaker explicitly says short or names the short leg of a pair. Bearish exits such as "take profits" or "wouldn't touch it" can be positional with callType="explicit_exit" but must have tradeDirection=null.
- pairTradeId: shared id for rows that are legs of the same pair trade, else null.
- scoreReason: short phrase explaining why it clears or does not clear the scoring bar.
- scoreCondition: for conditional picks that should not trade until a condition resolves.
- scoreExclusionReason: why a noteworthy receipt is audited but not scored (conditional, day_trade_aside, not_investment_call, etc.).

Lean false when unsure — only clear in/out signals count. Judge each take independently.`;

const Schema = z.object({
  takes: z.array(
    z.object({
      id: z.string(),
      positional: z.boolean(),
      callType: z.enum(CALL_TYPE_VALUES),
      tradeDirection: z.enum(TRADE_DIRECTION_VALUES).nullable(),
      pairTradeId: z.string().nullable(),
      scoreReason: z.string().nullable(),
      scoreCondition: z.string().nullable(),
      scoreExclusionReason: z.enum(SCORE_EXCLUSION_VALUES).nullable(),
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
          positional: { type: "boolean" },
          callType: { type: "string", enum: [...CALL_TYPE_VALUES] },
          tradeDirection: { type: ["string", "null"], enum: [...TRADE_DIRECTION_VALUES, null] },
          pairTradeId: { type: ["string", "null"] },
          scoreReason: { type: ["string", "null"] },
          scoreCondition: { type: ["string", "null"] },
          scoreExclusionReason: { type: ["string", "null"], enum: [...SCORE_EXCLUSION_VALUES, null] },
        },
        required: ["id", "positional", "callType", "tradeDirection", "pairTradeId", "scoreReason", "scoreCondition", "scoreExclusionReason"],
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
      toolName: "submit_positionality",
      toolDescription: "Submit positional=true/false for every take id.",
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
        t.positional = v.positional;
        t.callType = v.callType;
        t.tradeDirection = v.tradeDirection;
        t.pairTradeId = v.pairTradeId;
        t.scoreReason = v.scoreReason;
        t.scoreCondition = v.scoreCondition;
        t.scoreExclusionReason = v.scoreExclusionReason;
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
          t.positional = v.positional;
          t.callType = v.callType;
          t.tradeDirection = v.tradeDirection;
          t.pairTradeId = v.pairTradeId;
          t.scoreReason = v.scoreReason;
          t.scoreCondition = v.scoreCondition;
          t.scoreExclusionReason = v.scoreExclusionReason;
        }
      }
    }
    fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  }

  const yes = [...verdicts.values()].filter((v) => v.positional).length;
  console.log(`✓ amended: ${yes} positional / ${verdicts.size - yes} commentary — run build-fund next.`);
}
