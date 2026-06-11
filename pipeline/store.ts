import fs from "node:fs";
import path from "node:path";
import {
  DATA_DIR,
  EPISODES_DIR,
  HOLDINGS_FILE,
} from "./config";
import type { Episode, Transcript, Thesis, IndexSnapshot } from "../lib/types";

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file: string, data: unknown) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/** Per-episode artifacts live under data/episodes/<id>/. */
function episodeDir(episodeId: string) {
  return path.join(EPISODES_DIR, episodeId);
}

export const store = {
  saveEpisode(ep: Episode) {
    writeJson(path.join(episodeDir(ep.id), "episode.json"), ep);
  },
  loadEpisode(id: string) {
    return readJson<Episode>(path.join(episodeDir(id), "episode.json"));
  },

  saveTranscript(t: Transcript) {
    writeJson(path.join(episodeDir(t.episodeId), "transcript.json"), t);
  },
  loadTranscript(id: string) {
    return readJson<Transcript>(path.join(episodeDir(id), "transcript.json"));
  },

  saveTheses(episodeId: string, theses: Thesis[]) {
    writeJson(path.join(episodeDir(episodeId), "theses.json"), theses);
  },
  loadTheses(episodeId: string) {
    return readJson<Thesis[]>(path.join(episodeDir(episodeId), "theses.json")) ?? [];
  },

  /** All episode ids that have artifacts on disk. */
  listEpisodeIds(): string[] {
    if (!fs.existsSync(EPISODES_DIR)) return [];
    return fs
      .readdirSync(EPISODES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  },

  saveIndex(snapshot: IndexSnapshot) {
    writeJson(HOLDINGS_FILE, snapshot);
  },
  loadIndex() {
    return readJson<IndexSnapshot>(HOLDINGS_FILE);
  },

  dataDir: DATA_DIR,
};
