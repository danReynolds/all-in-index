import { z } from "zod";
import { callTool } from "./llm";
import { trimPublishedQuote } from "../lib/quotes";
import type { Episode, Thesis, Transcript } from "../lib/types";

const VERDICT_VALUES = ["keep", "fix_quote", "neutralize", "drop"] as const;
const MAX_CHARS = 160_000;

const VerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      index: z.number(),
      verdict: z.enum(VERDICT_VALUES),
      reason: z.string(),
      newQuote: z.string().nullable().optional(),
      newQuoteStartSec: z.number().nullable().optional(),
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
          newQuote: { type: ["string", "null"], description: "For fix_quote only: a verbatim ≤240-char excerpt copied EXACTLY from this host's transcript lines that proves the stance." },
          newQuoteStartSec: { type: ["number", "null"], description: "For fix_quote only: the integer second from the chosen line's [<sec>s <Speaker>] prefix." },
        },
        required: ["index", "verdict", "reason"],
      },
    },
  },
  required: ["verdicts"],
};

const SYSTEM = `You are a strict auditor of investment theses extracted from one All-In podcast episode. Each thesis names a COMPANY, ASSET, named BASKET/SECTOR, or explicit MACRO EXPOSURE (examples: gold, oil, copper, uranium, S&P 500, credit default swaps/CDS, stablecoins, software industrial complex, Mag 7), a HOST, and a STANCE (bull / bear / neutral / mixed), and shows ONE published quote. You are given the FULL TRANSCRIPT, so judge against what the host actually said — not against the single quote in isolation. Below, "the name" means the company, asset, basket, sector, or macro exposure the thesis is about.

A thesis's published quote must, on its own, prove its stance. So for every thesis decide:

- "keep": the current quote already contains an explicit, company-specific economic claim matching the bull/bear/mixed stance (or the stance is neutral/mixed and the quote is a genuine company view). Nothing to change.
- "fix_quote": the host DID make an explicit, company-specific directional claim for this company somewhere in the transcript that matches the stance, but the CURRENT quote doesn't carry it (it's evocative, partial, or off-point). Keep the stance and supply newQuote: a verbatim ≤240-char excerpt copied EXACTLY from one of this host's transcript lines that proves the stance, plus newQuoteStartSec from that line's [<sec>s <Speaker>] prefix. Use this whenever a real claim exists but the quote under-sells it — do NOT neutralize a real view just because the quoted sentence was weak.
- "neutralize": the host has a company-specific view but nowhere makes an explicit economic DIRECTION claim for it — the stance was inferred from framing, tone, or "well positioned / beneficiary / important player" language. The stance is rewritten to "neutral".
- "drop": the name is mentioned only in passing — listed among others, cited as an EXAMPLE of an industry/category/trend, mentioned while reading a news item, used as a MACRO BAROMETER (a data point for a claim about the economy/consumer/rates/market rather than about itself, e.g. "Airbnb's demand warning shows the consumer is weak"), or with no investment claim anywhere. Enumerations are mentions, not theses ("companies like X and Y", "the whole chip complex"). Sector/theme sentiment ("AI is a tailwind for cybersecurity") is not a stance on any individual member company. But do NOT drop a named basket/sector/macro exposure when the basket/exposure itself is the host's explicit pick or trade ("I would be long CDS", "short the S&P", "my pick is enterprise SaaS", "stablecoins are my biggest business winner"). A formal-predictions answer like "my pick for best performing asset will be the Robinhood/Polymarket/PrizePicks gambling space" is a keep/fix_quote basket call, not a passive enumeration.

What counts as an explicit economic-direction claim:
- bull = the host claims the name's value / competitive position / financial trajectory is improving, or that it is the/a winner. For a commodity: its price/value is heading up, or it's "the trade".
- bear = the host ties a concrete risk to the name's economics (revenue, margins, share, valuation), or names it a loser. For a commodity: its price is heading down or under pressure.
- For a basket/sector/macro exposure: bull/bear means the host names that exposure as a winner/loser, long/short, best/worst asset, or explicit trade. The exposure does not need to be a single company or ETF to be kept; structural tradability is handled downstream.
- Moral/conduct/political commentary, product praise, and "beneficiary/well-positioned" framing are NOT directional unless paired with an explicit economic claim. In particular, condemning a company's CONDUCT — anti-competitive behavior, regulatory capture, surveillance, censorship, being "untrustworthy", "dangerous", "too powerful", or causing "market centralization" / ecosystem harm — is NOT bear: that conduct is usually economically GOOD for the company.

DECISIVE CHECK before you KEEP any bull or bear (do this for every directional take):
1. Name the specific economic outcome the host claims — more/less revenue, customers, market share, margin, or valuation. If the only negativity is about conduct, ethics, danger to society, or being too dominant, and you cannot name a claimed worse *business* outcome, NEUTRALIZE.
2. A company the host describes as WINNING — growing fast, gaining share, entrenching monopolistic control, pulling away from rivals — is bull or neutral, NEVER bear, even when the host frames that winning as dangerous, unfair, or untrustworthy. (Example: "Anthropic is pursuing regulatory capture to entrench monopolistic control and is pulling away from OpenAI" describes Anthropic winning + a conduct objection → NOT bear; neutralize. It only becomes bear if the host says the company will LOSE customers/revenue, e.g. "enterprises treat it as a non-starter and flee to open-source".)

Rules:
- QUOTE OWNERSHIP: the published quote must be the attributed host's OWN words. If it was actually spoken by a DIFFERENT person (check the [<sec>s <Speaker>] prefixes — a common error is attaching one host's vivid line, or a moderator's setup stat, to another host's take), it cannot stand. Use fix_quote with a line THIS host actually said that proves the stance; if this host never made the claim in their own words, neutralize (or drop if they never gave the company a real view). Likewise never let a quote stitch words from two different speakers.
- Reserve fix_quote for a REAL claim that exists in the transcript; if no such sentence exists, neutralize (or drop). Never invent or paraphrase — newQuote must be an exact substring of the host's OWN lines.
- When torn between keep and fix_quote, prefer fix_quote only if the current quote genuinely fails to carry the claim; otherwise keep.
- When torn between fix_quote and neutralize, neutralize — only supply a new quote when you can point to an unambiguous directional sentence.
- When torn between neutralize and drop, drop if the name appears only as an example or list item.`;

/** Collapse to lowercase alphanumerics + single spaces, for verbatim matching. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Is `candidate` a verbatim excerpt of the transcript? Quotes are often stitched
 * from non-contiguous lines with an ellipsis ("A … B"); accept that by requiring
 * each substantive ellipsis-separated fragment to appear verbatim in the haystack.
 */
function isVerbatim(candidate: string, haystack: string): boolean {
  const frags = candidate
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map(norm)
    .filter((f) => f.length >= 12);
  return frags.length > 0 && frags.every((f) => haystack.includes(f));
}

function formatTranscript(t: Transcript): string {
  const text = t.utterances
    .map((u) => `[${Math.round(u.startMs / 1000)}s ${u.speaker}] ${u.text}`)
    .join("\n");
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}

const PROTECTED_EXPLICIT_CALL = /\b(?:my\s+pick|i\s+(?:will|would|'ll|’ll)\s+pick|my\s+number\s*(?:one|1)|best\s+performing\s+asset|worst\s+performing\s+asset|biggest\s+business\s+(?:winner|loser)|i\s+would\s+be\s+(?:long|short)|short\s+the)\b/i;

export function shouldProtectExplicitCallFromDrop(t: Thesis): boolean {
  return !!t.callType && t.callType !== "view" && PROTECTED_EXPLICIT_CALL.test(t.quote);
}

/**
 * Adversarial backstop for extraction, now transcript-aware. Re-judges each
 * thesis against what the host actually said: passing mentions/enumerations are
 * dropped; a real directional view whose published quote doesn't carry the
 * claim has its quote REPAIRED (the proving sentence is substituted, validated
 * to be a verbatim transcript substring); only genuinely inferred stances are
 * neutralized. One LLM call per episode; no-op on empty input.
 */
export async function verifyTheses(
  ep: Episode,
  theses: Thesis[],
  transcript: Transcript,
): Promise<Thesis[]> {
  if (theses.length === 0) return theses;

  const lines = theses.map(
    (t, i) =>
      `[${i}] host=${t.host} company=${t.company} stance=${t.stance} conviction=${t.conviction}\n     quote: "${t.quote}"\n     summary: ${t.summary}`,
  );

  // Verify is a best-effort backstop: if the audit call fails (a malformed
  // verdict the validator rejects, or a transient API error), keep the takes
  // unverified rather than crash the extraction that depends on it.
  let verdicts: z.infer<typeof VerdictSchema>["verdicts"];
  try {
    ({ verdicts } = await callTool({
      system: SYSTEM,
      user:
        `Episode ${ep.id} — "${ep.title}".\n\nFULL TRANSCRIPT:\n\n${formatTranscript(transcript)}\n\n` +
        `=== ${theses.length} EXTRACTED THESES TO AUDIT ===\n\n${lines.join("\n\n")}`,
      toolName: "submit_verdicts",
      toolDescription: "Submit one keep/fix_quote/neutralize/drop verdict per thesis index.",
      inputSchema: INPUT_SCHEMA,
      validate: VerdictSchema,
      maxTokens: 4096,
    }));
  } catch (e) {
    console.warn(`  ⚠ verify skipped for ${ep.id} (${e instanceof Error ? e.message.slice(0, 80) : e}) — keeping ${theses.length} takes unverified`);
    return theses;
  }

  // Per-speaker haystacks for validating a replacement quote: a fix_quote must
  // be verbatim in the ATTRIBUTED HOST's own lines, never another speaker's —
  // this enforces quote ownership mechanically, not just via the prompt.
  const speakerText = new Map<string, string[]>();
  for (const u of transcript.utterances) {
    (speakerText.get(u.speaker) ?? speakerText.set(u.speaker, []).get(u.speaker)!).push(u.text);
  }
  const hostHaystack = new Map<string, string>();
  for (const [spk, texts] of speakerText) hostHaystack.set(spk, norm(texts.join(" ")));
  const byIndex = new Map(verdicts.map((v) => [v.index, v]));
  const kept: Thesis[] = [];
  let dropped = 0;
  let neutralized = 0;
  let requoted = 0;
  let keptOriginalRequote = 0;

  theses.forEach((t, i) => {
    const v = byIndex.get(i);
    // Default to keep when the auditor returns no verdict for a row.
    if (!v || v.verdict === "keep") {
      kept.push(t);
      return;
    }

    if (v.verdict === "drop") {
      if (shouldProtectExplicitCallFromDrop(t)) {
        console.log(`  ↺ keep explicit call ${t.company} (${t.stance}) — protected from drop: ${v.reason}`);
        kept.push(t);
        return;
      }
      dropped++;
      console.log(`  ✂ drop  ${t.company} (${t.stance}) — ${v.reason}`);
      return;
    }

    if (v.verdict === "fix_quote") {
      const candidate = (v.newQuote ?? "").trim();
      // Validate against the attributed host's own lines only — a replacement
      // that's verbatim somewhere in the transcript but not in this host's
      // utterances is exactly the cross-speaker contamination we're guarding against.
      const hostHay = hostHaystack.get(t.host) ?? "";
      if (isVerbatim(candidate, hostHay)) {
        requoted++;
        console.log(`  ✎ requote ${t.company} (${t.stance}) — ${v.reason}`);
        kept.push({
          ...t,
          quote: trimPublishedQuote(candidate),
          // Let the downstream snap re-derive the offset from the new quote;
          // accept the model's hint only as a fallback.
          quoteStartMs: v.newQuoteStartSec != null ? Math.round(v.newQuoteStartSec) * 1000 : null,
        });
        return;
      }
      // The proposed replacement isn't a verifiable verbatim excerpt — but the
      // auditor still judged this a real directional take (it chose fix_quote,
      // not neutralize). Keep the original quote + stance rather than demoting on
      // a quote-mechanics failure; quote quality is upgrade-quotes' job.
      keptOriginalRequote++;
      console.log(`  ✎ requote unverifiable — keeping original quote+stance: ${t.company} (${t.stance})`);
      kept.push(t);
      return;
    }

    // neutralize: keep the row but strip the inferred direction.
    if (t.stance !== "neutral") {
      neutralized++;
      console.log(`  ↓ neutralize ${t.company} (${t.stance}→neutral) — ${v.reason}`);
    }
    kept.push({ ...t, stance: "neutral" });
  });

  if (dropped || neutralized || requoted || keptOriginalRequote) {
    console.log(
      `  verify: dropped ${dropped}, requoted ${requoted} (+${keptOriginalRequote} kept-orig), neutralized ${neutralized}, kept ${kept.length}/${theses.length}`,
    );
  }

  return kept;
}
