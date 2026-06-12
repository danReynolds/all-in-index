import fs from "node:fs";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { snapQuoteTimestamps } from "./run-episode";
import { HOLDINGS_FILE } from "./config";
import type { IndexSnapshot, Thesis, Transcript } from "../lib/types";

const BESTIES = new Set(["Chamath", "Jason", "Sacks", "Friedberg"]);

const SYSTEM = `You audit whether a take's QUOTE evidences its LABELS. The quote is the
load-bearing receipt: a positional take's quote must contain the speaker's own
in/out or selection words ("I'm in", "I have shares", "I would be long it",
"my pick is", "number 1", "best place to invest", "long X / short Y",
"the short here is X");
a bull/bear take's quote must contain the economic claim itself.

You are given the take's labels, its current quote, and the speaker's
utterances about that company from the transcript. Decide:
- evidenced: does the CURRENT quote carry the proof for the labels?
- If not, find a BETTER quote: a verbatim contiguous excerpt (<= 240 chars)
  from the provided utterances that does carry the proof. Copy it EXACTLY.
- If no excerpt in the provided utterances evidences the labels, return
  betterQuote: null — do NOT invent or paraphrase.

Be conservative: if the current quote is adequate, say evidenced=true and move
on. Only propose a swap when the improvement is clear.`;

const Schema = z.object({
  takes: z.array(
    z.object({
      id: z.string(),
      evidenced: z.boolean(),
      betterQuote: z.string().nullable(),
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
          evidenced: { type: "boolean" },
          betterQuote: { type: ["string", "null"], description: "Verbatim excerpt or null" },
        },
        required: ["id", "evidenced", "betterQuote"],
      },
    },
  },
  required: ["takes"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The host's transcript context for a take: company mentions + quote vicinity. */
function contextFor(t: Thesis, tr: Transcript): string {
  const tokens = [t.company, ...(t.ticker ? [t.ticker] : [])]
    .flatMap((s) => s.split(/[^A-Za-z0-9.]+/))
    .filter((w) => w.length > 2)
    .map((w) => w.toLowerCase());
  const near = (u: { startMs: number }) =>
    t.quoteStartMs != null && Math.abs(u.startMs - t.quoteStartMs) < 240_000;
  const us = tr.utterances.filter(
    (u) =>
      u.speaker === t.host &&
      (near(u) || tokens.some((tok) => u.text.toLowerCase().includes(tok))),
  );
  let out = "";
  for (const u of us) {
    if (out.length > 7000) break;
    out += u.text + "\n";
  }
  return out;
}

/**
 * For every take that scores or trades, verify the quote evidences the labels;
 * where it doesn't, swap in a verbatim transcript excerpt that does (the
 * Figma-class fix: right classification, wrong receipt). Timestamps re-snap.
 */
export async function upgradeQuotes(): Promise<void> {
  const episodeIds = store.listEpisodeIds();
  let candidates = 0;
  let swapped = 0;
  let unevidencedNoFix = 0;
  const changed: string[] = [];

  for (const epId of episodeIds) {
    const tr = store.loadTranscript(epId);
    if (!tr) continue;
    const theses = store.loadTheses(epId);
    const cands = theses.filter(
      (t) =>
        t.quote &&
        ((BESTIES.has(t.host) &&
          t.conviction !== "low" &&
          t.attributionConfidence !== "low" &&
          t.stance !== "neutral") ||
          t.positional),
    );
    if (!cands.length) continue;
    candidates += cands.length;

    const lines = cands
      .map(
        (t) =>
          `id: ${t.id} | labels: stance=${t.stance}, positional=${t.positional} | ${t.host} on ${t.company}\n` +
          `current quote: "${t.quote}"\n` +
          `transcript utterances by ${t.host}:\n${contextFor(t, tr)}`,
      )
      .join("\n────\n");

    const result = await callTool({
      system: SYSTEM,
      user: `Takes from ${epId}:\n\n${lines}`,
      toolName: "submit_audit",
      toolDescription: "Submit evidenced/betterQuote for every take id.",
      inputSchema: INPUT_SCHEMA,
      validate: Schema,
      maxTokens: 8192,
    });

    let epChanged = false;
    for (const v of result.takes) {
      if (v.evidenced || !v.betterQuote) {
        if (!v.evidenced && !v.betterQuote) unevidencedNoFix++;
        continue;
      }
      const t = cands.find((x) => x.id === v.id);
      if (!t) continue;
      // Verify the proposed quote is genuinely verbatim in the transcript.
      const key = norm(v.betterQuote);
      const hit = tr.utterances.some((u) => norm(u.text).includes(key.slice(0, 60)));
      if (!hit || key.length < 15) continue;
      // Never let two takes share a quote — the aggregator's passing-mention
      // filter (correctly) drops shared quotes as list mentions.
      const dupe = theses.some(
        (other) => other.id !== t.id && norm(other.quote ?? "").includes(key.slice(0, 60)),
      );
      if (dupe) continue;
      t.quote = v.betterQuote.slice(0, 240);
      t.quoteStartMs = null; // re-snapped below
      swapped++;
      epChanged = true;
      changed.push(`${t.id}: "${t.quote.slice(0, 90)}…"`);
    }
    if (epChanged) {
      snapQuoteTimestamps(theses, tr);
      store.saveTheses(epId, theses);
    }
    console.log(`  ${epId}: ${cands.length} checked`);
  }

  // Mirror swapped quotes/timestamps into holdings.json.
  if (fs.existsSync(HOLDINGS_FILE)) {
    const byId = new Map<string, Thesis>();
    for (const epId of episodeIds) for (const t of store.loadTheses(epId)) byId.set(t.id, t);
    const snapshot: IndexSnapshot = JSON.parse(fs.readFileSync(HOLDINGS_FILE, "utf8"));
    for (const h of snapshot.holdings) {
      for (const t of h.theses) {
        const src = byId.get(t.id);
        if (src && (src.quote !== t.quote || src.quoteStartMs !== t.quoteStartMs)) {
          t.quote = src.quote;
          t.quoteStartMs = src.quoteStartMs;
        }
      }
    }
    fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  }

  console.log(`\n✓ checked ${candidates} takes, upgraded ${swapped} quotes, ${unevidencedNoFix} unevidenced with no fix found:`);
  changed.forEach((c) => console.log(`  ↻ ${c}`));
}
