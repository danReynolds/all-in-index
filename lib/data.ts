import fs from "node:fs";
import path from "node:path";
import type { IndexSnapshot, Holding, EpisodeMeta } from "./types";

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
} {
  const { snapshot, isSample } = getIndex();
  const episodeLinks: Record<string, string | null> = {};
  for (const [id, meta] of Object.entries(snapshot.episodes ?? {})) {
    episodeLinks[id] = meta.link;
  }
  return {
    holding: snapshot.holdings.find((h) => h.slug === slug) ?? null,
    isSample,
    episodeLinks,
    episodes: snapshot.episodes ?? {},
  };
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
}

/** All processed episodes, newest first, with take counts. */
export function getEpisodes(): EpisodeSummary[] {
  const { snapshot } = getIndex();
  const counts = new Map<string, { takes: number; companies: Set<string> }>();
  for (const h of snapshot.holdings) {
    for (const t of h.theses) {
      const c = counts.get(t.episodeId) ?? { takes: 0, companies: new Set<string>() };
      c.takes++;
      c.companies.add(h.slug);
      counts.set(t.episodeId, c);
    }
  }
  return Object.entries(snapshot.episodes ?? {})
    .map(([id, m]) => ({
      id,
      ...m,
      takeCount: counts.get(id)?.takes ?? 0,
      companyCount: counts.get(id)?.companies.size ?? 0,
    }))
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
