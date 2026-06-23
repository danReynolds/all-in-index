import { fetchDailyHistory } from "./market";
import {
  hostExposureWindows,
  guestExposureWindows,
  directionalReturn,
  type ExposureWindow,
} from "../lib/calls";
import { isTradableCompanyExposure, classifyExcluded, isGoingPrivate } from "../lib/tradability";
import { guestSlug } from "../lib/format";
import type {
  BearCall,
  CallType,
  ExcludedKind,
  GuestCall,
  GuestLeaderboardEntry,
  Holding,
  IndexDirection,
  IndexFund,
  IndexConstituent,
  IndexFundPoint,
  Host,
  TradeDirection,
} from "../lib/types";

const BENCHMARK = "SPY";
const CONTRIBUTION = 1000; // notional $ invested per call
type TradableHolding = Holding & { ticker: string };

export const BESTIES = new Set<Host>(["Chamath", "Jason", "Sacks", "Friedberg"]);
export const GUESTS = new Set<Host>(["Guest"]);

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

/**
 * Currently-open exposure of one direction across the host set, aggregated to
 * the name. Built ONLY from scored calls (hostExposureWindows ignores views), so
 * a bullish *view* never makes a name a constituent — only an actual long/short
 * call does. `start` is the earliest still-open window across the besties (the
 * date the position the index holds today was opened); a host who exits or flips
 * has a closed window and no longer contributes. This is the call-based
 * replacement for net-stance membership. A genuinely split name (one host long,
 * another short) surfaces on BOTH books — long here, short in the Bear Book.
 */
function openExposure(
  theses: Holding["theses"],
  hostSet: Set<Host>,
  direction: TradeDirection,
): { start: string; hosts: Host[] } | null {
  let start: string | null = null;
  const hosts = new Set<Host>();
  for (const host of hostList(hostSet)) {
    for (const w of hostExposureWindows(theses, host)) {
      if (w.direction === direction && w.end === null) {
        hosts.add(host);
        if (start === null || w.start < start) start = w.start;
      }
    }
  }
  return start ? { start, hosts: [...hosts] } : null;
}

/** A name the host set currently holds long (≥1 open long call-window). */
export function hasCurrentLong(theses: Holding["theses"], hostSet: Set<Host>): boolean {
  return openExposure(theses, hostSet, "long") != null;
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

/**
 * The Bear Book: every tradable name the besties currently hold a SHORT call on
 * — an explicit short or the short leg of a pair — scored from when that short
 * was opened (the still-open short window's start). Call-based, like the index:
 * a bearish *view* is commentary and never shorts anything. Sorted worst-first.
 */
export async function buildBearBook(
  holdings: Holding[],
  hostSet: Set<Host> = BESTIES,
): Promise<BearCall[]> {
  const out: BearCall[] = [];
  for (const h of holdings.filter(isTradableCompanyExposure)) {
    const short = openExposure(h.theses, hostSet, "short");
    if (!short) continue;
    const hist = await fetchDailyHistory(h.ticker, short.start);
    if (!hist) continue;
    const series = new Series(hist);
    const entry = series.onOrAfter(short.start);
    if (!entry) continue;
    const bearHosts = short.hosts;
    out.push({
      slug: h.slug,
      company: h.company,
      ticker: h.ticker,
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
 * Named-guest scorecards (the Guesties side game), on the SAME call-based engine
 * as the besties: a guest is scored over their portfolio-scored CALL windows
 * (explicit longs/shorts, ranked picks, pair legs), long a bull / short a bear,
 * from the window start to today, vs SPY over the same window. A guest's view is
 * commentary — surfaced on the holding pages, never scored. Guests who only ever
 * commented still get an entry (calls=0, null score) so their page survives.
 */
export async function buildGuestLeaderboard(holdings: Holding[]): Promise<GuestLeaderboardEntry[]> {
  // Every named guest who said anything (so view-only guests keep a page).
  const allGuests = new Set<string>();
  for (const h of holdings)
    for (const t of h.theses) if (t.host === "Guest" && t.guestName) allGuests.add(t.guestName);

  const spyHistAll = await fetchDailyHistory(BENCHMARK, "2019-01-01");
  const spy = spyHistAll ? new Series(spyHistAll) : null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const out: GuestLeaderboardEntry[] = [];
  for (const guest of allGuests) {
    const rows: GuestCall[] = [];
    for (const h of holdings) {
      if (!h.ticker || !h.isPublic || !h.market || h.market.history.length < 2) continue;
      const series = new Series(h.market.history);
      const spyHist = spy ?? null;
      for (const w of guestExposureWindows(h.theses, guest)) {
        const e = series.onOrAfter(w.start);
        if (!e) continue;
        const exit = w.end ? series.asOf(w.end) : series.last;
        if (exit == null) continue;
        const stockRet = exit / e.close - 1;
        // Direction-adjusted, floored at −100%. The benchmark mirrors the call's
        // direction over the identical window — a short is measured against
        // SHORTING SPY (isolating selection), same as the funds — not against
        // buying it, which would compare a bear bet to a bull one.
        const ret = directionalReturn(stockRet, w.direction);
        const spyEntry = spyHist?.onOrAfter(w.start);
        const spyExit = w.end ? spyHist?.asOf(w.end) : spyHist?.last;
        const spyRet = spyHist && spyEntry && spyExit != null ? spyExit / spyEntry.close - 1 : 0;
        const bench = directionalReturn(spyRet, w.direction);
        rows.push({
          company: h.company,
          ticker: h.ticker,
          slug: h.slug,
          stance: w.direction === "long" ? "bull" : "bear",
          date: w.start,
          ret,
          benchmarkReturn: bench,
          alpha: ret - bench,
        });
      }
    }
    if (rows.length) {
      const followReturn = mean(rows.map((r) => r.ret));
      const benchmarkReturn = mean(rows.map((r) => r.benchmarkReturn));
      const best = rows.slice().sort((a, b) => b.ret - a.ret)[0];
      out.push({
        guest,
        slug: guestSlug(guest),
        calls: rows.length,
        followReturn,
        benchmarkReturn,
        alpha: followReturn - benchmarkReturn,
        best: { company: best.company, ticker: best.ticker, slug: best.slug, ret: best.ret },
        picks: rows.slice().sort((a, b) => b.date.localeCompare(a.date)),
      });
    } else {
      // Commentary-only guest: keep the page, no score.
      out.push({
        guest,
        slug: guestSlug(guest),
        calls: 0,
        followReturn: null,
        benchmarkReturn: null,
        alpha: null,
        best: null,
        picks: [],
      });
    }
  }
  // Scored guests first (most calls, then alpha); commentary guests after.
  return out.sort(
    (a, b) =>
      Number(b.calls > 0) - Number(a.calls > 0) ||
      b.calls - a.calls ||
      (b.alpha ?? 0) - (a.alpha ?? 0),
  );
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
  const candidates: Array<{ h: TradableHolding; windows: ExposureWindow[] }> = [];
  for (const h of holdings.filter(isTradableCompanyExposure)) {
    const windows = hostExposureWindows(h.theses, host);
    if (windows.length) candidates.push({ h, windows });
  }
  const excludedPrivate = holdings
    .filter((h) => (!h.ticker || isGoingPrivate(h.ticker)) && hostExposureWindows(h.theses, host).length > 0)
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .map((h) => ({
      slug: h.slug,
      company: h.company,
      hosts: [host],
      kind: isGoingPrivate(h.ticker) ? "going_private" : classifyExcluded(h.company),
    }))
    .filter((e): e is typeof e & { kind: ExcludedKind } => e.kind !== null);

  if (candidates.length === 0) return null;
  const inception = candidates.map((c) => c.windows[0].start).sort()[0];
  const spyHist = await fetchDailyHistory(BENCHMARK, inception);
  if (!spyHist) return null;
  const spy = new Series(spyHist);

  type C = { h: TradableHolding; series: Series; windows: ExposureWindow[]; firstStart: string };
  const cons: C[] = [];
  for (const c of candidates) {
    const hist = await fetchDailyHistory(c.h.ticker, c.windows[0].start);
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
      if (p0 == null || p0 <= 0) continue;
      const factor = (p1: number) => {
        const stockReturn = p1 / p0 - 1;
        // Direction-adjusted and floored at a total loss (factor ≥ 0): a runaway
        // short can never become a negative value factor that over-states the
        // loss or, compounded, flips the position's sign. Same math the
        // leaderboard + UI use (1 + directionalReturn).
        return 1 + directionalReturn(stockReturn, w.direction);
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
            .flatMap((w) => [w.startTake, ...(w.reinforceTakes ?? [])])
            .map((t) => t?.callType)
            .filter((callType): callType is CallType => callType != null),
        ),
      ];
      return {
        slug: c.h.slug,
        company: c.h.company,
        ticker: c.h.ticker,
        sourceSymbol: c.h.market?.sourceSymbol ?? c.h.ticker,
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

/** Entry for the current long: the earliest still-open long call-window start. */
export function currentLongEntryDate(h: Holding, hostSet: Set<Host>): string {
  return openExposure(h.theses, hostSet, "long")?.start ?? h.firstMentioned.slice(0, 10);
}

/** Hosts currently holding an open long on the name. */
export function currentLongHosts(h: Holding, hostSet: Set<Host>): Host[] {
  return openExposure(h.theses, hostSet, "long")?.hosts ?? [];
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
 * Construct the equal-weight long index from the names the besties currently
 * hold a LONG CALL on (an open long window — not net sentiment, so bullish
 * views never enter): $CONTRIBUTION is notionally invested in each at its
 * open-long-window-start close and held to today; the benchmark receives the
 * identical contributions on the identical dates. Returns null if none.
 */
export async function buildIndexFund(
  holdings: Holding[],
  nowIso: string,
  hostSet: Set<Host> = BESTIES,
): Promise<IndexFund | null> {
  const bullish = holdings
    .filter(isTradableCompanyExposure)
    .filter((h) => hasCurrentLong(h.theses, hostSet));
  const excludedPrivate = holdings
    .filter((h) => (!h.ticker || isGoingPrivate(h.ticker)) && hasCurrentLong(h.theses, hostSet))
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .map((h) => ({
      slug: h.slug,
      company: h.company,
      hosts: currentLongHosts(h, hostSet),
      kind: isGoingPrivate(h.ticker) ? "going_private" : classifyExcluded(h.company),
    }))
    .filter((e): e is typeof e & { kind: ExcludedKind } => e.kind !== null);
  const excludedPrivateCount = excludedPrivate.length;

  if (bullish.length === 0) return null;

  const inception = bullish
    .map((h) => currentLongEntryDate(h, hostSet))
    .sort()[0];

  // Benchmark series defines the trading calendar.
  const spyHist = await fetchDailyHistory(BENCHMARK, inception);
  if (!spyHist) return null;
  const spy = new Series(spyHist);

  // Build a constituent (price series + entry) for each bullish holding.
  type C = {
    h: TradableHolding;
    series: Series;
    entryDate: string;
    entryPrice: number;
    spyEntry: number;
    shares: number;
    spyShares: number;
  };
  const constituents: C[] = [];
  for (const h of bullish) {
    const hist = await fetchDailyHistory(h.ticker, inception);
    if (!hist) continue;
    const series = new Series(hist);
    const wanted = currentLongEntryDate(h, hostSet);
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
      const hosts = currentLongHosts(c.h, hostSet);
      const direction: IndexDirection = "long";
      const callTypes = [
        ...new Set(
          c.h.theses
            .filter((t) => hosts.includes(t.host) && t.stance === "bull" && t.callType !== "view")
            .map((t) => t.callType)
            .filter((callType): callType is CallType => callType != null),
        ),
      ];
      return {
        slug: c.h.slug,
        company: c.h.company,
        ticker: c.h.ticker,
        sourceSymbol: c.h.market?.sourceSymbol ?? c.h.ticker,
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
