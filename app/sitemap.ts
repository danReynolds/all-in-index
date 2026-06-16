import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { allSlugs, allEpisodeIds } from "@/lib/data";
import { REGULAR_HOSTS } from "@/lib/types";

function usedProxyTickers(): string[] {
  const f = path.join(process.cwd(), "data", "predictions.json");
  if (!fs.existsSync(f)) return [];
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const set = new Set<string>();
  for (const ep of data.episodes ?? [])
    for (const p of ep.predictions) if (p.proxyTicker) set.add(String(p.proxyTicker).toLowerCase());
  return [...set];
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://allindex.fyi";
  const statics = ["", "/the-index", "/predictions", "/insights", "/awards", "/episodes"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.8,
  }));
  const holdings = allSlugs().map((slug) => ({
    url: `${base}/holding/${slug}`,
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));
  const hosts = REGULAR_HOSTS.map((h) => ({
    url: `${base}/host/${h.toLowerCase()}`,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));
  const episodes = allEpisodeIds().map((id) => ({
    url: `${base}/episode/${id}`,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));
  const proxies = usedProxyTickers().map((t) => ({
    url: `${base}/proxy/${t}`,
    changeFrequency: "weekly" as const,
    priority: 0.4,
  }));
  return [...statics, ...hosts, ...holdings, ...episodes, ...proxies];
}
