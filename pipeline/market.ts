import fs from "node:fs";
import path from "node:path";
import { toYahooSymbol } from "./entities";
import { PRICES_DIR } from "./config";
import type { MarketData, ReturnSet } from "../lib/types";

/** Daily close history as [isoDate, close], oldest first. */
type History = Array<[string, number]>;
type HistoryResult = { history: History; sourceSymbol: string; currency: string | null };

const DAY = 86_400;

interface YahooChartResponse {
  chart?: {
    error?: unknown;
    result?: Array<{
      meta?: {
        symbol?: string;
        currency?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
}

// In-process memo: the index + per-host funds re-request the same tickers many
// times per build; one fetch per (ticker, sufficient range) is plenty.
const histCache = new Map<string, { from: string; result: HistoryResult }>();

// Frozen mode: serve prices from the on-disk cache and never hit the network, so
// a content-only re-extract + rebuild leaves every price (and everything derived
// from it) byte-identical. A normal build leaves this off and refreshes prices,
// re-seeding the cache as it goes.
let FROZEN = false;
export function setPriceMode(opts: { frozen: boolean }) {
  FROZEN = opts.frozen;
}

function priceCacheFile(cacheKey: string): string {
  return path.join(PRICES_DIR, `${cacheKey.replace(/[^A-Za-z0-9._^-]/g, "_")}.json`);
}

function readPriceCache(cacheKey: string): HistoryResult | null {
  try {
    const d = JSON.parse(fs.readFileSync(priceCacheFile(cacheKey), "utf8")) as {
      sourceSymbol?: string;
      currency: string | null;
      history: History;
    };
    return d.history?.length
      ? { history: d.history, sourceSymbol: d.sourceSymbol ?? cacheKey, currency: d.currency }
      : null;
  } catch {
    return null;
  }
}

function writePriceCache(cacheKey: string, result: HistoryResult) {
  try {
    fs.mkdirSync(PRICES_DIR, { recursive: true });
    // Merge with any prior cache so the longest-coverage history wins — the
    // benchmark is fetched over many windows and we want the widest one on disk.
    const prior = readPriceCache(cacheKey);
    let history = result.history;
    if (prior?.history.length) {
      const merged = new Map(prior.history);
      for (const [date, close] of result.history) merged.set(date, close); // fresher closes win
      history = [...merged.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }
    fs.writeFileSync(
      priceCacheFile(cacheKey),
      JSON.stringify({
        sourceSymbol: result.sourceSymbol,
        currency: result.currency,
        asOf: new Date().toISOString().slice(0, 10),
        history,
      }) + "\n",
    );
  } catch {
    // Caching is best-effort; a write failure must never break a build.
  }
}

/**
 * Yahoo Finance's chart endpoint is free and key-less. We fetch from a little
 * before the anchor date through today so backfilling old episodes only pulls
 * the window we need. Returns null on any failure so the pipeline degrades
 * gracefully for delisted / unsupported symbols (e.g. private companies).
 */
export async function fetchDailyHistory(
  ticker: string,
  fromIso?: string,
): Promise<History | null> {
  return (await fetchDailyHistoryResult(ticker, fromIso))?.history ?? null;
}

async function fetchDailyHistoryResult(
  ticker: string,
  fromIso?: string,
): Promise<HistoryResult | null> {
  const cacheKey = toYahooSymbol(ticker);
  const want = (fromIso ?? "1990-01-01").slice(0, 10);
  const cached = histCache.get(cacheKey);
  if (cached && cached.from <= want) return cached.result;

  if (FROZEN) {
    // Disk only — never fetch. A missing symbol degrades to null (same as a
    // failed fetch / a private name), keeping frozen rebuilds deterministic.
    const disk = readPriceCache(cacheKey);
    if (disk) histCache.set(cacheKey, { from: disk.history[0]?.[0] ?? "1990-01-01", result: disk });
    return disk;
  }

  const fresh = await fetchDailyHistoryUncached(ticker, fromIso);
  if (fresh) {
    writePriceCache(cacheKey, fresh);
    histCache.set(cacheKey, { from: want, result: fresh });
  }
  return fresh;
}

async function fetchDailyHistoryUncached(
  ticker: string,
  fromIso?: string,
): Promise<HistoryResult | null> {
  const sourceSymbol = toYahooSymbol(ticker);
  const period2 = Math.floor(Date.now() / 1000) + DAY;
  const period1 = fromIso
    ? Math.floor(new Date(fromIso).getTime() / 1000) - 7 * DAY
    : period2 - 6 * 365 * DAY;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sourceSymbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d`;

  let json: YahooChartResponse;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  const result = json?.chart?.result?.[0];
  if (json?.chart?.error || !result) return null;
  const currency = result.meta?.currency ?? null;
  const ts: number[] = result.timestamp ?? [];
  const closes: Array<number | null> = result.indicators?.quote?.[0]?.close ?? [];
  if (!ts.length) return null;

  const out: History = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    const iso = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    out.push([iso, Number(c.toFixed(4))]);
  }
  return out.length
    ? {
        history: out,
        sourceSymbol: result.meta?.symbol ?? sourceSymbol,
        currency,
      }
    : null;
}

/** First close on or after the given ISO date. */
function closeOnOrAfter(history: History, isoDate: string): number | null {
  for (const [d, c] of history) if (d >= isoDate) return c;
  return null;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function pct(base: number | null, then: number | null): number | null {
  if (base == null || then == null || base === 0) return null;
  return (then - base) / base;
}

/** Downsample to ~60 points from the anchor date forward, for charting. */
function sample(history: History, fromDate: string): History {
  const slice = history.filter(([d]) => d >= fromDate);
  if (slice.length <= 60) return slice;
  const step = Math.ceil(slice.length / 60);
  const out = slice.filter((_, i) => i % step === 0);
  const last = slice[slice.length - 1];
  if (out[out.length - 1]?.[0] !== last[0]) out.push(last);
  return out;
}

/**
 * Build a MarketData record anchored to a thesis date, with returns measured
 * over standard horizons (each null if that horizon hasn't elapsed yet).
 */
export async function buildMarketData(
  ticker: string,
  anchorIso: string,
  asOfIso: string,
): Promise<MarketData> {
  const anchorDate = anchorIso.slice(0, 10);
  const market = await fetchDailyHistoryResult(ticker, anchorDate);

  if (!market) {
    const empty: ReturnSet = {
      "1m": null,
      "3m": null,
      "6m": null,
      "1y": null,
      since: null,
    };
    return {
      ticker,
      sourceSymbol: toYahooSymbol(ticker),
      currency: null,
      asOf: asOfIso.slice(0, 10),
      anchorDate,
      basePrice: null,
      latestPrice: null,
      returns: empty,
      history: [],
      source: "none",
    };
  }

  const history = market.history;
  const basePrice = closeOnOrAfter(history, anchorDate);
  const latestPrice = history[history.length - 1][1];
  const returns: ReturnSet = {
    "1m": pct(basePrice, closeOnOrAfter(history, addMonths(anchorDate, 1))),
    "3m": pct(basePrice, closeOnOrAfter(history, addMonths(anchorDate, 3))),
    "6m": pct(basePrice, closeOnOrAfter(history, addMonths(anchorDate, 6))),
    "1y": pct(basePrice, closeOnOrAfter(history, addMonths(anchorDate, 12))),
    since: pct(basePrice, latestPrice),
  };

  return {
    ticker,
    sourceSymbol: market.sourceSymbol,
    currency: market.currency,
    asOf: asOfIso.slice(0, 10),
    anchorDate,
    basePrice,
    latestPrice,
    returns,
    history: sample(history, anchorDate),
    source: "yahoo",
  };
}
