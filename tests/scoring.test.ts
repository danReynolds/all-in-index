import assert from "node:assert/strict";
import test from "node:test";
import { currentStanceForHosts, hostExposureWindows, tradeDirectionForTake } from "../lib/calls";
import { isMacroAsset, proxyAssetKind } from "../lib/assets";
import { MAX_PUBLISHED_QUOTE_CHARS, trimPublishedQuote } from "../lib/quotes";
import { auditTranscriptCandidates } from "../pipeline/take-candidate-audit";
import { attachSectorProxy, shouldKeepThesisForIndex } from "../pipeline/build-index";
import { validateIndexSnapshot } from "../pipeline/quality";
import { dedupeOverlappingTheses, repairQuoteOwnership, snapQuoteTimestamps, stampAttribution } from "../pipeline/run-episode";
import type { IndexSnapshot, Transcript } from "../lib/types";
import {
  BESTIES,
  hasCurrentLong,
  currentLongEntryDate,
  currentLongHosts,
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
});

test("the index holds a name from its open long CALL and ignores bullish views", () => {
  const h = holding([
    thesis("Sacks", "bull", "2025-01-01T00:00:00.000Z", { callType: "explicit_long" }),
    thesis("Jason", "bull", "2025-02-01T00:00:00.000Z", { callType: "view" }),
    thesis("Chamath", "bull", "2025-03-01T00:00:00.000Z", { callType: "explicit_long" }),
  ]);

  assert.equal(hasCurrentLong(h.theses, BESTIES), true);
  // entry = the EARLIEST still-open long call, never a later bullish view
  assert.equal(currentLongEntryDate(h, BESTIES), "2025-01-01");
  // the view-only host (Jason) is not a holder — only the actual longs are
  assert.deepEqual(currentLongHosts(h, BESTIES).sort(), ["Chamath", "Sacks"]);
});

test("a host who flips out of their long no longer holds it (no open long window)", () => {
  const h = holding([
    thesis("Chamath", "bull", "2025-01-01T00:00:00.000Z", { callType: "explicit_long" }),
    thesis("Chamath", "bear", "2025-04-01T00:00:00.000Z", { callType: "explicit_short" }),
  ]);
  assert.equal(hasCurrentLong(h.theses, BESTIES), false);
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

test("shared quote filtering preserves call-shaped basket legs", () => {
  const sharedView = thesis("Guest", "bull", "2026-05-08T00:00:00.000Z", {
    id: "shared-view",
    company: "Micron Technology",
    ticker: "MU",
    callType: "view",
    quote: "The memory stocks are exciting: SK Hynix, Samsung, Micron.",
  });
  const sharedLong = thesis("Guest", "bull", "2026-05-08T00:00:00.000Z", {
    id: "shared-long",
    company: "Micron Technology",
    ticker: "MU",
    callType: "explicit_long",
    quote: "We have 25% of our portfolio in SK Hynix, Samsung, Micron.",
    scoreNote: "Shared memory-stock long basket; Micron named in the quote.",
  });
  const sharedBasket = thesis("Chamath", "bear", "2026-01-10T00:00:00.000Z", {
    id: "shared-basket",
    company: "Public SaaS / Software Industrial Complex",
    ticker: null,
    callType: "basket",
    quote: "I will pick the software industrial complex.",
    scoreNote: "Named basket pick.",
  });

  assert.equal(shouldKeepThesisForIndex(sharedView, 3), false);
  assert.equal(shouldKeepThesisForIndex(sharedLong, 3), true);
  assert.equal(shouldKeepThesisForIndex(sharedBasket, 3), true);
  assert.equal(
    shouldKeepThesisForIndex(
      thesis("Jason", "neutral", "2026-01-01T00:00:00.000Z", {
        conviction: "low",
      }),
      1,
    ),
    false,
  );
});

test("quality allows intentional shared call quotes but rejects duplicate view quotes", () => {
  const quote = "We have 25% of our portfolio in SK Hynix, Samsung, Micron.";
  const sharedCallA = thesis("Guest", "bull", "2026-05-08T00:00:00.000Z", {
    id: "shared-call-a",
    company: "SK Hynix",
    ticker: null,
    isPublic: false,
    callType: "explicit_long",
    quote,
    scoreNote: "Shared memory-stock long basket; SK Hynix named in the quote.",
  });
  const sharedCallB = thesis("Guest", "bull", "2026-05-08T00:00:00.000Z", {
    id: "shared-call-b",
    company: "Micron Technology",
    ticker: null,
    isPublic: false,
    callType: "explicit_long",
    quote,
    scoreNote: "Shared memory-stock long basket; Micron named in the quote.",
  });
  const sharedViewA = thesis("Guest", "bull", "2026-05-08T00:00:00.000Z", {
    id: "shared-view-a",
    company: "Alpha",
    ticker: null,
    isPublic: false,
    callType: "view",
    quote: "These companies are examples of the broader AI infrastructure theme.",
  });
  const sharedViewB = thesis("Guest", "bull", "2026-05-08T00:00:00.000Z", {
    id: "shared-view-b",
    company: "Beta",
    ticker: null,
    isPublic: false,
    callType: "view",
    quote: "These companies are examples of the broader AI infrastructure theme.",
  });
  const snapshot: IndexSnapshot = {
    generatedAt: "2026-06-18T00:00:00.000Z",
    episodesProcessed: 1,
    holdings: [
      { ...holding([sharedCallA]), slug: "sk-hynix", company: "SK Hynix", ticker: null, isPublic: false },
      { ...holding([sharedCallB]), slug: "micron", company: "Micron Technology", ticker: null, isPublic: false },
    ],
  };

  assert.deepEqual(validateIndexSnapshot(snapshot).errors, []);

  const duplicateViewSnapshot: IndexSnapshot = {
    ...snapshot,
    holdings: [
      { ...holding([sharedViewA]), slug: "alpha", company: "Alpha", ticker: null, isPublic: false },
      { ...holding([sharedViewB]), slug: "beta", company: "Beta", ticker: null, isPublic: false },
    ],
  };
  assert.match(validateIndexSnapshot(duplicateViewSnapshot).errors.join("\n"), /quote reused across companies/);
});

test("quote ownership repair follows the transcript speaker label", () => {
  const take = thesis("Chamath", "bear", "2026-01-10T00:00:00.000Z", {
    id: "E257-software-Chamath-0",
    company: "Software Industrial Complex",
    ticker: null,
    isPublic: false,
    callType: "basket",
    quote: "I will pick the software industrial complex.",
  });
  const transcript: Transcript = {
    episodeId: "E257",
    provider: "assemblyai",
    speakerMap: { A: "Jason", B: "Friedberg" },
    speakerConfidence: { A: "high", B: "high" },
    utterances: [
      {
        cluster: "A",
        speaker: "Jason",
        text: "Chamath, who's your loser 2026?",
        startMs: 2565000,
        endMs: 2569000,
      },
      {
        cluster: "B",
        speaker: "Friedberg",
        text: "I will pick the software industrial complex.",
        startMs: 2583000,
        endMs: 2587000,
      },
    ],
    meta: {},
  };

  repairQuoteOwnership([take], transcript);
  stampAttribution([take], transcript);

  assert.equal(take.host, "Friedberg");
  assert.equal(take.id, "E257-software-Friedberg-0");
  assert.equal(take.attributionConfidence, "high");
});

test("a sector pick gets its LLM-chosen ETF proxy; takes without one stay untickered", () => {
  // The LLM names the representative ETF in Thesis.sectorProxy; attachSectorProxy
  // just looks it up. No text matching — its absence IS the gate.
  const clearSector = thesis("Friedberg", "bull", "2026-01-10T00:00:00.000Z", {
    company: "Critical metals basket",
    ticker: null,
    isPublic: false,
    callType: "basket",
    sectorProxy: "REMX",
    quote: "I would pick a basket of critical metals.",
  });
  attachSectorProxy(clearSector);
  assert.equal(clearSector.ticker, "REMX");
  assert.equal(clearSector.isPublic, true);
  assert.equal(proxyAssetKind(clearSector.ticker), "sector");
  assert.equal(isMacroAsset(clearSector.ticker), true);

  // No sectorProxy → nothing attached (a private single-name pick, or a macro
  // short with no representative ETF). The pick stays untickered, not mispriced.
  const privateCompanyPick = thesis("Sacks", "bull", "2026-01-10T00:00:00.000Z", {
    company: "Huawei",
    ticker: null,
    isPublic: false,
    callType: "selection",
    quote: "My number 1 is Huawei, which I've mentioned in the past out of China.",
  });
  attachSectorProxy(privateCompanyPick);
  assert.equal(privateCompanyPick.ticker, null);

  const nonMag7Short = thesis("Friedberg", "bear", "2025-06-21T00:00:00.000Z", {
    company: "S&P 493 (non-Mag7 S&P 500)",
    ticker: null,
    isPublic: false,
    callType: "explicit_short",
    quote: "it's an opportunity to short the S&P",
  });
  attachSectorProxy(nonMag7Short);
  assert.equal(nonMag7Short.ticker, null);

  // A direct-ticker pick is left alone even if it also carries a proxy hint.
  const alreadyTickered = thesis("Chamath", "bull", "2026-01-10T00:00:00.000Z", {
    company: "Nvidia",
    ticker: "NVDA",
    callType: "selection",
    sectorProxy: "MAGS",
  });
  attachSectorProxy(alreadyTickered);
  assert.equal(alreadyTickered.ticker, "NVDA");
});

test("quote snapping uses the answer utterance at prompt boundaries", () => {
  const take = thesis("Chamath", "bull", "2026-01-10T00:00:00.000Z", {
    id: "E232-tsla-Chamath-4",
    callType: "selection",
    quote: "Tesla's one and Google's two... I think that Tesla has the best vision models.",
    quoteStartMs: 999,
  });
  const transcript: Transcript = {
    episodeId: "E232",
    provider: "assemblyai",
    speakerMap: { A: "Jason", B: "Chamath" },
    speakerConfidence: { A: "high", B: "high" },
    utterances: [
      { cluster: "A", speaker: "Jason", text: "Chamath, who's your number one and number two?", startMs: 0, endMs: 1000 },
      {
        cluster: "B",
        speaker: "Chamath",
        text: "Tesla's one and Google's two. And the reason is because they are the closest to having that vertically integrated stack. I think that Tesla has the best vision models.",
        startMs: 1000,
        endMs: 8000,
      },
    ],
    meta: {},
  };

  snapQuoteTimestamps([take], transcript);
  stampAttribution([take], transcript);

  assert.equal(take.quoteStartMs, 1000);
  assert.equal(take.attributionConfidence, "high");
});

test("quote ownership repair can match same-speaker ellipses across adjacent utterances", () => {
  const take = thesis("Chamath", "bear", "2026-01-10T00:00:00.000Z", {
    id: "E257-saas-software-industrial-complex-basket-Chamath-5",
    company: "SaaS / software industrial complex (basket)",
    ticker: null,
    isPublic: false,
    callType: "selection",
    quote:
      "I will pick the software industrial complex... I think you're going to see that total economic opportunity shrink and contract aggressively... It's going to impact SaaS companies, public SaaS companies particularly, quite severely in 2026.",
    quoteStartMs: 2583000,
    attributionConfidence: "low",
  });
  const transcript: Transcript = {
    episodeId: "E257",
    provider: "assemblyai",
    speakerMap: { D: "Friedberg" },
    speakerConfidence: { D: "high" },
    utterances: [
      {
        cluster: "D",
        speaker: "Friedberg",
        text:
          "I will pick the software industrial complex. So these are the companies that sell licensed SaaS to the corporations of America. I think you're going to see that total economic opportunity shrink and contract aggressively.",
        startMs: 2583450,
        endMs: 2669950,
      },
      {
        cluster: "D",
        speaker: "Friedberg",
        text:
          "It's going to impact SaaS companies, public SaaS companies particularly, quite severely in 2026.",
        startMs: 2672490,
        endMs: 2690000,
      },
    ],
    meta: {},
  };

  repairQuoteOwnership([take], transcript);
  snapQuoteTimestamps([take], transcript);
  stampAttribution([take], transcript);

  assert.equal(take.host, "Friedberg");
  assert.equal(take.id, "E257-saas-software-industrial-complex-basket-Friedberg-5");
  assert.equal(take.attributionConfidence, "high");
});

test("overlapping company and asset rows dedupe to the ticker-backed row", () => {
  const companyTake = thesis("Friedberg", "bull", "2026-01-10T00:00:00.000Z", {
    id: "E257-copper-Friedberg-2",
    company: "Copper",
    ticker: null,
    isPublic: false,
    callType: "selection",
    quote: "I will pick Copper... The asset that is set up to go absolutely parabolic is copper.",
    quoteStartMs: 2067000,
    attributionConfidence: "high",
  });
  const assetTake = thesis("Friedberg", "bull", "2026-01-10T00:00:00.000Z", {
    id: "E257-cper-Friedberg-a0",
    company: "Copper",
    ticker: "CPER",
    isPublic: true,
    callType: "selection",
    quote: "I will pick Copper... The asset that is set up to go absolutely parabolic is copper.",
    quoteStartMs: 2067000,
    attributionConfidence: "high",
  });

  const deduped = dedupeOverlappingTheses([companyTake, assetTake]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, "E257-cper-Friedberg-a0");
});

test("commodity quote ownership repair dedupes to the canonical asset proxy", () => {
  const companyTake = thesis("Chamath", "bull", "2026-01-10T00:00:00.000Z", {
    id: "E257-copx-Chamath-3",
    company: "Copper (commodity basket)",
    ticker: "COPX",
    isPublic: true,
    callType: "selection",
    quote:
      "I will pick Copper... The asset that is set up to go absolutely parabolic is copper... it is the most useful, cheap, amenable, conductive material that we have... we are on a path by 2040 where we will be short about 70% of the global",
    quoteStartMs: 2067000,
    attributionConfidence: "low",
  });
  const assetTake = thesis("Friedberg", "bull", "2026-01-10T00:00:00.000Z", {
    id: "E257-cper-Friedberg-a0",
    company: "Copper",
    ticker: "CPER",
    isPublic: true,
    callType: "selection",
    quote:
      "I will pick Copper... the asset that is set up to go absolutely parabolic is copper... we are on a path by 2040 where we will be short about 70% of the global supply at current course and speed.",
    quoteStartMs: 2067060,
    attributionConfidence: "high",
  });
  const transcript: Transcript = {
    episodeId: "E257",
    provider: "assemblyai",
    speakerMap: { D: "Friedberg", B: "Jason" },
    speakerConfidence: { D: "high", B: "high" },
    utterances: [
      {
        cluster: "D",
        speaker: "Friedberg",
        text:
          "I will pick Copper. Okay, Copper. We are still completely underestimating how short we are in terms of the global demand-supply dynamics of a handful of critical elements that we need. The asset that is set up to go absolutely parabolic is copper. And the reason is that it is, at least as it stands today, the most useful, cheap, amenable, conductive material that we have. And right now, Jason, we are on a path by 2040 where we will be short about 70% of the global supply at current course and speed.",
        startMs: 2067060,
        endMs: 2137370,
      },
      {
        cluster: "B",
        speaker: "Jason",
        text: "I will pick copper. Sachs, what do you got?",
        startMs: 2137370,
        endMs: 2142850,
      },
    ],
    meta: {},
  };

  const repaired = [companyTake, assetTake];
  repairQuoteOwnership(repaired, transcript);
  snapQuoteTimestamps(repaired, transcript);
  stampAttribution(repaired, transcript);
  const deduped = dedupeOverlappingTheses(repaired);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, "E257-cper-Friedberg-a0");
  assert.equal(deduped[0].host, "Friedberg");
  assert.equal(deduped[0].ticker, "CPER");
  assert.equal(deduped[0].attributionConfidence, "high");
});

test("a commodity short filed under two names dedupes to one proxy-backed row", () => {
  // Regression: the same Friedberg oil short survived as two scored rows because
  // "Oil" and "Hydrocarbons … basket" normalize to different entity keys. Dedup
  // is now proxy-aware — both resolve to USO — so they collapse to the ticker row.
  const basketRow = thesis("Friedberg", "bear", "2026-01-10T00:00:00.000Z", {
    id: "E257-hydrocarbons-oil-commodity-basket-Friedberg-8",
    company: "Hydrocarbons / oil commodity basket",
    ticker: null,
    isPublic: false,
    callType: "basket",
    quote: "I won't say the worst performing, but I think a very poor performing asset will be hydrocarbons.",
    quoteStartMs: 4264000,
    attributionConfidence: "high",
  });
  const assetRow = thesis("Friedberg", "bear", "2026-01-10T00:00:00.000Z", {
    id: "E257-uso-Friedberg-a1",
    company: "Oil",
    ticker: "USO",
    isPublic: true,
    callType: "selection",
    quote: "I think a very poor performing asset will be hydrocarbons. The trend in oil is inexorable and it's down.",
    quoteStartMs: 4268135,
    attributionConfidence: "high",
  });

  const deduped = dedupeOverlappingTheses([basketRow, assetRow]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].ticker, "USO");
});

test("same-direction restatements merge however far apart, keeping the stronger row", () => {
  // Regression for E250: Chamath stated "I'm long OpenAI" twice ~29 min apart
  // with different, non-overlapping quotes. These share no timestamp window and
  // no quote substring, so the old (≤5s OR quoteMatches) rule kept both — one
  // position counted twice. Same host + exposure + direction is now one call.
  const first = thesis("Chamath", "bull", "2026-01-10T00:00:00.000Z", {
    id: "E250-openai-Chamath-2",
    company: "OpenAI",
    ticker: null,
    isPublic: false,
    callType: "explicit_long",
    quote: "I'm long OpenAI, it's the single biggest position I have.",
    quoteStartMs: 600_000,
    attributionConfidence: "high",
  });
  const restated = thesis("Chamath", "bull", "2026-01-10T00:00:00.000Z", {
    id: "E250-openai-Chamath-9",
    company: "OpenAI",
    ticker: null,
    isPublic: false,
    callType: "explicit_long",
    quote: "This is the biggest supercycle of all and I am betting the whole thing on it.",
    quoteStartMs: 2_340_000,
    attributionConfidence: "high",
    scoreNote: "Restated long on OpenAI.",
  });

  const deduped = dedupeOverlappingTheses([first, restated]);

  assert.equal(deduped.length, 1);
  // The scoreNote gives `restated` the higher rank, so it survives the merge.
  assert.equal(deduped[0].id, "E250-openai-Chamath-9");
});

test("an opposite-direction call on the same name is a flip, never a merge", () => {
  // The opposed-stance guard is the only thing keeping a genuine bull→bear flip
  // from collapsing into one row. Pin it: a long and a short on the same name by
  // the same host stay two distinct calls.
  const long = thesis("Chamath", "bull", "2026-01-10T00:00:00.000Z", {
    id: "E260-tsla-Chamath-1",
    company: "Tesla",
    ticker: "TSLA",
    callType: "explicit_long",
    quote: "I'm long Tesla here.",
    quoteStartMs: 100_000,
  });
  const short = thesis("Chamath", "bear", "2026-01-10T00:00:00.000Z", {
    id: "E260-tsla-Chamath-7",
    company: "Tesla",
    ticker: "TSLA",
    callType: "explicit_short",
    quote: "I flipped — this is a short now.",
    quoteStartMs: 200_000,
  });

  const deduped = dedupeOverlappingTheses([long, short]);

  assert.equal(deduped.length, 2);
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
        speaker: "Friedberg",
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
    (c) => c.speaker === "Friedberg" && c.text.includes("software industrial complex"),
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
