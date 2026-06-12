import { fetchDailyHistory } from "./market";
import { isMacroAsset } from "../lib/assets";
import {
  currentStanceForHosts,
  stancePath,
  scoredTakes,
  hostExposureWindows,
  type ExposureWindow,
} from "../lib/calls";
import type {
  BearCall,
  CallType,
  Holding,
  IndexDirection,
  IndexFund,
  IndexConstituent,
  IndexFundPoint,
  Host,
} from "../lib/types";

const BENCHMARK = "SPY";
const CONTRIBUTION = 1000; // notional $ invested per call

export const BESTIES = new Set<Host>(["Chamath", "Jason", "Sacks", "Friedberg"]);
export const GUESTS = new Set<Host>(["Guest"]);

/** Crypto / non-equity tickers that must never enter the stock index. */
function isCrypto(ticker: string): boolean {
  return /-USD$/i.test(ticker) || ["BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "BNB"].includes(ticker.toUpperCase());
}

/** Benchmark/index ETFs aren't company calls — excluded from all funds. */
const EXCLUDED_ETFS = new Set(["SPY", "QQQ", "VOO", "VTI", "DIA", "IWM"]);

/**
 * A take scores only when it's a real call (medium+ conviction) AND we're
 * confident who said it (attribution not low). Everything else displays but
 * never moves a number.
 */
export function takeScores(t: {
  conviction: string;
  attributionConfidence?: string;
}): boolean {
  return t.conviction !== "low" && t.attributionConfidence !== "low";
}

function hostList(hostSet: Set<Host>): Host[] {
  return [...hostSet];
}

/** True only when the relevant hosts' latest scored takes are net-bullish. */
export function isCurrentNetBull(theses: Holding["theses"], hostSet: Set<Host>): boolean {
  return currentStanceForHosts(theses, hostList(hostSet)) === "bull";
}

/** A date-indexed price series with as-of (forward-filled) lookup. */
class Series {
  private dates: string[];
  private closes: number[];
  constructor(history: Array<[string, number]>) {
    this.dates = history.map((h) => h[0]);
    this.closes = history.map((h) => h[1]);
  }
  /** Last close on or before the given date (forward-fill). */
  asOf(date: string): number | null {
    let lo = 0,
      hi = this.dates.length - 1,
      ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.dates[mid] <= date) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans >= 0 ? this.closes[ans] : null;
  }
  /** First close on or after the given date. */
  onOrAfter(date: string): { date: string; close: number } | null {
    for (let i = 0; i < this.dates.length; i++) {
      if (this.dates[i] >= date) return { date: this.dates[i], close: this.closes[i] };
    }
    return null;
  }
  get last(): number {
    return this.closes[this.closes.length - 1];
  }
  get lastDate(): string {
    return this.dates[this.dates.length - 1];
  }
}

/** Bull takes that actually score: in the host set, conviction + attribution OK. */
function scoredBulls(h: Holding, hostSet: Set<Host>) {
  return h.theses.filter(
    (t) => t.stance === "bull" && hostSet.has(t.host) && takeScores(t),
  );
}



/**
 * The Bear Book: every tradable name the table is CURRENTLY net-bearish on,
 * scored as a short entered when that bear stance was adopted (the last time
 * the net direction flipped to bearish — not the first bear take ever, which
 * misjudges names the view evolved on). Sorted worst-call-first.
 */
export async function buildBearBook(
  holdings: Holding[],
  hostSet: Set<Host> = BESTIES,
): Promise<BearCall[]> {
  const bearish = holdings.filter(
    (h) =>
      h.ticker &&
      h.isPublic &&
      !isCrypto(h.ticker) &&
      !EXCLUDED_ETFS.has(h.ticker.toUpperCase()) &&
      !isMacroAsset(h.ticker) &&
      currentStanceForHosts(h.theses, hostList(hostSet)) === "bear",
  );
  const out: BearCall[] = [];
  for (const h of bearish) {
    const path = stancePath(h.theses, hostList(hostSet));
    if (path.length === 0 || path[path.length - 1].dir !== -1) continue;
    const entryWanted = path[path.length - 1].date;
    const hist = await fetchDailyHistory(h.ticker!, entryWanted);
    if (!hist) continue;
    const series = new Series(hist);
    const entry = series.onOrAfter(entryWanted);
    if (!entry) continue;
    // Hosts whose LATEST scored take is bearish — the ones holding the position.
    const latest = new Map<Host, string>();
    for (const t of scoredTakes(h.theses, hostList(hostSet))) latest.set(t.host, t.stance);
    const bearHosts = [...latest.entries()]
      .filter(([, s]) => s === "bear")
      .map(([host]) => host);
    out.push({
      slug: h.slug,
      company: h.company,
      ticker: h.ticker!,
      entryDate: entry.date,
      basePrice: Number(entry.close.toFixed(2)),
      latestPrice: Number(series.last.toFixed(2)),
      sinceReturn: series.last / entry.close - 1,
      hosts: bearHosts,
    });
  }
  return out.sort((a, b) => b.sinceReturn - a.sinceReturn);
}

/**
 * Window-based single-host fund (drives the leaderboard + host pages):
 * $1,000 per name, IN the market only during the host's portfolio-scored
 * exposure windows (clear buys, ranked selections, explicit shorts, pair legs;
 * exits and re-entries compound); the benchmark trades SPY in the same
 * direction over the identical windows, isolating selection.
 */
export async function buildWindowFund(
  holdings: Holding[],
  nowIso: string,
  host: Host,
): Promise<IndexFund | null> {
  const candidates: Array<{ h: Holding; windows: ExposureWindow[] }> = [];
  for (const h of holdings) {
    if (!h.ticker || !h.isPublic || isCrypto(h.ticker) || EXCLUDED_ETFS.has(h.ticker.toUpperCase()) || isMacroAsset(h.ticker)) continue;
    const windows = hostExposureWindows(h.theses, host);
    if (windows.length) candidates.push({ h, windows });
  }
  const excludedPrivate = holdings
    .filter((h) => !h.ticker && hostExposureWindows(h.theses, host).length > 0)
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .map((h) => ({ slug: h.slug, company: h.company, hosts: [host] }));

  if (candidates.length === 0) return null;
  const inception = candidates.map((c) => c.windows[0].start).sort()[0];
  const spyHist = await fetchDailyHistory(BENCHMARK, inception);
  if (!spyHist) return null;
  const spy = new Series(spyHist);

  type C = { h: Holding; series: Series; windows: ExposureWindow[]; firstStart: string };
  const cons: C[] = [];
  for (const c of candidates) {
    const hist = await fetchDailyHistory(c.h.ticker!, c.windows[0].start);
    if (!hist) continue;
    cons.push({ h: c.h, series: new Series(hist), windows: c.windows, firstStart: c.windows[0].start });
  }
  if (cons.length === 0) return null;

  // Compounded value factor of `s` traded over `windows`, evaluated at `at`.
  const factorAt = (s: Series, windows: ExposureWindow[], at: string): number => {
    let f = 1;
    for (const w of windows) {
      if (w.start > at) break;
      const p0 = s.onOrAfter(w.start)?.close;
      if (p0 == null) continue;
      const factor = (p1: number) => {
        const stockReturn = p1 / p0 - 1;
        return 1 + (w.direction === "long" ? stockReturn : -stockReturn);
      };
      if (w.end != null && w.end <= at) {
        const p1 = s.onOrAfter(w.end)?.close ?? s.asOf(at);
        if (p1 != null) f *= factor(p1);
      } else {
        const p1 = s.asOf(at);
        if (p1 != null && p1 > 0) f *= factor(p1);
      }
    }
    return f;
  };

  const series: IndexFundPoint[] = [];
  for (const [date] of spyHist) {
    if (date < inception) continue;
    let pf = 0;
    let bm = 0;
    let invested = 0;
    for (const c of cons) {
      if (c.firstStart > date) continue;
      invested += CONTRIBUTION;
      pf += CONTRIBUTION * factorAt(c.series, c.windows, date);
      bm += CONTRIBUTION * factorAt(spy, c.windows, date);
    }
    if (invested === 0) continue;
    series.push({ date, portfolio: Math.round(pf), benchmark: Math.round(bm), invested });
  }
  if (series.length === 0) return null;

  const last = series[series.length - 1];
  const totalInvested = cons.length * CONTRIBUTION;
  const lastDate = spy.lastDate;

  const constituentRows: IndexConstituent[] = cons
    .map((c) => {
      const ret = factorAt(c.series, c.windows, lastDate) - 1;
      const bench = factorAt(spy, c.windows, lastDate) - 1;
      const entry = c.series.onOrAfter(c.firstStart);
      const directions = new Set(c.windows.map((w) => w.direction));
      const direction: IndexDirection = directions.size === 1 ? [...directions][0] : "mixed";
      const callTypes = [
        ...new Set(
          c.windows
            .map((w) => w.startTake?.callType)
            .filter((callType): callType is CallType => callType != null),
        ),
      ];
      return {
        slug: c.h.slug,
        company: c.h.company,
        ticker: c.h.ticker!,
        sourceSymbol: c.h.market?.sourceSymbol ?? c.h.ticker!,
        currency: c.h.market?.currency ?? null,
        direction,
        callTypes,
        entryDate: entry?.date ?? c.firstStart,
        entryPrice: Number((entry?.close ?? 0).toFixed(2)),
        latestPrice: Number(c.series.last.toFixed(2)),
        sinceReturn: ret,
        benchmarkReturn: bench,
        alpha: ret - bench,
        hosts: [host],
      };
    })
    .sort((a, b) => b.alpha - a.alpha);

  return {
    asOf: nowIso.slice(0, 10),
    inceptionDate: inception,
    benchmarkSymbol: BENCHMARK,
    contributionPerCall: CONTRIBUTION,
    totalInvested,
    portfolioValue: last.portfolio,
    benchmarkValue: last.benchmark,
    portfolioReturn: last.portfolio / totalInvested - 1,
    benchmarkReturn: last.benchmark / totalInvested - 1,
    outperformance: last.portfolio / totalInvested - last.benchmark / totalInvested,
    constituents: constituentRows,
    series: downsample(series),
    excludedPrivateCount: excludedPrivate.length,
    excludedPrivate,
  };
}

export function currentBullEntryDate(h: Holding, hostSet: Set<Host>): string {
  const path = stancePath(h.theses, hostList(hostSet));
  const latest = path[path.length - 1];
  if (latest?.dir === 1) return latest.date;
  const bullDates = scoredBulls(h, hostSet).map((t) => t.episodeDate).sort();
  return (bullDates[0] ?? h.firstMentioned).slice(0, 10);
}

export function currentBullHosts(h: Holding, hostSet: Set<Host>): Host[] {
  const latest = new Map<Host, string>();
  for (const t of scoredTakes(h.theses, hostList(hostSet))) latest.set(t.host, t.stance);
  return [...latest.entries()]
    .filter(([, stance]) => stance === "bull")
    .map(([host]) => host);
}

function downsample(points: IndexFundPoint[], max = 90): IndexFundPoint[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  if (out[out.length - 1]?.date !== points[points.length - 1].date) {
    out.push(points[points.length - 1]);
  }
  return out;
}

/**
 * Construct the equal-weight long index from net-bullish public holdings:
 * $CONTRIBUTION is notionally invested in each at its (first bullish) call-date
 * close and held to today; the benchmark receives the identical contributions
 * on the identical dates. Returns null if there are no tradable bullish calls.
 */
export async function buildIndexFund(
  holdings: Holding[],
  nowIso: string,
  hostSet: Set<Host> = BESTIES,
): Promise<IndexFund | null> {
  const bullish = holdings.filter(
    (h) =>
      h.ticker &&
      h.isPublic &&
      !isCrypto(h.ticker) &&
      !EXCLUDED_ETFS.has(h.ticker.toUpperCase()) &&
      !isMacroAsset(h.ticker) &&
      isCurrentNetBull(h.theses, hostSet),
  );
  const excludedPrivateHoldings = holdings.filter(
    (h) => !h.ticker && isCurrentNetBull(h.theses, hostSet),
  );
  const excludedPrivate = excludedPrivateHoldings
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .map((h) => ({
      slug: h.slug,
      company: h.company,
      hosts: currentBullHosts(h, hostSet),
    }));
  const excludedPrivateCount = excludedPrivate.length;

  if (bullish.length === 0) return null;

  const inception = bullish
    .map((h) => currentBullEntryDate(h, hostSet))
    .sort()[0];

  // Benchmark series defines the trading calendar.
  const spyHist = await fetchDailyHistory(BENCHMARK, inception);
  if (!spyHist) return null;
  const spy = new Series(spyHist);

  // Build a constituent (price series + entry) for each bullish holding.
  type C = {
    h: Holding;
    series: Series;
    entryDate: string;
    entryPrice: number;
    spyEntry: number;
    shares: number;
    spyShares: number;
  };
  const constituents: C[] = [];
  for (const h of bullish) {
    const hist = await fetchDailyHistory(h.ticker!, inception);
    if (!hist) continue;
    const series = new Series(hist);
    const wanted = currentBullEntryDate(h, hostSet);
    const entry = series.onOrAfter(wanted);
    const spyEntryPt = spy.onOrAfter(wanted);
    if (!entry || !spyEntryPt) continue;
    constituents.push({
      h,
      series,
      entryDate: entry.date,
      entryPrice: entry.close,
      spyEntry: spyEntryPt.close,
      shares: CONTRIBUTION / entry.close,
      spyShares: CONTRIBUTION / spyEntryPt.close,
    });
  }
  if (constituents.length === 0) return null;

  // Walk the benchmark calendar from inception; accrue matched cashflows.
  const series: IndexFundPoint[] = [];
  for (let i = 0; i < spyHist.length; i++) {
    const [date] = spyHist[i];
    if (date < inception) continue;
    let pf = 0;
    let bm = 0;
    let invested = 0;
    for (const c of constituents) {
      if (c.entryDate > date) continue;
      const px = c.series.asOf(date);
      const spx = spy.asOf(date);
      if (px == null || spx == null) continue;
      pf += c.shares * px;
      bm += c.spyShares * spx;
      invested += CONTRIBUTION;
    }
    if (invested === 0) continue;
    series.push({
      date,
      portfolio: Math.round(pf),
      benchmark: Math.round(bm),
      invested,
    });
  }

  const totalInvested = constituents.length * CONTRIBUTION;
  const last = series[series.length - 1];
  const portfolioReturn = last.portfolio / totalInvested - 1;
  const benchmarkReturn = last.benchmark / totalInvested - 1;

  // Second benchmark with identical cashflows — published so the "you just
  // benchmarked tech against the S&P" critique is answered on the page.
  let altBenchmark: { symbol: string; ret: number } | null = null;
  const qqqHist = await fetchDailyHistory("QQQ", inception);
  if (qqqHist) {
    const qqq = new Series(qqqHist);
    let val = 0;
    let inv = 0;
    for (const c of constituents) {
      const q0 = qqq.onOrAfter(c.entryDate);
      if (!q0) continue;
      inv += CONTRIBUTION;
      val += CONTRIBUTION * (qqq.last / q0.close);
    }
    if (inv > 0) altBenchmark = { symbol: "QQQ", ret: val / inv - 1 };
  }

  const constituentRows: IndexConstituent[] = constituents
    .map((c) => {
      const latest = c.series.last;
      const sinceReturn = latest / c.entryPrice - 1;
      const benchReturn = spy.last / c.spyEntry - 1;
      const hosts = currentBullHosts(c.h, hostSet);
      const direction: IndexDirection = "long";
      const callTypes = [
        ...new Set(
          c.h.theses
            .filter((t) => hosts.includes(t.host) && t.stance === "bull")
            .map((t) => t.callType)
            .filter((callType): callType is CallType => callType != null),
        ),
      ];
      return {
        slug: c.h.slug,
        company: c.h.company,
        ticker: c.h.ticker!,
        sourceSymbol: c.h.market?.sourceSymbol ?? c.h.ticker!,
        currency: c.h.market?.currency ?? null,
        direction,
        callTypes,
        entryDate: c.entryDate,
        entryPrice: Number(c.entryPrice.toFixed(2)),
        latestPrice: Number(latest.toFixed(2)),
        sinceReturn,
        benchmarkReturn: benchReturn,
        alpha: sinceReturn - benchReturn,
        hosts,
      };
    })
    .sort((a, b) => b.alpha - a.alpha);

  return {
    asOf: nowIso.slice(0, 10),
    inceptionDate: inception,
    benchmarkSymbol: BENCHMARK,
    contributionPerCall: CONTRIBUTION,
    totalInvested,
    portfolioValue: last.portfolio,
    benchmarkValue: last.benchmark,
    portfolioReturn,
    benchmarkReturn,
    outperformance: portfolioReturn - benchmarkReturn,
    constituents: constituentRows,
    series: downsample(series),
    excludedPrivateCount,
    excludedPrivate,
    altBenchmark,
  };
}
