import type { MetadataRoute } from "next";
import { allSlugs, allEpisodeIds } from "@/lib/data";
import { REGULAR_HOSTS } from "@/lib/types";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://allindex.fyi";
  const statics = ["", "/the-index", "/predictions", "/signals", "/awards", "/episodes"].map((p) => ({
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
  return [...statics, ...hosts, ...holdings, ...episodes];
}
