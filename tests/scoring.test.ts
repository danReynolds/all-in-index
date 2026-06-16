import assert from "node:assert/strict";
import test from "node:test";
import { currentStanceForHosts, hostExposureWindows, tradeDirectionForTake } from "../lib/calls";
import { MAX_PUBLISHED_QUOTE_CHARS, trimPublishedQuote } from "../lib/quotes";
import { auditTranscriptCandidates } from "../pipeline/take-candidate-audit";
import { validateIndexSnapshot } from "../pipeline/quality";
import type { IndexSnapshot, Transcript } from "../lib/types";
import {
  BESTIES,
  currentBullEntryDate,
  currentBullHosts,
  isCurrentNetBull,
} from "../pipeline/index-fund";
import type { Holding, Host, Stance, Thesis } from "../lib/types";

const hosts: Host[] = ["Chamath", "Jason", "Sacks", "Friedberg"];

function thesis(
  host: Host,
  stance: Stance,
  episodeDate: string,
  overrides: Partial<Thesis> = {},
): Thesis {
  return {
    id: `${host}-${stance}-${episodeDate}`,
    episodeId: `E-${episodeDate}`,
    episodeNumber: null,
    episodeDate,
    company: "ExampleCo",
    ticker: "EXM",
    isPublic: true,
    host,
    stance,
    conviction: "medium",
    callType: "view",
    summary: `${host} is ${stance}`,
    quote: `${host} said ${stance}`,
    quoteStartMs: null,
    topics: [],
    attributionConfidence: "high",
    ...overrides,
  };
}

function holding(theses: Thesis[]): Holding {
  return {
    slug: "exm",
    company: "ExampleCo",
    ticker: "EXM",
    isPublic: true,
    theses,
    synthesis: "",
    netStance: "neutral",
    firstMentioned: theses[0]?.episodeDate ?? "2025-01-01T00:00:00.000Z",
    lastMentioned: theses[theses.length - 1]?.episodeDate ?? "2025-01-01T00:00:00.000Z",
    mentionCount: theses.length,
    market: null,
  };
}

test("current net bull uses each host's latest scored take, not all historical takes", () => {
  const takes = [
    thesis("Chamath", "bull", "2025-01-01T00:00:00.000Z"),
    thesis("Jason", "bull", "2025-01-02T00:00:00.000Z"),
    thesis("Jason", "bear", "2025-03-01T00:00:00.000Z"),
  ];

  assert.equal(currentStanceForHosts(takes, hosts), "mixed");
  assert.equal(isCurrentNetBull(takes, BESTIES), false);
});

test("current bull entry date is when the current bullish stance was adopted", () => {
  const h = holding([
    thesis("Chamath", "bull", "2025-01-01T00:00:00.000Z"),
    thesis("Sacks", "bear", "2025-02-01T00:00:00.000Z"),
    thesis("Jason", "bull", "2025-03-01T00:00:00.000Z"),
  ]);

  assert.equal(isCurrentNetBull(h.theses, BESTIES), true);
  assert.equal(currentBullEntryDate(h, BESTIES), "2025-03-01");
  assert.deepEqual(currentBullHosts(h, BESTIES).sort(), ["Chamath", "Jason"]);
});

test("published quotes are trimmed to a verbatim prefix", () => {
  const quote = `${"word ".repeat(80)}tail`;
  const trimmed = trimPublishedQuote(quote);

  assert.equal(quote.startsWith(trimmed), true);
  assert.equal(trimmed.length <= MAX_PUBLISHED_QUOTE_CHARS, true);
  assert.equal(trimmed.endsWith(" "), false);
});

test("host exposure windows score explicit shorts but not legacy bearish exits", () => {
  const long = thesis("Chamath", "bull", "2025-01-01T00:00:00.000Z", {
    callType: "explicit_long",
  });
  const legacyExit = thesis("Chamath", "bear", "2025-02-01T00:00:00.000Z", {
    callType: "explicit_exit",
  });
  const explicitShort = thesis("Chamath", "bear", "2025-03-01T00:00:00.000Z", {
    callType: "explicit_short",
  });

  assert.equal(tradeDirectionForTake(legacyExit), null);
  assert.equal(tradeDirectionForTake(explicitShort), "short");

  assert.deepEqual(
    hostExposureWindows([long, legacyExit], "Chamath").map((w) => ({
      start: w.start,
      end: w.end,
      direction: w.direction,
    })),
    [{ start: "2025-01-01", end: "2025-02-01", direction: "long" }],
  );

  assert.deepEqual(
    hostExposureWindows([long, explicitShort], "Chamath").map((w) => ({
      start: w.start,
      end: w.end,
      direction: w.direction,
    })),
    [
      { start: "2025-01-01", end: "2025-03-01", direction: "long" },
      { start: "2025-03-01", end: null, direction: "short" },
    ],
  );
});

test("host exposure windows retain same-direction reaffirming calls without double-counting", () => {
  const first = thesis("Jason", "bull", "2025-01-01T00:00:00.000Z", {
    callType: "selection",
  });
  const reaffirm = thesis("Jason", "bull", "2025-02-01T00:00:00.000Z", {
    callType: "pair_trade",
  });

  const windows = hostExposureWindows([first, reaffirm], "Jason");

  assert.equal(windows.length, 1);
  assert.equal(windows[0].start, "2025-01-01");
  assert.equal(windows[0].direction, "long");
  assert.deepEqual(windows[0].reinforceTakes?.map((t) => t.id), [reaffirm.id]);
});

test("a private scored call is valid on its own — structural non-tradability is derived, not annotated", () => {
  const privateTake = thesis("Chamath", "bull", "2025-01-01T00:00:00.000Z", {
    id: "private-call",
    company: "PrivateCo",
    ticker: null,
    isPublic: false,
    callType: "explicit_long",
    scoreNote: "Chamath disclosed a private-company long",
  });
  const privateHolding = {
    ...holding([privateTake]),
    slug: "privateco",
    company: "PrivateCo",
    ticker: null,
    isPublic: false,
  };
  const snapshot: IndexSnapshot = {
    generatedAt: "2026-06-12T00:00:00.000Z",
    holdings: [privateHolding],
    episodesProcessed: 1,
  };

  // The ticker checks (isTradableCompanyExposure) keep this out of the fund; the
  // take itself needs no per-row exclusion field, so validation is clean.
  assert.deepEqual(validateIndexSnapshot(snapshot).errors, []);
});

test("prediction-round transcript picks are covered by audited receipts", () => {
  const transcript: Transcript = {
    episodeId: "E257",
    provider: "assemblyai",
    speakerMap: {
      A: "Jason",
      B: "Sacks",
      C: "Chamath",
    },
    utterances: [
      {
        cluster: "A",
        speaker: "Jason",
        text: "My prediction for 2026 is that Amazon is gonna have a massive year.",
        startMs: 2182916,
        endMs: 2185916,
      },
      {
        cluster: "B",
        speaker: "Sacks",
        text: "My number 1 is Huawei. Huawei's effort to partner with SMIC is firing on all cylinders.",
        startMs: 1984000,
        endMs: 1987000,
      },
      {
        cluster: "C",
        speaker: "Chamath",
        text: "I will pick the software industrial complex because AI will shrink that market aggressively.",
        startMs: 2583000,
        endMs: 2586000,
      },
    ],
    meta: {},
  };
  const candidates = auditTranscriptCandidates("E257", transcript);

  // Match by canonical company (stable) rather than the per-episode thesis id,
  // whose numeric suffix shifts every time the episode is re-extracted.
  const amazon = candidates.find(
    (c) => c.speaker === "Jason" && c.text.includes("Amazon is gonna have a massive year"),
  );
  assert.equal(amazon?.coverage, "portfolio");
  assert.equal(amazon?.matches.some((m) => m.company === "Amazon"), true);

  // Huawei is named explicitly but isn't a tradable exposure (no listed ticker),
  // so the receipt is scored-but-excluded from the fund.
  const huawei = candidates.find(
    (c) => c.speaker === "Sacks" && c.text.includes("My number 1 is Huawei"),
  );
  assert.equal(huawei?.coverage, "excluded");
  assert.equal(huawei?.matches.some((m) => m.company === "Huawei"), true);

  // A sector/theme pick ("the software industrial complex") is covered by a
  // receipt but never portfolio-scored — it resolves to a SaaS-sector opinion,
  // not a tradable single name. Whether the extractor files it as an excluded
  // scoreable call or a non-scoreable view drifts between runs; the durable
  // contract is "covered, but not in the portfolio".
  const software = candidates.find(
    (c) => c.speaker === "Chamath" && c.text.includes("software industrial complex"),
  );
  assert.ok(software, "software-sector pick should produce a candidate");
  assert.notEqual(software?.coverage, "missing");
  assert.notEqual(software?.coverage, "portfolio");
  assert.equal(
    software?.matches.some((m) => /software industrial complex|saas/i.test(m.company)),
    true,
  );
});

test("explicit pair-trade language is not suppressed by startup context", () => {
  const transcript: Transcript = {
    episodeId: "E252",
    provider: "assemblyai",
    speakerMap: {
      A: "Jason",
    },
    utterances: [
      {
        cluster: "A",
        speaker: "Jason",
        text: "I think the short in all of this, if you were going to put on the pair trade, is short OpenAI, which I think is overvalued and is going to go down. And I think I would be long Google, Groq, and Anthropic. I don't think the startup community is trusting OpenAI with their data.",
        startMs: 2284750,
        endMs: 2374750,
      },
    ],
    meta: {},
  };

  const candidates = auditTranscriptCandidates("E252", transcript);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].coverage, "portfolio");
  // Both legs of the pair trade are picked up (Google long, OpenAI short),
  // matched by canonical company so the assertion survives re-extraction.
  assert.equal(candidates[0].matches.some((m) => m.company === "Google"), true);
  assert.equal(candidates[0].matches.some((m) => m.company === "OpenAI"), true);
});
