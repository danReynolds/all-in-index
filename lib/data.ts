import fs from "node:fs";
import path from "node:path";
import type { IndexSnapshot, Holding, EpisodeMeta, IndexConstituent, BearCall } from "./types";

const HOLDINGS_FILE = path.join(process.cwd(), "data", "holdings.json");
const SAMPLE_FILE = path.join(process.cwd(), "data", "sample", "holdings.json");

/**
 * Load the index snapshot. Prefers real pipeline output (data/holdings.json);
 * falls back to the clearly-labelled sample fixture so the site renders before
 * any API keys are configured.
 */
export function getIndex(): { snapshot: IndexSnapshot; isSample: boolean } {
  if (fs.existsSync(HOLDINGS_FILE)) {
    return {
      snapshot: JSON.parse(fs.readFileSync(HOLDINGS_FILE, "utf8")),
      isSample: false,
    };
  }
  if (fs.existsSync(SAMPLE_FILE)) {
    return {
      snapshot: JSON.parse(fs.readFileSync(SAMPLE_FILE, "utf8")),
      isSample: true,
    };
  }
  return {
    snapshot: { generatedAt: "", holdings: [], episodesProcessed: 0 },
    isSample: false,
  };
}

export function getHolding(slug: string): {
  holding: Holding | null;
  isSample: boolean;
  episodeLinks: Record<string, string | null>;
  episodes: Record<string, EpisodeMeta>;
  /** This name's live index position (net-bull long), if any — the exact
   *  daily-close return the ticker shows. */
  indexPosition: IndexConstituent | null;
  /** This name's live Bear Book entry (net-bear short), if any. */
  bearPosition: BearCall | null;
} {
  const { snapshot, isSample } = getIndex();
  const episodeLinks: Record<string, string | null> = {};
  for (const [id, meta] of Object.entries(snapshot.episodes ?? {})) {
    episodeLinks[id] = meta.link;
  }
  const holding = snapshot.holdings.find((h) => h.slug === slug) ?? null;
  const tk = holding?.ticker?.toUpperCase() ?? null;
  return {
    holding,
    isSample,
    episodeLinks,
    episodes: snapshot.episodes ?? {},
    indexPosition: tk ? (snapshot.indexFund?.constituents.find((c) => c.ticker.toUpperCase() === tk) ?? null) : null,
    bearPosition: tk ? ((snapshot.bearBook ?? []).find((b) => b.ticker.toUpperCase() === tk) ?? null) : null,
  };
}

/**
 * Map of guest name → profile slug, for every guest that actually has a
 * `/guest/[slug]` page (i.e. appears in the leaderboard with ≥1 scored call).
 * Used to link guest names in receipts ONLY when the page exists, so we never
 * render a link to a page that 404s.
 */
export function guestLinkMap(): Record<string, string> {
  const { snapshot } = getIndex();
  const out: Record<string, string> = {};
  for (const g of snapshot.guestLeaderboard ?? []) out[g.guest] = g.slug;
  return out;
}

export function allSlugs(): string[] {
  return getIndex().snapshot.holdings.map((h) => h.slug);
}

export interface EpisodeSummary {
  id: string;
  title: string;
  link: string | null;
  date: string;
  number: number | null;
  takeCount: number;
  companyCount: number;
  /** Companies discussed, most-discussed first (for logo clusters). */
  companies: Array<{ slug: string; company: string; domain: string | null }>;
  /** Stance mix across the episode's takes (the "mood"). */
  stance: { bull: number; bear: number; neutral: number; mixed: number };
}

interface EpisodeAgg {
  takes: number;
  stance: { bull: number; bear: number; neutral: number; mixed: number };
  comps: Map<string, { company: string; domain: string | null; n: number }>;
}

/** All processed episodes, newest first, with take counts, companies + mood. */
export function getEpisodes(): EpisodeSummary[] {
  const { snapshot } = getIndex();
  const counts = new Map<string, EpisodeAgg>();
  for (const h of snapshot.holdings) {
    for (const t of h.theses) {
      const c =
        counts.get(t.episodeId) ??
        ({ takes: 0, stance: { bull: 0, bear: 0, neutral: 0, mixed: 0 }, comps: new Map() } as EpisodeAgg);
      c.takes++;
      c.stance[t.stance]++;
      const comp = c.comps.get(h.slug) ?? { company: h.company, domain: h.domain ?? null, n: 0 };
      comp.n++;
      c.comps.set(h.slug, comp);
      counts.set(t.episodeId, c);
    }
  }
  return Object.entries(snapshot.episodes ?? {})
    .map(([id, m]) => {
      const c = counts.get(id);
      const companies = c
        ? [...c.comps.entries()]
            .sort((a, b) => b[1].n - a[1].n)
            .map(([slug, v]) => ({ slug, company: v.company, domain: v.domain }))
        : [];
      return {
        id,
        ...m,
        takeCount: c?.takes ?? 0,
        companyCount: companies.length,
        companies,
        stance: c?.stance ?? { bull: 0, bear: 0, neutral: 0, mixed: 0 },
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface EpisodeDetail {
  id: string;
  meta: NonNullable<IndexSnapshot["episodes"]>[string];
  /** Takes made in this episode, grouped per company, most-discussed first. */
  groups: Array<{ holding: Holding; takes: Holding["theses"] }>;
  prev: EpisodeSummary | null;
  next: EpisodeSummary | null;
}

export function getEpisode(id: string): EpisodeDetail | null {
  const { snapshot } = getIndex();
  const meta = snapshot.episodes?.[id];
  if (!meta) return null;
  const groups: EpisodeDetail["groups"] = [];
  for (const h of snapshot.holdings) {
    const takes = h.theses.filter((t) => t.episodeId === id);
    if (takes.length) groups.push({ holding: h, takes });
  }
  groups.sort((a, b) => b.takes.length - a.takes.length);
  const all = getEpisodes();
  const idx = all.findIndex((e) => e.id === id);
  return {
    id,
    meta,
    groups,
    prev: idx >= 0 ? (all[idx + 1] ?? null) : null,
    next: idx >= 0 ? (all[idx - 1] ?? null) : null,
  };
}

export function allEpisodeIds(): string[] {
  return Object.keys(getIndex().snapshot.episodes ?? {});
}
