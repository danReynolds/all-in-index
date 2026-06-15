import type {
  Holding,
  Host,
  IndexSnapshot,
  Stance,
  Thesis,
} from "./types";

export const BESTIE_LIST: Host[] = ["Chamath", "Jason", "Sacks", "Friedberg"];

/**
 * A host's SCORED takes on one holding, oldest → newest. Low-conviction takes
 * are visible in the UI but excluded from every signal computed here — a
 * hedged aside is not a call.
 */
function takesByHost(h: Holding, hosts: Host[] = BESTIE_LIST): Map<Host, Thesis[]> {
  const map = new Map<Host, Thesis[]>();
  for (const t of h.theses) {
    if (!hosts.includes(t.host)) continue;
    if (t.conviction === "low" || t.attributionConfidence === "low") continue;
    (map.get(t.host) ?? map.set(t.host, []).get(t.host)!).push(t);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.episodeDate.localeCompare(b.episodeDate));
  return map;
}

/**
 * The host's directional journey on a name: bull/bear stances only, with
 * consecutive repeats collapsed. Mixed/neutral takes are waypoints, not
 * commitments, so they're dropped — a bull → neutral → bear sequence is one
 * genuine reversal. Each point carries the date that direction was (re)adopted.
 */
function directionalPath(takes: Thesis[]): StancePathPoint[] {
  const path: StancePathPoint[] = [];
  for (const t of takes) {
    if (t.stance !== "bull" && t.stance !== "bear") continue;
    if (!path.length || path[path.length - 1].stance !== t.stance) {
      path.push({ stance: t.stance, date: t.episodeDate });
    }
  }
  return path;
}

/** A flip is a direction reversal in the collapsed bull/bear journey. */
function hardFlips(takes: Thesis[]): number {
  return Math.max(0, directionalPath(takes).length - 1);
}

/* ------------------------------- Consensus ------------------------------- */

export interface ConsensusItem {
  slug: string;
  company: string;
  ticker: string | null;
  domain: string | null;
  hosts: Host[];
  sinceReturn: number | null;
}

/** Holdings where ≥2 besties' LATEST stance is bull — "the besties agree". */
export function consensusBulls(s: IndexSnapshot): ConsensusItem[] {
  const out: ConsensusItem[] = [];
  for (const h of s.holdings) {
    const map = takesByHost(h);
    const bulls: Host[] = [];
    for (const [host, takes] of map) {
      if (takes[takes.length - 1].stance === "bull") bulls.push(host);
    }
    if (bulls.length >= 2) {
      out.push({
        slug: h.slug,
        company: h.company,
        ticker: h.ticker,
        domain: h.domain ?? null,
        hosts: bulls,
        sinceReturn: h.market?.returns.since ?? null,
      });
    }
  }
  return out.sort(
    (a, b) => b.hosts.length - a.hosts.length || (b.sinceReturn ?? -1) - (a.sinceReturn ?? -1),
  );
}

export function consensusVsSolo(s: IndexSnapshot) {
  const consensus: number[] = [];
  const solo: number[] = [];
  for (const c of s.indexFund?.constituents ?? []) {
    (c.hosts.length >= 2 ? consensus : solo).push(c.alpha);
  }
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return {
    consensus: { n: consensus.length, meanAlpha: mean(consensus) },
    solo: { n: solo.length, meanAlpha: mean(solo) },
  };
}

/** One scored index call with its alpha and who made it. */
export interface AlphaCall {
  slug: string;
  company: string;
  ticker: string;
  domain: string | null;
  alpha: number;
  hosts: Host[];
}

export interface ConsensusSplitDetail {
  consensus: { n: number; meanAlpha: number | null; calls: AlphaCall[] };
  solo: { n: number; meanAlpha: number | null; calls: AlphaCall[] };
}

/** Same split as `consensusVsSolo`, but each side carries the actual calls
 *  behind the number (best-alpha first) so the stat cards can drill in. */
export function consensusVsSoloDetail(s: IndexSnapshot): ConsensusSplitDetail {
  const consensus: AlphaCall[] = [];
  const solo: AlphaCall[] = [];
  for (const c of s.indexFund?.constituents ?? []) {
    const h = s.holdings.find((x) => x.slug === c.slug);
    const call: AlphaCall = {
      slug: c.slug,
      company: c.company,
      ticker: c.ticker,
      domain: h?.domain ?? null,
      alpha: c.alpha,
      hosts: c.hosts,
    };
    (c.hosts.length >= 2 ? consensus : solo).push(call);
  }
  const side = (calls: AlphaCall[]) => ({
    n: calls.length,
    meanAlpha: calls.length ? calls.reduce((x, y) => x + y.alpha, 0) / calls.length : null,
    calls: calls.sort((a, b) => b.alpha - a.alpha),
  });
  return { consensus: side(consensus), solo: side(solo) };
}

/* ------------------------------- Conviction ------------------------------ */

export interface ConvictionBucket {
  label: "high" | "medium" | "low";
  n: number;
  meanAlpha: number | null;
}

/** Mean alpha of index positions bucketed by the strongest bestie conviction behind them. */
export function convictionBuckets(s: IndexSnapshot): ConvictionBucket[] {
  const buckets: Record<string, number[]> = { high: [], medium: [], low: [] };
  for (const c of s.indexFund?.constituents ?? []) {
    const h = s.holdings.find((x) => x.slug === c.slug);
    if (!h) continue;
    const bull = h.theses.filter((t) => t.stance === "bull" && BESTIE_LIST.includes(t.host));
    const conv = bull.some((t) => t.conviction === "high")
      ? "high"
      : bull.some((t) => t.conviction === "medium")
        ? "medium"
        : "low";
    buckets[conv].push(c.alpha);
  }
  return (["high", "medium", "low"] as const).map((label) => ({
    label,
    n: buckets[label].length,
    meanAlpha: buckets[label].length
      ? buckets[label].reduce((x, y) => x + y, 0) / buckets[label].length
      : null,
  }));
}

export interface ConvictionMember {
  slug: string;
  company: string;
  ticker: string;
  domain: string | null;
  alpha: number;
  hosts: Host[];
}

export interface ConvictionBucketDetail extends ConvictionBucket {
  members: ConvictionMember[];
}

/**
 * Same buckets as `convictionBuckets`, but each carries the actual index calls
 * behind it (sorted best-alpha first) so the UI can drill into "which names?".
 */
export function convictionBucketDetails(s: IndexSnapshot): ConvictionBucketDetail[] {
  const members: Record<string, ConvictionMember[]> = { high: [], medium: [], low: [] };
  for (const c of s.indexFund?.constituents ?? []) {
    const h = s.holdings.find((x) => x.slug === c.slug);
    if (!h) continue;
    const bull = h.theses.filter((t) => t.stance === "bull" && BESTIE_LIST.includes(t.host));
    const conv = bull.some((t) => t.conviction === "high")
      ? "high"
      : bull.some((t) => t.conviction === "medium")
        ? "medium"
        : "low";
    members[conv].push({
      slug: c.slug,
      company: c.company,
      ticker: c.ticker,
      domain: h.domain ?? null,
      alpha: c.alpha,
      hosts: c.hosts,
    });
  }
  return (["high", "medium", "low"] as const).map((label) => {
    const m = members[label].sort((a, b) => b.alpha - a.alpha);
    return {
      label,
      n: m.length,
      meanAlpha: m.length ? m.reduce((x, y) => x + y.alpha, 0) / m.length : null,
      members: m,
    };
  });
}

/* --------------------------------- Flips --------------------------------- */

export function flipsByHost(s: IndexSnapshot): Array<{ host: Host; flips: number }> {
  const counts = new Map<Host, number>(BESTIE_LIST.map((h) => [h, 0]));
  for (const h of s.holdings) {
    for (const [host, takes] of takesByHost(h)) {
      counts.set(host, (counts.get(host) ?? 0) + hardFlips(takes));
    }
  }
  return [...counts.entries()]
    .map(([host, flips]) => ({ host, flips }))
    .sort((a, b) => b.flips - a.flips);
}

export function mostFlipped(
  s: IndexSnapshot,
  limit = 6,
): Array<{ slug: string; company: string; flips: number }> {
  const rows: Array<{ slug: string; company: string; flips: number }> = [];
  for (const h of s.holdings) {
    let flips = 0;
    for (const [, takes] of takesByHost(h)) flips += hardFlips(takes);
    if (flips > 0) rows.push({ slug: h.slug, company: h.company, flips });
  }
  return rows.sort((a, b) => b.flips - a.flips).slice(0, limit);
}

export interface StancePathPoint {
  stance: Stance;
  /** ISO date the host adopted this stance on the name. */
  date: string;
}

export interface FlipName {
  slug: string;
  company: string;
  ticker: string | null;
  domain: string | null;
  /** Full bull↔bear reversals by this host on this name. */
  flips: number;
  /** Collapsed stance journey (consecutive same-stance takes merged). */
  path: StancePathPoint[];
  sinceReturn: number | null;
}

export interface HostFlipDetail {
  host: Host;
  /** Total reversals across every name. */
  flips: number;
  /** Every name this host actually reversed on, most-flipped first. */
  names: FlipName[];
}

/**
 * Per-host flip detail: every name a host reversed on, with the stance journey
 * behind it. Powers the Flip Tracker drill-down. Totals match `flipsByHost`.
 */
export function flipDetailsByHost(s: IndexSnapshot): HostFlipDetail[] {
  const byHost = new Map<Host, FlipName[]>(BESTIE_LIST.map((h) => [h, []]));
  for (const h of s.holdings) {
    for (const [host, takes] of takesByHost(h)) {
      const flips = hardFlips(takes);
      if (flips < 1) continue;
      byHost.get(host)?.push({
        slug: h.slug,
        company: h.company,
        ticker: h.ticker,
        domain: h.domain ?? null,
        flips,
        path: directionalPath(takes),
        sinceReturn: h.market?.returns.since ?? null,
      });
    }
  }
  return [...byHost.entries()]
    .map(([host, names]) => ({
      host,
      flips: names.reduce((n, x) => n + x.flips, 0),
      names: names.sort(
        (a, b) =>
          b.flips - a.flips ||
          (b.path[b.path.length - 1]?.date ?? "").localeCompare(a.path[a.path.length - 1]?.date ?? ""),
      ),
    }))
    .sort((a, b) => b.flips - a.flips);
}

/* --------------------------------- Duels --------------------------------- */

export interface Duel {
  slug: string;
  company: string;
  ticker: string;
  bulls: Host[];
  bears: Host[];
  /** When the disagreement most recently crystallized (later side's take). */
  sinceDate: string;
  /** Stock return from sinceDate to latest close (null if unpriceable). */
  ret: number | null;
  winner: "bulls" | "bears" | "push" | null;
}

/** Active disagreements: some besties' latest stance bull, others' bear, on a priced name. */
export function activeDuels(s: IndexSnapshot): Duel[] {
  const out: Duel[] = [];
  for (const h of s.holdings) {
    if (!h.ticker || !h.market || h.market.history.length < 2) continue;
    const map = takesByHost(h);
    const bulls: Host[] = [];
    const bears: Host[] = [];
    let sinceDate = "";
    for (const [host, takes] of map) {
      const latest = takes[takes.length - 1];
      if (latest.stance === "bull") {
        bulls.push(host);
        if (latest.episodeDate > sinceDate) sinceDate = latest.episodeDate;
      } else if (latest.stance === "bear") {
        bears.push(host);
        if (latest.episodeDate > sinceDate) sinceDate = latest.episodeDate;
      }
    }
    if (bulls.length === 0 || bears.length === 0) continue;
    const day = sinceDate.slice(0, 10);
    const hist = h.market.history;
    const start = hist.find(([d]) => d >= day);
    const last = hist[hist.length - 1];
    const ret = start ? last[1] / start[1] - 1 : null;
    const winner =
      ret == null ? null : ret > 0.02 ? "bulls" : ret < -0.02 ? "bears" : "push";
    out.push({
      slug: h.slug,
      company: h.company,
      ticker: h.ticker,
      bulls,
      bears,
      sinceDate,
      ret,
      winner,
    });
  }
  return out.sort((a, b) => Math.abs(b.ret ?? 0) - Math.abs(a.ret ?? 0));
}

/* --------------------------------- Awards -------------------------------- */

export interface Award {
  key: string;
  emoji: string;
  title: string;
  recipient: string;
  /** Host name when the recipient is a host (for avatar rendering). */
  host?: Host;
  stat: string;
  detail: string;
  href?: string;
}

export function computeAwards(s: IndexSnapshot): Award[] {
  const awards: Award[] = [];
  const lb = (s.leaderboard ?? []).filter((e) => e.positions > 0);
  const fund = s.indexFund;
  const pctf = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
  const ppf = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(0) + "pp";

  if (lb[0]) {
    awards.push({
      key: "oracle",
      emoji: "🔮",
      title: "The Oracle",
      recipient: lb[0].host,
      host: lb[0].host,
      stat: `${pctf(lb[0].portfolioReturn)} vs S&P ${pctf(lb[0].benchmarkReturn)}`,
      detail: `Best returns of any bestie across ${lb[0].positions} public calls.`,
      href: `/host/${lb[0].host.toLowerCase()}`,
    });
  }

  const flips = flipsByHost(s);
  if (flips[0]?.flips) {
    const topFlipped = mostFlipped(s, 1)[0];
    awards.push({
      key: "flipflopper",
      emoji: "🔄",
      title: "The Flip-Flopper",
      recipient: flips[0].host,
      host: flips[0].host,
      stat: `${flips[0].flips} full bull↔bear reversals`,
      detail: topFlipped
        ? `${topFlipped.company} alone accounts for a good share of the whiplash.`
        : "Strong opinions, loosely held. Very loosely.",
      href: `/host/${flips[0].host.toLowerCase()}`,
    });
  }
  const steady = flips
    .slice()
    .reverse()
    .find((f) => lb.some((e) => e.host === f.host && e.positions >= 5));
  if (steady) {
    awards.push({
      key: "diamond",
      emoji: "💎",
      title: "Diamond Hands",
      recipient: steady.host,
      host: steady.host,
      stat: `only ${steady.flips} ${steady.flips === 1 ? "reversal" : "reversals"} on record`,
      detail: "Picks a side and stays there. The leaderboard suggests it works.",
      href: `/host/${steady.host.toLowerCase()}`,
    });
  }

  if (fund?.constituents.length) {
    const best = fund.constituents[0];
    const worst = fund.constituents[fund.constituents.length - 1];
    awards.push({
      key: "call",
      emoji: "🚀",
      title: "Call of the Catalog",
      recipient: `${best.company} (${best.ticker})`,
      stat: `${ppf(best.alpha)} over the S&P`,
      detail: `Called by ${best.hosts.join(" & ")} on ${best.entryDate} — the single best call on record.`,
      href: `/holding/${best.slug}`,
    });
    awards.push({
      key: "fumble",
      emoji: "🤦",
      title: "The Fumble",
      recipient: `${worst.company} (${worst.ticker})`,
      stat: `${ppf(worst.alpha)} vs the S&P`,
      detail: `${worst.hosts.join(" & ")} would like this one back.`,
      href: `/holding/${worst.slug}`,
    });
  }

  const mostDiscussed = s.holdings.slice().sort((a, b) => b.mentionCount - a.mentionCount)[0];
  if (mostDiscussed) {
    awards.push({
      key: "debated",
      emoji: "🗣️",
      title: "Most Debated",
      recipient: mostDiscussed.company,
      stat: `${mostDiscussed.mentionCount} takes and counting`,
      detail: "The name the besties can't stop arguing about.",
      href: `/holding/${mostDiscussed.slug}`,
    });
  }

  const bears = s.bearBook ?? [];
  if (bears.length > 0) {
    const trap = bears[0]; // sorted worst-first: biggest gain against the call
    if (trap.sinceReturn > 0.05) {
      const asOf = Date.parse(s.generatedAt || trap.entryDate);
      const days = Math.round((asOf - Date.parse(trap.entryDate)) / 86400000);
      awards.push({
        key: "beartrap",
        emoji: "🪤",
        title: "The Bear Trap",
        recipient: `${trap.company} (${trap.ticker})`,
        stat: `stock ${pctf(trap.sinceReturn)} since the bear call`,
        detail: `${trap.hosts.join(" & ")} called it cooked ${days} days ago — it rallied instead, and no one has updated the call.`,
        href: `/holding/${trap.slug}`,
      });
    }
    const sharp = bears[bears.length - 1];
    if (sharp.sinceReturn < -0.05) {
      awards.push({
        key: "sharpbear",
        emoji: "🎯",
        title: "Sharpest Bear Call",
        recipient: `${sharp.company} (${sharp.ticker})`,
        stat: `stock ${pctf(sharp.sinceReturn)} since the call`,
        detail: `${sharp.hosts.join(" & ")} said get out — and it dropped.`,
        href: `/holding/${sharp.slug}`,
      });
    }
  }

  const cvs = consensusVsSolo(s);
  if (cvs.consensus.meanAlpha != null && cvs.solo.meanAlpha != null) {
    awards.push({
      key: "together",
      emoji: "🤝",
      title: "Better Together",
      recipient: "The besties, together",
      stat: `consensus calls ${ppf(cvs.consensus.meanAlpha)} vs solo ${ppf(cvs.solo.meanAlpha)}`,
      detail: "When two or more besties agree, the hit is historically far bigger.",
      href: "/insights",
    });
  }

  return awards;
}
