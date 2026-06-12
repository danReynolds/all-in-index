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
  positional?: boolean;
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

/** One position in the constructed long index. */
export interface IndexConstituent {
  slug: string;
  company: string;
  ticker: string;
  sourceSymbol?: string | null;
  currency?: string | null;
  /** Date the (first bullish) call was made — the entry. */
  entryDate: string;
  entryPrice: number;
  latestPrice: number;
  /** Return of the position from entry to latest. */
  sinceReturn: number;
  /** Benchmark (S&P) return over the same window. */
  benchmarkReturn: number;
  /** sinceReturn − benchmarkReturn. */
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

/**
 * The constructed "Besties Index": equal-weight, long every net-bullish public
 * call, entered at the episode-date close and held to today, benchmarked
 * against the S&P with identical cashflows.
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
  /** Net-bullish private companies tracked but not in the tradable index. */
  excludedPrivateCount: number;
  excludedPrivate: Array<{ slug: string; company: string; hosts: Host[] }>;
  /** Second benchmark with matched cashflows (e.g. QQQ) — published honesty. */
  altBenchmark?: { symbol: string; ret: number } | null;
}

/** One host's scorecard: how their own bullish public calls have performed. */
export interface LeaderboardEntry {
  host: Host;
  positions: number;
  portfolioReturn: number;
  benchmarkReturn: number;
  alpha: number;
  /** Their single best call by alpha. */
  topCall: { ticker: string; alpha: number } | null;
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
