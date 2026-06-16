import { z } from "zod";
import { callTool } from "./llm";
import type { Episode, Thesis } from "../lib/types";

const VERDICT_VALUES = ["keep", "neutralize", "drop"] as const;

const VerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      index: z.number(),
      verdict: z.enum(VERDICT_VALUES),
      reason: z.string(),
    }),
  ),
});

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "number", description: "The index of the thesis being judged" },
          verdict: { type: "string", enum: [...VERDICT_VALUES] },
          reason: { type: "string", description: "One short clause justifying the verdict" },
        },
        required: ["index", "verdict", "reason"],
      },
    },
  },
  required: ["verdicts"],
};

const SYSTEM = `You are a strict auditor of investment theses extracted from the All-In podcast. Each thesis was assigned a STANCE (bull / bear / neutral / mixed) and is backed by ONE published quote. Your job is to decide whether that quote actually carries the evidence for its assigned stance. Default to demotion: a thesis survives only if its OWN quote proves its label.

Return exactly one verdict per thesis, keyed by its index:

- "drop": the company is named only in passing — listed among others, cited as an EXAMPLE of an industry/category/trend, mentioned while reading a news item, or with no company-specific investment claim at all. Enumerations are mentions, not theses: "companies like X and Y", "you have X, we have Y", "the whole chip complex". Sector- or theme-level sentiment ("AI is a tailwind for cybersecurity") is NOT a stance on any individual company merely named as a member of that sector.
- "neutralize": the quote expresses a genuine company-specific view, but does NOT explicitly claim an economic DIRECTION for that company. Use this when the stance was inferred rather than stated. The stance will be rewritten to "neutral".
- "keep": the quote contains an explicit, company-specific economic claim that matches the assigned bull/bear/mixed stance — or the stance is already "neutral"/"mixed" and the quote is a genuine company view.

Rules:
- Judge ONLY by the quote text. The summary may overreach or infer; ignore it entirely. If the quote does not prove the label, demote — no matter how confident the summary reads.
- bull requires the quote to claim the company's value/position is improving. bear requires a concrete risk tied to that company's economics. "beneficiary", "well positioned", "important player", being named alongside a positive trend — these are INFERRED direction, not explicit claims → neutralize (or drop if the company is only an example).
- When torn between keep and neutralize, choose neutralize. When torn between neutralize and drop, choose drop if the company appears only as an example or item in a list.
- A quote that names two or more companies as members of a group is almost always an enumeration → drop each unless one company is singled out with its own claim.`;

/**
 * Adversarial backstop for extraction: re-judge each thesis on whether its
 * published quote actually carries the evidence for its stance (the contract
 * stated in the extractor prompt but never enforced). Mentions and enumerations
 * are dropped; theses whose direction was inferred (not explicitly claimed) are
 * neutralized. Judges on the QUOTE alone — that is the published evidence the
 * label has to stand on. One cheap LLM call per episode; no-op on empty input.
 */
export async function verifyTheses(ep: Episode, theses: Thesis[]): Promise<Thesis[]> {
  if (theses.length === 0) return theses;

  const lines = theses.map(
    (t, i) =>
      `[${i}] company=${t.company} stance=${t.stance} conviction=${t.conviction}\n     quote: "${t.quote}"\n     summary: ${t.summary}`,
  );

  const { verdicts } = await callTool({
    system: SYSTEM,
    user: `Episode ${ep.id} — audit these ${theses.length} extracted theses:\n\n${lines.join("\n\n")}`,
    toolName: "submit_verdicts",
    toolDescription: "Submit one keep/neutralize/drop verdict per thesis index.",
    inputSchema: INPUT_SCHEMA,
    validate: VerdictSchema,
    maxTokens: 4096,
  });

  const byIndex = new Map(verdicts.map((v) => [v.index, v]));
  const kept: Thesis[] = [];
  let dropped = 0;
  let neutralized = 0;

  theses.forEach((t, i) => {
    const v = byIndex.get(i);
    // Default to keep when the auditor returns no verdict for a row — never
    // silently drop something we didn't get an explicit ruling on.
    if (!v || v.verdict === "keep") {
      kept.push(t);
      return;
    }
    if (v.verdict === "drop") {
      dropped++;
      console.log(`  ✂ drop  ${t.company} (${t.stance}) — ${v.reason}`);
      return;
    }
    // neutralize: keep the row but strip the inferred direction.
    if (t.stance !== "neutral") {
      neutralized++;
      console.log(`  ↓ neutralize ${t.company} (${t.stance}→neutral) — ${v.reason}`);
    }
    kept.push({ ...t, stance: "neutral" });
  });

  if (dropped || neutralized) {
    console.log(`  verify: dropped ${dropped}, neutralized ${neutralized}, kept ${kept.length}/${theses.length}`);
  }

  return kept;
}
