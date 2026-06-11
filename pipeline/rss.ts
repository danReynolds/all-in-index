import { XMLParser } from "fast-xml-parser";
import { ALLIN_FEED_URL } from "./config";
import type { Episode, EpisodeKind } from "../lib/types";

interface RawItem {
  title?: string;
  pubDate?: string;
  guid?: string | { "#text"?: string };
  link?: string;
  enclosure?: { "@_url"?: string; "@_length"?: string; "@_type"?: string };
  "itunes:duration"?: string | number;
  "itunes:episode"?: string | number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function text(v: string | { "#text"?: string } | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return v["#text"] ?? "";
}

/** "01:42:00" | "5820" (seconds) | 5820 -> seconds */
function parseDuration(d: string | number | undefined): number | null {
  if (d == null) return null;
  if (typeof d === "number") return d;
  if (/^\d+$/.test(d)) return parseInt(d, 10);
  const parts = d.split(":").map((p) => parseInt(p, 10));
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** A stable, filesystem-safe id from the GUID (or audio URL fallback). */
function makeId(guid: string, audioUrl: string): string {
  const basis = guid || audioUrl;
  // Prefer an episode tag if present in the audio filename.
  const epTag = audioUrl.match(/ALLIN-E(\d+)/i);
  if (epTag) return `E${epTag[1]}`;
  return basis
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function detectNumber(title: string, audioUrl: string): number | null {
  const fromUrl = audioUrl.match(/ALLIN-E(\d+)/i);
  if (fromUrl) return parseInt(fromUrl[1], 10);
  const fromTitle = title.match(/\bE(\d{2,4})\b/);
  if (fromTitle) return parseInt(fromTitle[1], 10);
  return null;
}

function classify(
  title: string,
  audioUrl: string,
): { kind: EpisodeKind; guests: string[] } {
  if (/ALLIN-E\d+/i.test(audioUrl)) return { kind: "roundtable", guests: [] };
  // Interview episodes commonly lead with the guest name: "Bill Ackman: ...".
  const m = title.match(/^([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,2}):\s/);
  if (m) return { kind: "interview", guests: [m[1].trim()] };
  return { kind: "special", guests: [] };
}

function toEpisode(item: RawItem): Episode | null {
  const enc = item.enclosure;
  const audioUrl = enc?.["@_url"];
  if (!audioUrl) return null;
  const title = (item.title ?? "").trim();
  const guid = text(item.guid);
  const id = makeId(guid, audioUrl);
  const { kind, guests } = classify(title, audioUrl);
  const pub = item.pubDate ? new Date(item.pubDate) : null;
  return {
    id,
    number: detectNumber(title, audioUrl),
    title,
    date: pub && !Number.isNaN(pub.getTime()) ? pub.toISOString() : "",
    audioUrl,
    durationSec: parseDuration(item["itunes:duration"]),
    kind,
    guests,
    link: item.link ?? null,
  };
}

export async function fetchFeed(url = ALLIN_FEED_URL): Promise<Episode[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status} ${res.statusText}`);
  const xml = await res.text();
  const doc = parser.parse(xml);
  const items: RawItem[] = doc?.rss?.channel?.item ?? [];
  const eps = items
    .map(toEpisode)
    .filter((e): e is Episode => e !== null);

  // Disambiguate id collisions (the feed occasionally reuses an episode number,
  // e.g. a numbered show + a same-numbered special). The first (newest)
  // occurrence keeps the clean id; later ones get a "-2", "-3", … suffix.
  const counts = new Map<string, number>();
  for (const e of eps) {
    const n = (counts.get(e.id) ?? 0) + 1;
    counts.set(e.id, n);
    if (n > 1) e.id = `${e.id}-${n}`;
  }
  return eps;
}

export interface SelectOpts {
  /** Episode id, e.g. "E274". */
  id?: string;
  /** Episode number, e.g. 274. */
  number?: number;
  /** Only consider roundtable episodes. */
  roundtableOnly?: boolean;
}

/** Pick one episode from the feed (defaults to the latest roundtable). */
export async function selectEpisode(opts: SelectOpts = {}): Promise<Episode> {
  const eps = await fetchFeed();
  if (opts.id) {
    const hit = eps.find((e) => e.id === opts.id);
    if (!hit) throw new Error(`No episode with id "${opts.id}" in feed.`);
    return hit;
  }
  if (opts.number != null) {
    const hit = eps.find((e) => e.number === opts.number);
    if (!hit) throw new Error(`No episode numbered ${opts.number} in feed.`);
    return hit;
  }
  const pool = opts.roundtableOnly
    ? eps.filter((e) => e.kind === "roundtable")
    : eps;
  if (pool.length === 0) throw new Error("Feed contained no usable episodes.");
  return pool[0]; // feed is newest-first
}
