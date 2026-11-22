import assert from "node:assert/strict";
import test from "node:test";
import { selectLatestEpisodeInsights } from "../lib/latest-episode-insights";
import type { EpisodeMeta, Holding, Thesis } from "../lib/types";

const latest: EpisodeMeta = {
  title: "The newest episode",
  date: "2026-11-20T22:14:00.000Z",
  number: 298,
  audioUrl: "https://example.com/episode.mp3",
  link: null,
};
const older = { ...latest, date: "2026-11-14T02:35:00.000Z", number: 297 };
const episodes = { E298: latest, E297: older };

function call(id: string, overrides: Partial<Thesis> = {}): Thesis {
  return {
    id,
    episodeId: "E298",
    episodeNumber: latest.number,
    episodeDate: latest.date,
    company: "Example company",
    ticker: null,
    isPublic: false,
    host: "Jason",
    stance: "bull",
    conviction: "medium",
    callType: "explicit_long",
    summary: "He described buying the company.",
    quote: "I bought it because I believe in the product.",
    quoteStartMs: null,
    topics: [],
    attributionConfidence: "medium",
    ...overrides,
  };
}

function holding(slug: string, ...theses: Thesis[]): Holding {
  return {
    slug,
    company: slug,
    ticker: null,
    isPublic: false,
    theses,
    synthesis: "",
    netStance: "neutral",
    firstMentioned: latest.date,
    lastMentioned: latest.date,
    mentionCount: theses.length,
    market: null,
  };
}

test("the latest episode is chosen by date even if only an older episode has eligible calls", () => {
  const oldCall = call("older", { episodeId: "E297", episodeDate: older.date });
  const idWithLaterDate = { ...latest, title: "Dated after the numbered episodes", number: null };
  const holdings = [holding("example", oldCall)];
  const selected = selectLatestEpisodeInsights({
    episodes: { E297: older, special: idWithLaterDate },
    holdings,
  });

  assert.deepEqual(selected, { episodeId: "special", episode: idWithLaterDate, calls: [] });
  assert.equal(selectLatestEpisodeInsights({ holdings }), null);
});

test("the feature requires an actionable call with known ownership, usable confidence, and source text", () => {
  const theses = [
    call("background", { callType: "view" }),
    call("tentative", { conviction: "low" }),
    call("unverified", { attributionConfidence: "low" }),
    call("legacy", { attributionConfidence: undefined }),
    call("excluded", { excludeReason: "conditional" }),
    call("unknown", { host: "Unknown" }),
    call("unnamed", { host: "Guest", guestName: " " }),
    call("mixed", { callType: "pair_trade", stance: "mixed" }),
    call("no-quote", { quote: "  " }),
    call("no-summary", { summary: "\n" }),
    call("eligible", { attributionConfidence: "high" }),
  ];
  const selected = selectLatestEpisodeInsights({ episodes, holdings: theses.map((take) => holding(take.id, take)) });

  assert.deepEqual(selected?.calls.map(({ take }) => take.id), ["eligible"]);
});

test("a short and an exit can be featured without a market price, and timestamps must be finite and nonnegative", () => {
  const short = call("short", { host: "Friedberg", callType: "explicit_short", stance: "neutral", quoteStartMs: 0 });
  const exit = call("exit", { host: "Sacks", callType: "explicit_exit", quoteStartMs: -1 });
  const long = call("long", { conviction: "high", quoteStartMs: Number.POSITIVE_INFINITY });
  const selected = selectLatestEpisodeInsights({ episodes, holdings: [holding("example", short, exit, long)] });

  assert.deepEqual(selected?.calls.map(({ speaker, action, startMs }) => [speaker, action, startMs]), [
    ["Jason", "Long call", null],
    ["Sacks", "Exit", null],
    ["Friedberg", "Short call", 0],
  ]);
});

test("ranked calls are deduplicated per company and person before the three-call cap", () => {
  const duplicateJason = call("00-jason-duplicate", { attributionConfidence: "high" });
  const jason = call("03-jason", { conviction: "high", attributionConfidence: "high" });
  const alexDuplicate = call("01-alex-duplicate", { host: "Guest", guestName: "ALEX   TRENT" });
  const alex = call("02-alex", { host: "Guest", guestName: "Alex Trent", conviction: "high", attributionConfidence: "high" });
  const bailey = call("04-bailey", { host: "Guest", guestName: "Bailey Silva", conviction: "high" });
  const example = holding("example", duplicateJason, jason, alexDuplicate, alex, bailey);
  const another = holding("another", call("05-friedberg", { host: "Friedberg", conviction: "high" }));
  const selected = selectLatestEpisodeInsights({ episodes, holdings: [another, example] });

  assert.deepEqual(selected?.calls.map(({ take }) => take.id), [alex.id, jason.id, bailey.id]);
  assert.deepEqual(example.theses, [duplicateJason, jason, alexDuplicate, alex, bailey]);
});

test("the later sourced action wins conflicting calls from the same speaker and company", () => {
  const early = call("early-long", { conviction: "high", attributionConfidence: "high", quoteStartMs: 2_000 });
  const late = call("late-exit", { callType: "explicit_exit", quoteStartMs: 3_000 });
  const holdings = [holding("example", early, late)];

  assert.equal(selectLatestEpisodeInsights({ episodes, holdings })?.calls[0].action, "Exit");

  const undated = [holding("example", early, { ...late, quoteStartMs: null })];
  assert.equal(selectLatestEpisodeInsights({ episodes, holdings: undated })?.calls[0].action, "Long call");
});
