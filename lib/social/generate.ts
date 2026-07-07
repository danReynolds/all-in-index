import { isScoredPosition } from "../calls";
import { fmtDate, pct } from "../format";
import {
  activeDuels,
  computeAwards,
} from "../insights";
import type { Host, IndexConstituent, IndexSnapshot } from "../types";
import { applySocialPolicy } from "./policy";
import { filterFreshCandidates } from "./ledger";
import type {
  SocialCandidate,
  SocialDraftBundle,
  SocialKind,
  SocialLedgerEntry,
  SkippedSocialCandidate,
} from "./types";

const DEFAULT_SITE_URL = "https://allindex.fyi";

interface PredictionLike {
  host: Host;
  guestName?: string | null;
  category: string;
  pick: string;
  ticker?: string | null;
  proxyTicker?: string | null;
  sinceReturn?: number | null;
}

export interface PredictionsFileLike {
  episodes: Array<{
    id: string;
    title: string;
    date: string;
    year: number;
    predictions: PredictionLike[];
  }>;
}

export interface GenerateSocialOptions {
  siteUrl?: string;
  now?: Date;
  kinds?: SocialKind[];
  scheduleIds?: string[];
  ledgerEntries?: SocialLedgerEntry[];
  includeRecentlyUsed?: boolean;
  minDaysBetweenSimilarTopics?: number;
  predictions?: PredictionsFileLike | null;
}

function pp(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "n/a";
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}pp`;
}

function absUrl(siteUrl: string, route: string): string {
  return new URL(route, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`).toString();
}

function hostList(hosts: readonly Host[]): string {
  if (hosts.length <= 1) return hosts[0] ?? "the besties";
  if (hosts.length === 2) return `${hosts[0]} and ${hosts[1]}`;
  return `${hosts.slice(0, -1).join(", ")}, and ${hosts[hosts.length - 1]}`;
}

function slugPart(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
  return slug || "topic";
}

function candidateBase(opts: {
  now: Date;
  siteUrl: string;
  scheduleId: string;
  kind: SocialKind;
  title: string;
  topicKey: string;
  route: string;
  mainPost: string;
  threadPosts?: string[];
  linkReplyLabel?: string;
  risk: SocialCandidate["risk"];
  reviewRequired: boolean;
  autoPublishEligible: boolean;
  evidence: SocialCandidate["evidence"];
  visual?: SocialCandidate["visual"];
  policyNotes?: string[];
}): SocialCandidate {
  const url = absUrl(opts.siteUrl, opts.route);
  const id = `${opts.scheduleId}:${opts.now.toISOString().slice(0, 10)}:${slugPart(opts.topicKey)}`;
  return applySocialPolicy({
    id,
    scheduleId: opts.scheduleId,
    kind: opts.kind,
    title: opts.title,
    mainPost: opts.mainPost.trim(),
    threadPosts: opts.threadPosts?.map((p) => p.trim()).filter(Boolean) ?? [],
    linkReply: `${opts.linkReplyLabel ?? "Full scoreboard"}: ${url}`.trim(),
    route: opts.route,
    url,
    topicKey: opts.topicKey,
    risk: opts.risk,
    reviewRequired: opts.reviewRequired,
    autoPublishEligible: opts.autoPublishEligible,
    createdAt: opts.now.toISOString(),
    evidence: opts.evidence,
    visual: opts.visual,
    policyNotes: opts.policyNotes ?? [],
  });
}

function sortedByAlpha(constituents: IndexConstituent[]): IndexConstituent[] {
  return constituents.slice().sort((a, b) => b.alpha - a.alpha);
}

function cashtag(ticker: string): string {
  return `$${ticker.replace(/^\$/, "")}`;
}

function reportQuarter(now: Date): { year: number; quarter: number; label: string } {
  const month = now.getUTCMonth();
  let year = now.getUTCFullYear();
  let quarter = Math.floor(month / 3) + 1;
  if ([0, 3, 6, 9].includes(month) && now.getUTCDate() <= 14) {
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return { year, quarter, label: `Q${quarter} ${year}` };
}

function portfolioPulse(s: IndexSnapshot, now: Date, siteUrl: string): SocialCandidate | null {
  const fund = s.indexFund;
  if (!fund || fund.constituents.length === 0) return null;
  const byAlpha = sortedByAlpha(fund.constituents);
  const top = byAlpha[0];
  const wins = fund.constituents.filter((c) => c.alpha > 0).length;
  const mainPost = [
    `The All-In portfolio is beating the S&P by ${pp(fund.outperformance)}.`,
    "",
    `Besties Index: ${pct(fund.portfolioReturn)}`,
    `S&P 500: ${pct(fund.benchmarkReturn)}`,
    "",
    `${fund.constituents.length} live longs; ${wins} are beating the benchmark.`,
    `Biggest open receipt: ${cashtag(top.ticker)} ${pp(top.alpha)} alpha.`,
  ].join("\n");

  return candidateBase({
    now,
    siteUrl,
    scheduleId: "weekly-portfolio-pulse",
    kind: "portfolio_pulse",
    title: "Weekly portfolio pulse",
    topicKey: "index:besties",
    route: "/the-index",
    mainPost,
    linkReplyLabel: "Full scoreboard",
    risk: "low",
    reviewRequired: false,
    autoPublishEligible: true,
    evidence: [
      { type: "index", id: "besties-index", label: "Besties Index", urlPath: "/the-index" },
      { type: "holding", id: top.slug, label: `${top.company} (${top.ticker})`, urlPath: `/holding/${top.slug}`, hosts: top.hosts },
    ],
    visual: {
      kind: "scorecard_svg",
      title: "Besties Index Check-In",
      subtitle: `${fund.constituents.length} live longs as of ${fmtDate(fund.asOf)}`,
      stats: [
        { label: "Besties", value: pct(fund.portfolioReturn), tone: fund.portfolioReturn >= 0 ? "positive" : "negative" },
        { label: "S&P", value: pct(fund.benchmarkReturn), tone: fund.benchmarkReturn >= 0 ? "positive" : "negative" },
        { label: "Edge", value: pp(fund.outperformance), tone: fund.outperformance >= 0 ? "positive" : "negative" },
        { label: "Top Call", value: top.ticker, tone: "neutral" },
      ],
      footer: `Top open call: ${top.company} (${top.ticker}), ${pp(top.alpha)} vs S&P.`,
      alt: `Besties Index ${pct(fund.portfolioReturn)} versus S&P ${pct(fund.benchmarkReturn)}, edge ${pp(fund.outperformance)}.`,
    },
  });
}

function receipt(s: IndexSnapshot, now: Date, siteUrl: string): SocialCandidate | null {
  const fund = s.indexFund;
  if (!fund || fund.constituents.length === 0) return null;
  const top = sortedByAlpha(fund.constituents)[0];
  const verb = top.hosts.length === 1 ? "has" : "have";
  const mainPost = [
    "This is why the receipts matter.",
    "",
    `${hostList(top.hosts)} still ${top.direction === "short" ? `${verb} a short call on` : `${verb} an open long call on`} ${top.company} ${cashtag(top.ticker)}.`,
    "",
    `Since entry: ${pct(top.sinceReturn)}`,
    `S&P same window: ${pct(top.benchmarkReturn)}`,
    `Alpha: ${pp(top.alpha)}`,
  ].join("\n");

  return candidateBase({
    now,
    siteUrl,
    scheduleId: "weekly-receipt",
    kind: "receipt",
    title: `Receipt: ${top.company}`,
    topicKey: `holding:${top.slug}:receipt`,
    route: `/holding/${top.slug}`,
    mainPost,
    threadPosts: [
      "The index keeps the call open until a later scored take closes or flips it. Commentary alone does not move the simulated portfolio.",
    ],
    linkReplyLabel: "Call receipt",
    risk: "medium",
    reviewRequired: true,
    autoPublishEligible: false,
    evidence: [
      { type: "holding", id: top.slug, label: `${top.company} (${top.ticker})`, urlPath: `/holding/${top.slug}`, hosts: top.hosts },
    ],
  });
}

function latestEpisode(s: IndexSnapshot, now: Date, siteUrl: string): SocialCandidate | null {
  const episodes = Object.entries(s.episodes ?? {})
    .map(([id, meta]) => ({ id, ...meta }))
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const episode of episodes) {
    const takesByHolding = s.holdings
      .map((holding) => ({
        holding,
        takes: holding.theses.filter((t) => t.episodeId === episode.id),
      }))
      .filter((group) => group.takes.length > 0)
      .sort((a, b) => b.takes.length - a.takes.length);
    if (takesByHolding.length === 0) continue;
    const takes = takesByHolding.flatMap((group) => group.takes);
    const scored = takes.filter(isScoredPosition);
    const stance = {
      bull: takes.filter((t) => t.stance === "bull").length,
      bear: takes.filter((t) => t.stance === "bear").length,
      mixed: takes.filter((t) => t.stance === "mixed").length,
      neutral: takes.filter((t) => t.stance === "neutral").length,
    };
    const companies = takesByHolding.slice(0, 4).map((g) => g.holding.company);
    const episodeLabel = episode.number ? `E${episode.number}` : episode.id;
    const headline = scored.length > 0
      ? `${episodeLabel} added ${scored.length} portfolio-scored call${scored.length === 1 ? "" : "s"} to The All-Index.`
      : `${episodeLabel} is indexed. The scorecard is quiet this week.`;
    const mainPost = [
      headline,
      "",
      `${takes.length} tracked takes across ${takesByHolding.length} names.`,
      `Portfolio-scored calls: ${scored.length}.`,
      "",
      `Most discussed: ${companies.join(", ")}.`,
      `Stance mix: ${stance.bull} bull / ${stance.bear} bear / ${stance.mixed} mixed / ${stance.neutral} neutral.`,
    ].join("\n");

    return candidateBase({
      now,
      siteUrl,
      scheduleId: "latest-episode-recap",
      kind: "episode_recap",
      title: `Latest episode recap: ${episodeLabel}`,
      topicKey: `episode:${episode.id}`,
      route: `/episode/${episode.id}`,
      mainPost,
      threadPosts: [
        "Each take is tied back to an attributed excerpt, then public names are marked to market against the same-window S&P.",
      ],
      linkReplyLabel: "Episode scorecard",
      risk: "high",
      reviewRequired: true,
      autoPublishEligible: false,
      evidence: [
        { type: "episode", id: episode.id, label: `${episodeLabel}: ${episode.title}`, urlPath: `/episode/${episode.id}` },
      ],
    });
  }
  return null;
}

function openDuel(s: IndexSnapshot, now: Date, siteUrl: string): SocialCandidate | null {
  const duel = activeDuels(s)[0];
  if (!duel) return null;
  const winner =
    duel.winner === "bulls"
      ? "The bulls are winning the tape so far."
      : duel.winner === "bears"
        ? "The bears are winning the tape so far."
        : "The tape is still basically a push.";
  const mainPost = [
    `The All-In crew is split on ${duel.company} ${cashtag(duel.ticker)}.`,
    "",
    `Bull side: ${hostList(duel.bulls)}`,
    `Bear side: ${hostList(duel.bears)}`,
    "",
    `Since the split: ${pct(duel.ret)}.`,
    winner,
    "",
    "Who had the better read?",
  ].join("\n");

  return candidateBase({
    now,
    siteUrl,
    scheduleId: "weekly-open-duel",
    kind: "open_duel",
    title: `Open duel: ${duel.company}`,
    topicKey: `duel:${duel.slug}`,
    route: "/insights",
    mainPost,
    linkReplyLabel: "Live disagreement board",
    risk: "medium",
    reviewRequired: true,
    autoPublishEligible: false,
    evidence: [
      { type: "insight", id: `duel:${duel.slug}`, label: `${duel.company} duel`, urlPath: "/insights", hosts: [...duel.bulls, ...duel.bears] },
      { type: "holding", id: duel.slug, label: `${duel.company} (${duel.ticker})`, urlPath: `/holding/${duel.slug}` },
    ],
  });
}

function award(s: IndexSnapshot, now: Date, siteUrl: string): SocialCandidate | null {
  const awards = computeAwards(s);
  const picked = awards.find((a) => a.key === "oracle") ?? awards[0];
  if (!picked) return null;
  const route = picked.href ?? "/awards";
  const mainPost = [
    `Current All-Index Oracle: ${picked.recipient}.`,
    "",
    picked.stat,
    "",
    picked.detail,
  ].join("\n");
  const reviewRequired = ["fumble", "beartrap", "sharpbear", "flipflopper"].includes(picked.key);

  return candidateBase({
    now,
    siteUrl,
    scheduleId: "monthly-awards",
    kind: "award",
    title: `Award: ${picked.title}`,
    topicKey: `award:${picked.key}`,
    route,
    mainPost,
    linkReplyLabel: route === "/awards" ? "Awards board" : "Host receipt",
    risk: reviewRequired ? "medium" : "low",
    reviewRequired,
    autoPublishEligible: !reviewRequired,
    evidence: [
      { type: "award", id: picked.key, label: picked.title, urlPath: route, hosts: picked.host ? [picked.host] : undefined },
    ],
  });
}

function predictionCheckin(
  predictions: PredictionsFileLike | null | undefined,
  now: Date,
  siteUrl: string,
): SocialCandidate | null {
  const rows = (predictions?.episodes ?? [])
    .flatMap((episode) => episode.predictions.map((prediction) => ({ episode, prediction })))
    .filter(({ prediction }) => prediction.sinceReturn != null)
    .sort((a, b) => Math.abs(b.prediction.sinceReturn ?? 0) - Math.abs(a.prediction.sinceReturn ?? 0));
  const picked = rows[0];
  if (!picked) return null;
  const { episode, prediction } = picked;
  const symbol = prediction.ticker ?? prediction.proxyTicker;
  const speaker = prediction.guestName ?? prediction.host;
  const mainPost = [
    "One of the wildest prediction receipts in the index:",
    "",
    `${speaker} picked ${prediction.pick} for "${prediction.category}".`,
    symbol ? `Tracked proxy: ${cashtag(symbol)}, ${pct(prediction.sinceReturn)} since the call.` : `Current tracked move: ${pct(prediction.sinceReturn)}.`,
    "",
    `From ${episode.title}.`,
  ].join("\n");

  return candidateBase({
    now,
    siteUrl,
    scheduleId: "monthly-prediction-checkin",
    kind: "prediction_checkin",
    title: `Prediction check-in: ${prediction.pick}`,
    topicKey: `prediction:${episode.id}:${slugPart(prediction.category)}:${slugPart(prediction.pick)}`,
    route: "/predictions",
    mainPost,
    linkReplyLabel: "Prediction scoreboard",
    risk: "medium",
    reviewRequired: true,
    autoPublishEligible: false,
    evidence: [
      { type: "prediction", id: `${episode.id}:${prediction.category}:${prediction.pick}`, label: `${speaker}: ${prediction.pick}`, urlPath: "/predictions", hosts: prediction.guestName ? undefined : [prediction.host] },
    ],
  });
}

function quarterlyReport(s: IndexSnapshot, now: Date, siteUrl: string): SocialCandidate | null {
  const fund = s.indexFund;
  if (!fund || fund.constituents.length === 0) return null;
  const byAlpha = sortedByAlpha(fund.constituents);
  const best = byAlpha[0];
  const worst = byAlpha[byAlpha.length - 1];
  const quarter = reportQuarter(now);
  const mainPost = [
    `${quarter.label}: The All-In portfolio is ahead of the market.`,
    "",
    `Besties Index: ${pct(fund.portfolioReturn)}`,
    `S&P 500: ${pct(fund.benchmarkReturn)}`,
    `Edge: ${pp(fund.outperformance)}`,
    "",
    `${fund.constituents.length} live longs as of ${fmtDate(fund.asOf)}.`,
  ].join("\n");

  return candidateBase({
    now,
    siteUrl,
    scheduleId: "quarterly-portfolio-report",
    kind: "quarterly_report",
    title: "Quarterly portfolio report",
    topicKey: `quarterly:${quarter.year}:q${quarter.quarter}`,
    route: "/the-index",
    mainPost,
    threadPosts: [
      `Best open call by alpha: ${best.company} ${cashtag(best.ticker)}, ${pp(best.alpha)} vs S&P.`,
      `Worst open call by alpha: ${worst.company} ${cashtag(worst.ticker)}, ${pp(worst.alpha)} vs S&P.`,
    ],
    linkReplyLabel: "Quarterly scoreboard",
    risk: "medium",
    reviewRequired: true,
    autoPublishEligible: false,
    evidence: [
      { type: "index", id: "besties-index", label: "Besties Index", urlPath: "/the-index" },
      { type: "holding", id: best.slug, label: `${best.company} (${best.ticker})`, urlPath: `/holding/${best.slug}`, hosts: best.hosts },
      { type: "holding", id: worst.slug, label: `${worst.company} (${worst.ticker})`, urlPath: `/holding/${worst.slug}`, hosts: worst.hosts },
    ],
    visual: {
      kind: "scorecard_svg",
      title: "Quarterly All-Index Report",
      subtitle: `${fund.constituents.length} live longs as of ${fmtDate(fund.asOf)}`,
      stats: [
        { label: "Besties", value: pct(fund.portfolioReturn), tone: fund.portfolioReturn >= 0 ? "positive" : "negative" },
        { label: "S&P", value: pct(fund.benchmarkReturn), tone: fund.benchmarkReturn >= 0 ? "positive" : "negative" },
        { label: "Edge", value: pp(fund.outperformance), tone: fund.outperformance >= 0 ? "positive" : "negative" },
        { label: "Best Call", value: best.ticker, tone: "positive" },
      ],
      footer: `Best: ${best.company} ${pp(best.alpha)} alpha. Worst: ${worst.company} ${pp(worst.alpha)} alpha.`,
      alt: `Quarterly All-Index report showing Besties Index ${pct(fund.portfolioReturn)}, S&P ${pct(fund.benchmarkReturn)}, and edge ${pp(fund.outperformance)}.`,
    },
  });
}

export function generateSocialCandidates(
  snapshot: IndexSnapshot,
  options: GenerateSocialOptions = {},
): SocialDraftBundle {
  const now = options.now ?? new Date();
  const siteUrl = options.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
  const skipped: SkippedSocialCandidate[] = [];
  const builders: Array<() => SocialCandidate | null> = [
    () => portfolioPulse(snapshot, now, siteUrl),
    () => receipt(snapshot, now, siteUrl),
    () => openDuel(snapshot, now, siteUrl),
    () => latestEpisode(snapshot, now, siteUrl),
    () => predictionCheckin(options.predictions, now, siteUrl),
    () => award(snapshot, now, siteUrl),
    () => quarterlyReport(snapshot, now, siteUrl),
  ];

  let candidates = builders.flatMap((build) => {
    const candidate = build();
    return candidate ? [candidate] : [];
  });

  if (options.kinds?.length) {
    const allowed = new Set(options.kinds);
    candidates = candidates.filter((candidate) => allowed.has(candidate.kind));
  }
  if (options.scheduleIds?.length) {
    const allowed = new Set(options.scheduleIds);
    candidates = candidates.filter((candidate) => allowed.has(candidate.scheduleId));
  }

  if (!options.includeRecentlyUsed && options.ledgerEntries?.length) {
    const { fresh, skipped: ledgerSkipped } = filterFreshCandidates(
      candidates,
      options.ledgerEntries,
      now,
      options.minDaysBetweenSimilarTopics ?? 14,
    );
    candidates = fresh;
    for (const item of ledgerSkipped) {
      skipped.push({
        scheduleId: item.candidate.scheduleId,
        kind: item.candidate.kind,
        reason: item.reason,
      });
    }
  }

  return {
    generatedAt: now.toISOString(),
    siteUrl,
    candidates,
    skipped,
  };
}
