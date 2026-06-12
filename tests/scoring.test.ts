import assert from "node:assert/strict";
import test from "node:test";
import { currentStanceForHosts, hostExposureWindows, tradeDirectionForTake } from "../lib/calls";
import { MAX_PUBLISHED_QUOTE_CHARS, trimPublishedQuote } from "../lib/quotes";
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
    positional: false,
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
    positional: true,
    callType: "explicit_long",
    tradeDirection: "long",
  });
  const legacyExit = thesis("Chamath", "bear", "2025-02-01T00:00:00.000Z", {
    positional: true,
  });
  const explicitShort = thesis("Chamath", "bear", "2025-03-01T00:00:00.000Z", {
    positional: true,
    callType: "explicit_short",
    tradeDirection: "short",
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
