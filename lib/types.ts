// Core domain model for the All-Index.
// Shared by the ingestion pipeline (pipeline/) and the public site (app/).

/** The four regular hosts, plus catch-alls for guests / unresolved clusters. */
export type Host =
  | "Chamath"
  | "Jason"
  | "Sacks"
  | "Friedberg"
  | "Guest"
  | "Unknown";

export const REGULAR_HOSTS: Host[] = ["Chamath", "Jason", "Sacks", "Friedberg"];

/** Full names + cues, used to brief the speaker-naming model. */
export const HOST_PROFILES: Record<
  Exclude<Host, "Guest" | "Unknown">,
  { fullName: string; aliases: string[]; blurb: string }
> = {
  Chamath: {
    fullName: "Chamath Palihapitiya",
    aliases: ["Chamath"],
    blurb: "Venture investor, founder of Social Capital. Often called 'the dictator.'",
  },
  Jason: {
    fullName: "Jason Calacanis",
    aliases: ["Jason", "J-Cal", "Jacal"],
    blurb: "Angel investor, host of This Week in Startups. Frequently moderates.",
  },
  Sacks: {
    fullName: "David Sacks",
    aliases: ["Sacks", "Sacky", "David Sacks"],
    blurb: "Entrepreneur/investor (PayPal mafia, Yammer). 'The Rain Man.'",
  },
  Friedberg: {
    fullName: "David Friedberg",
    aliases: ["Friedberg", "Freeberg", "David Friedberg"],
    blurb: "Founder of The Climate Corporation. 'The Sultan of Science.'",
  },
};

export type EpisodeKind = "roundtable" | "interview" | "special";

export interface Episode {
  /** Stable id derived from the RSS GUID. */
  id: string;
  /** Episode number when detectable from the title (e.g. "E274" -> 274). */
  number: number | null;
  title: string;
  /** ISO 8601 date (publication date). */
  date: string;
  /** Direct audio enclosure URL from the RSS feed. */
  audioUrl: string;
  durationSec: number | null;
  kind: EpisodeKind;
  /** Detected guest names for interview episodes. */
  guests: string[];
  /** Link back to the episode (used for attribution on the public site). */
  link: string | null;
}

/** One diarized, speaker-attributed utterance from the transcript. */
export interface Utterance {
  /** Raw diarization cluster id from the ASR provider, e.g. "A", "B". */
  cluster: string;
  /** Resolved speaker after the naming pass. */
  speaker: Host;
  text: string;
  startMs: number;
  endMs: number;
}

export interface Transcript {
  episodeId: string;
  provider: "assemblyai";
  /** Mapping resolved by the speaker-naming pass: cluster -> Host. */
  speakerMap: Record<string, Host>;
  /** Per-cluster confidence from the naming pass (drives scoring gates). */
  speakerConfidence?: Record<string, "low" | "medium" | "high">;
  /** Confidence + reasoning from the naming pass, for auditing. */
  speakerMapNotes?: string;
  utterances: Utterance[];
  /** Free-form provider metadata (transcript id, model, etc.). */
  meta: Record<string, unknown>;
}

export type Stance = "bull" | "bear" | "neutral" | "mixed";
export type Conviction = "low" | "medium" | "high";
export type CallType =
  | "view"
  | "explicit_long"
  | "explicit_short"
  | "explicit_exit"
  | "selection"
  | "pair_trade"
  | "basket";
export type TradeDirection = "long" | "short";
export type IndexDirection = TradeDirection | "mixed";
/**
 * Judgment-only reasons a call-shaped take is recorded but kept out of the
 * scorecard. Structural exclusions (private / crypto / ETF / macro / unpriced)
 * are NOT here — they're derived from the ticker by lib/tradability.ts.
 */
export type ExcludeReason =
  | "conditional"
  | "not_investment_call"
  | "day_trade_aside";

/** A single host's view on a single company, extracted from one episode. */
export interface Thesis {
  id: string;
  episodeId: string;
  episodeNumber: number | null;
  episodeDate: string;
  /** Company as named in the discussion. */
  company: string;
  /** Resolved ticker symbol if publicly traded, else null. */
  ticker: string | null;
  isPublic: boolean;
  host: Host;
  stance: Stance;
  conviction: Conviction;
  /** One-sentence distillation of this host's view. */
  summary: string;
  /** Short supporting excerpt (attributed, kept brief for fair use). */
  quote: string;
  /** Millisecond offset of the quote, for deep-linking into the audio. */
  quoteStartMs: number | null;
  topics: string[];
  /**
   * Confidence that this take is attributed to the right speaker, inherited
   * from the naming pass's confidence on the underlying diarization cluster.
   * "low" displays but never scores. Missing = legacy data, treated as high.
   */
  attributionConfidence?: "low" | "medium" | "high";
  /**
   * True when the take is portfolio-scoreable: explicit in/out language
   * ("I'd own it here", "take profits", "this is a short"), a ranked/selected
   * investment pick ("my #1", "my pick", "best place to invest"), or a named
   * pair/basket leg. General commentary still displays but does not trade.
   */
  /**
   * What kind of statement this is — the single scoring gate. "view" is
   * commentary and never scores; the other six are portfolio-scoreable call
   * shapes. A take scores when `callType` is a non-view shape and carries no
   * `excludeReason`; the trade direction is *derived* from callType + stance
   * (see tradeDirectionForTake in lib/calls.ts), not stored. Optional only so
   * legacy reads don't break — the extractor and the migration always set it.
   */
  callType?: CallType;
  /**
   * Set only when a call-shaped take is deliberately recorded but kept out of
   * the scorecard (conditional pick, day-trade aside, not an equity bet).
   * Structural exclusions (private/crypto/ETF/macro) are derived, not stored.
   */
  excludeReason?: ExcludeReason | null;
  /** Optional one-line audit note: the evidence for the call, or its condition. */
  scoreNote?: string | null;
  /**
   * Representative ETF ticker for a sector/theme/macro basket the host named
   * without a single tradable equity (e.g. "Mag 7" → MAGS). Chosen by the LLM
   * from the proxy registry (lib/proxies.ts); attached and disclosed at index
   * time (build-index attachSectorProxy). Null/absent for ordinary takes.
   */
  sectorProxy?: string | null;
  /** Identified name when host === "Guest" (e.g. "Brad Gerstner"). */
  guestName?: string;
  /** True for hand-authored placeholder data shown before the real pipeline runs. */
  isSample?: boolean;
}

export interface ReturnSet {
  "1m": number | null;
  "3m": number | null;
  "6m": number | null;
  "1y": number | null;
  /** Return from the (first) thesis date to the latest available price. */
  since: number | null;
}

export interface MarketData {
  ticker: string;
  /** Symbol actually queried at the market data provider (e.g. SQ -> XYZ). */
  sourceSymbol?: string | null;
  /** Provider-reported quote currency, such as USD, EUR, KRW. */
  currency?: string | null;
  /** ISO date the prices were fetched. */
  asOf: string;
  /** The thesis anchor date returns are measured from. */
  anchorDate: string;
  basePrice: number | null;
  latestPrice: number | null;
  returns: ReturnSet;
  /** Sparse [isoDate, close] history for charting. */
  history: Array<[string, number]>;
  source: "yahoo" | "none";
}

/** Aggregated company-level record that drives the public holding page. */
export interface Holding {
  /** URL slug: lowercased ticker, or a slugified company name for private cos. */
  slug: string;
  company: string;
  ticker: string | null;
  isPublic: boolean;
  theses: Thesis[];
  /** Cross-episode synthesis of the overall discussion. */
  synthesis: string;
  /** ~15-word neutral description of what the company does (LLM-generated, cached). */
  description?: string | null;
  /** Primary website domain (e.g. "anthropic.com") — drives logos + outbound links. */
  domain?: string | null;
  /** Net stance across all theses (simple aggregate of host views). */
  netStance: Stance;
  firstMentioned: string;
  lastMentioned: string;
  mentionCount: number;
  market: MarketData | null;
  isSample?: boolean;
}

/** One position/exposure in a constructed index. */
export interface IndexConstituent {
  slug: string;
  company: string;
  ticker: string;
  sourceSymbol?: string | null;
  currency?: string | null;
  /** Long, short, or mixed when a host flipped direction across windows. */
  direction?: IndexDirection;
  /** Taxonomy of the scored calls behind this exposure. */
  callTypes?: CallType[];
  /** Date the first scored exposure was opened. */
  entryDate: string;
  entryPrice: number;
  latestPrice: number;
  /** Return of the exposure from entry/latest windows to latest. */
  sinceReturn: number;
  /** Benchmark (S&P) return over the same window. */
  benchmarkReturn: number;
  /** sinceReturn minus same-direction benchmarkReturn. */
  alpha: number;
  hosts: Host[];
}

export interface IndexFundPoint {
  date: string;
  /** Portfolio value given equal $ contributions on each call date. */
  portfolio: number;
  /** S&P value given the identical contributions on the identical dates. */
  benchmark: number;
  /** Cumulative capital deployed by this date (for return-vs-cost charts). */
  invested: number;
}

/** Why a net-bullish call sits outside the tradable single-name index. */
export type ExcludedKind = "private" | "crypto" | "macro" | "going_private";

/**
 * A constructed equal-weight fund. The headline index is long every
 * net-bullish public call; host funds follow each host's scored exposure
 * windows, including explicit shorts and pair legs.
 */
export interface IndexFund {
  asOf: string;
  inceptionDate: string;
  benchmarkSymbol: string;
  /** Dollars notionally invested per call (for the value series). */
  contributionPerCall: number;
  totalInvested: number;
  portfolioValue: number;
  benchmarkValue: number;
  portfolioReturn: number;
  benchmarkReturn: number;
  /** portfolioReturn − benchmarkReturn. */
  outperformance: number;
  constituents: IndexConstituent[];
  series: IndexFundPoint[];
  /** Net-bullish names tracked but outside the tradable single-name index. */
  excludedPrivateCount: number;
  excludedPrivate: Array<{ slug: string; company: string; hosts: Host[]; kind: ExcludedKind }>;
  /** Second benchmark with matched cashflows (e.g. QQQ) — published honesty. */
  altBenchmark?: { symbol: string; ret: number } | null;
}

/** One host's scorecard: how their own scored public calls have performed. */
export interface LeaderboardEntry {
  host: Host;
  positions: number;
  portfolioReturn: number;
  benchmarkReturn: number;
  alpha: number;
  /** Their single best call by alpha. */
  topCall: { ticker: string; alpha: number } | null;
}

/** One scored guest call, scored as if followed from the call date. */
export interface GuestCall {
  company: string;
  ticker: string;
  slug: string;
  stance: "bull" | "bear";
  /** Date the call was made (episode date). */
  date: string;
  /** Direction-adjusted return (long a bull, short a bear), floored at −100%. */
  ret: number;
  /** SPY buy-and-hold return over the same window. */
  benchmarkReturn: number;
  /** ret − benchmarkReturn. */
  alpha: number;
}

/**
 * A named guest's scorecard: their scored directional public calls, scored as
 * "if you'd followed each call" (long a bull, short a bear) from the call date.
 * The Guesties are a fun side index, so this is view-based, not position-based.
 */
export interface GuestLeaderboardEntry {
  guest: string;
  /** URL slug for the guest's page (slugified name). */
  slug: string;
  /** Number of scored CALL windows; 0 for a commentary-only guest. */
  calls: number;
  /** Mean direction-adjusted return across their calls — null = commentary only (no scored calls). */
  followReturn: number | null;
  /** Mean SPY return over the same windows — null for commentary-only guests. */
  benchmarkReturn: number | null;
  alpha: number | null;
  /** Their single best call by follow-return. */
  best: { company: string; ticker: string; slug: string; ret: number } | null;
  /** Every scored call behind the aggregate, newest first. */
  picks: GuestCall[];
}

/** One name the besties turned net-bearish on, scored as a short from the call date. */
export interface BearCall {
  slug: string;
  company: string;
  ticker: string;
  /** Date of the first scored bear take. */
  entryDate: string;
  basePrice: number;
  latestPrice: number;
  /** The STOCK's return since the bear call (positive = the call is wrong). */
  sinceReturn: number;
  hosts: Host[];
}

export interface IndexSnapshot {
  generatedAt: string;
  holdings: Holding[];
  episodesProcessed: number;
  /** The Bear Book: net-bearish public names scored as shorts. Sorted worst-call-first. */
  bearBook?: BearCall[];
  /** The headline index: the four hosts' net-bullish public calls. */
  indexFund?: IndexFund | null;
  /** Fun side index: guests' net-bullish public calls. */
  guestiesFund?: IndexFund | null;
  /** Per-host scorecards, ranked by their calls' performance. */
  leaderboard?: LeaderboardEntry[];
  /** Named guests ranked by how their calls panned out (the Guesties side game). */
  guestLeaderboard?: GuestLeaderboardEntry[];
  /** Each regular host's own fund (drives /host pages). */
  hostFunds?: Partial<Record<Host, IndexFund | null>>;
  /** Episode metadata for receipts links: id -> {title, link, date, number, audioUrl}. */
  episodes?: Record<string, EpisodeMeta>;
}

export interface EpisodeMeta {
  title: string;
  link: string | null;
  date: string;
  number: number | null;
  /** Official enclosure MP3 from the RSS feed — streamed by the in-page quote player. */
  audioUrl: string | null;
}
