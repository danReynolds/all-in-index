import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isScoredPosition } from "../lib/calls";
import type { Thesis, Transcript } from "../lib/types";
import { enforceVerbatimQuotes, repairQuoteOwnership, snapQuoteTimestamps, stampAttribution } from "../pipeline/run-episode";

const mixedQuote = "Apple is the stock I would buy at this price.";
const cleanQuote = "I still own a meaningful amount of Apple stock.";

function appleTake(quote: string, quoteStartMs: number | null): Thesis {
  return {
    id: "E281-aapl-Sacks-8",
    episodeId: "E281",
    episodeNumber: 281,
    episodeDate: "2026-07-18T00:36:00.000Z",
    company: "Apple",
    ticker: "AAPL",
    isPublic: true,
    host: "Sacks",
    stance: "bull",
    conviction: "medium",
    callType: "explicit_long",
    summary: "Apple is a buy here.",
    quote,
    quoteStartMs,
    topics: [],
    attributionConfidence: "high",
  };
}

function transcript(): Transcript {
  return {
    episodeId: "E281",
    provider: "assemblyai",
    speakerMap: { D: "Sacks", C: "Sacks" },
    speakerConfidence: { D: "high", C: "high" },
    mergedClusters: ["C"],
    utterances: [
      { cluster: "D", speaker: "Sacks", text: cleanQuote, startMs: 1000, endMs: 6000 },
      { cluster: "C", speaker: "Sacks", text: mixedQuote, startMs: 6000, endMs: 12000 },
    ],
    meta: {},
  };
}

test("an exact quote in a fused speaker cluster cannot score as a host call", () => {
  const take = appleTake(mixedQuote, 7000);
  assert.equal(isScoredPosition(take), true);

  stampAttribution([take], transcript());

  assert.equal(take.attributionConfidence, "low");
  assert.equal(isScoredPosition(take), false);
  assert.equal(take.host, "Sacks");
  assert.equal(take.id, "E281-aapl-Sacks-8");
  assert.equal(take.quote, mixedQuote);
});

test("a different clean cluster cannot hide the fused source when the timestamp is stale or missing", () => {
  const stale = appleTake(mixedQuote, 1500);
  const missing = appleTake(mixedQuote, null);

  stampAttribution([stale, missing], transcript());

  assert.equal(stale.attributionConfidence, "low");
  assert.equal(missing.attributionConfidence, "low");
});

test("a quote stitched from clear and fused clusters cannot score", () => {
  const take = appleTake(`${cleanQuote} … ${mixedQuote}`, 1500);

  stampAttribution([take], transcript());

  assert.equal(take.attributionConfidence, "low");
  assert.equal(isScoredPosition(take), false);
});

test("a stitched quote cannot bypass the confidence gate when the fused fragment has a different speaker label", () => {
  const source = transcript();
  source.utterances[1].speaker = "Jason";
  source.speakerMap.C = "Jason";
  const takes = [appleTake(`${cleanQuote} … ${mixedQuote}`, 1500)];

  enforceVerbatimQuotes(stampAttribution(snapQuoteTimestamps(repairQuoteOwnership(takes, source), source), source), source);

  assert.equal(takes[0].attributionConfidence, "low");
  assert.equal(isScoredPosition(takes[0]), false);
});

test("the same host's quote from a clear cluster can still score", () => {
  const source = transcript();
  const clear = appleTake(cleanQuote, null);
  stampAttribution([clear], source);
  assert.equal(isScoredPosition(clear), true);

  // An automatically assigned timestamp cannot resolve a quote repeated in
  // both clusters.
  source.utterances[1].text = cleanQuote;
  const timed = appleTake(cleanQuote, 1500);
  const ambiguous = appleTake(cleanQuote, null);
  const fromMixed = appleTake(cleanQuote, 8000);
  snapQuoteTimestamps([ambiguous, fromMixed], source);
  assert.equal(ambiguous.quoteStartMs, 1000);
  assert.equal(fromMixed.quoteStartMs, 1000);
  stampAttribution([timed, ambiguous, fromMixed], source);
  assert.equal(isScoredPosition(timed), false);
  assert.equal(isScoredPosition(ambiguous), false);
  assert.equal(isScoredPosition(fromMixed), false);
});

test("syntheses and their cache use only takes with usable attribution", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "all-in-attribution-"));
  try {
    const indexUrl = new URL("../pipeline/build-index.ts", import.meta.url).href;
    const llmUrl = new URL("../pipeline/llm.ts", import.meta.url).href;
    const storeUrl = new URL("../pipeline/store.ts", import.meta.url).href;
    const example = { ...appleTake(cleanQuote, null), company: "Test Orchard", ticker: null, isPublic: false, callType: "view" };
    execFileSync(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"), "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import fs from "node:fs";
      const { default: { buildIndex } } = await import(${JSON.stringify(indexUrl)});
      const { default: { anthropic } } = await import(${JSON.stringify(llmUrl)});
      const { default: { store } } = await import(${JSON.stringify(storeUrl)});
      globalThis.fetch = () => { throw new Error("Unexpected network request"); };
      const prompts = [];
      anthropic().messages.create = async (request) => {
        assert.equal(request.tool_choice.name, "submit_synthesis");
        const prompt = request.messages[0].content;
        prompts.push(prompt);
        return {
          stop_reason: "tool_use",
          usage: { output_tokens: 50 },
          content: [{ type: "tool_use", input: { synthesis: prompt } }],
        };
      };
      const clean = { ...${JSON.stringify(example)}, id: "clean", host: "Jason", summary: "Clear takeaway." };
      const disputed = { ...clean, id: "disputed", host: "Sacks", summary: "Disputed takeaway." };
      store.saveEpisode({ id: clean.episodeId });
      store.saveTheses(clean.episodeId, [clean, disputed]);
      fs.writeFileSync("data/companies.json", JSON.stringify({ "test-orchard": { description: "An example company.", domain: null } }));

      let { holdings: [holding] } = await buildIndex();
      assert.match(holding.synthesis, /Disputed takeaway/);
      disputed.attributionConfidence = "low";
      store.saveTheses(clean.episodeId, [clean, disputed]);
      ({ holdings: [holding] } = await buildIndex());
      assert.equal(prompts.length, 2);
      assert.match(holding.synthesis, /Jason.*Clear takeaway/);
      assert.doesNotMatch(holding.synthesis, /Sacks|Disputed takeaway/);
      assert.equal(holding.theses.length, 2);

      ({ holdings: [holding] } = await buildIndex());
      assert.equal(prompts.length, 2);
      assert.match(holding.synthesis, /Clear takeaway/);

      clean.attributionConfidence = "low";
      store.saveTheses(clean.episodeId, [clean, disputed]);
      ({ holdings: [holding] } = await buildIndex());
      assert.equal(prompts.length, 2);
      assert.equal(holding.synthesis, "Speaker attribution is uncertain for the available commentary.");
      assert.equal(holding.theses.length, 2);
    `], { cwd: dir, env: { ...process.env, ANTHROPIC_API_KEY: "test-key" }, stdio: "pipe" });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
