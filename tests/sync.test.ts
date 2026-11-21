import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fetchFeed } from "../pipeline/rss";
import { selectSyncEpisodes } from "../pipeline/sync";
import type { Episode } from "../lib/types";

function episode(number: number): Episode {
  return {
    id: `E${number}`, number, title: `Episode ${number}`,
    date: `2026-10-${String(number).padStart(2, "0")}T00:00:00.000Z`,
    audioUrl: "https://example.com/audio.mp3", durationSec: 100,
    kind: "roundtable", guests: [], link: "https://example.com/episode",
  };
}

test("bounded catch-up processes oldest new episodes before moving the floor", () => {
  const feed = [episode(5), episode(4), episode(3), episode(2), episode(1)];
  const first = selectSyncEpisodes(feed, [episode(1)], new Set(), { limit: 2 });
  assert.deepEqual(first.todo.map((e) => e.id), ["E2", "E3"]);
  assert.equal(first.eligibleCount, 4);
  const next = selectSyncEpisodes(feed, [episode(1), ...first.todo], new Set(), { limit: 2 });
  assert.deepEqual(next.todo.map((e) => e.id), ["E4", "E5"]);
});

test("roundtable files with bare episode numbers are recognized in the feed", async () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
    <rss><channel>
      <item>
        <title>GPT-6 Hits AGI? Tech Euphoria 2.0</title>
        <guid>a3cf57b6-0471-4554-a7e1-a41345c06d96</guid>
        <enclosure url="https://traffic.libsyn.com/secure/allinchamathjason/E288_AUDIO_v102.mp3?dest-id=1928300" />
      </item>
      <item>
        <title>Dario Defends Himself, Datacenter Panic</title>
        <guid>688c4809-9cf4-4d77-b5d7-482ee43e7ccc</guid>
        <enclosure url="https://traffic.libsyn.com/secure/allinchamathjason/E286_99_AUDIO.mp3?dest-id=1928300" />
      </item>
      <item>
        <title>More Trillion Dollar IPOs</title>
        <enclosure url="https://traffic.libsyn.com/secure/allinchamathjason/ALLIN-E280_Ch.mp3?dest-id=1928300" />
      </item>
      <item>
        <title>Bill Ackman: Investing</title>
        <guid>ackman-interview</guid>
        <enclosure url="https://traffic.libsyn.com/secure/allinchamathjason/Ackman.mp3" />
      </item>
    </channel></rss>`;
  const episodes = await fetchFeed(`data:application/rss+xml,${encodeURIComponent(feed)}`);
  assert.deepEqual(episodes.map(({ id, number, kind }) => [id, number, kind]), [
    ["E288", 288, "roundtable"],
    ["E286", 286, "roundtable"],
    ["E280", 280, "roundtable"],
    ["ackman-interview", null, "interview"],
  ]);
});

test("failed metadata-only episode retries even after a later episode succeeds", () => {
  const result = selectSyncEpisodes(
    [episode(4), episode(3), episode(2), episode(1)],
    [episode(1), episode(3)], new Set(["E2"]), { limit: 2 },
  );
  assert.deepEqual(result.todo.map((e) => e.id), ["E2", "E4"]);
  assert.equal(result.skippedOlder, 0);
});

test("forward-only sync leaves untouched historical gaps for explicit backfill", () => {
  const feed = [episode(3), episode(2), episode(1)];
  const result = selectSyncEpisodes(feed, [episode(2)], new Set());
  assert.deepEqual(result.todo.map((e) => e.id), ["E3"]);
  assert.equal(result.skippedOlder, 1);
  const backfill = selectSyncEpisodes(feed, [episode(2)], new Set(), { includeOlder: true });
  assert.deepEqual(backfill.todo.map((e) => e.id), ["E1", "E3"]);
});

test("only completed episodes are counted in the index, including a valid empty extraction", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "all-in-sync-"));
  try {
    // Load the store in a separate process so its cwd-based data directory is
    // isolated from the repository's actual episode artifacts.
    const storeUrl = new URL("../pipeline/store.ts", import.meta.url).href;
    const indexUrl = new URL("../pipeline/build-index.ts", import.meta.url).href;
    execFileSync(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"), "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import fs from "node:fs";
      const { default: { store } } = await import(${JSON.stringify(storeUrl)});
      const { default: { buildIndex, buildFundOnly } } = await import(${JSON.stringify(indexUrl)});
      globalThis.fetch = () => { throw new Error("Unexpected network request"); };
      store.saveEpisode({ id: "E1" });
      assert.equal(store.hasTheses("E1"), false);
      store.saveTheses("E1", []);
      assert.equal(store.hasTheses("E1"), true);
      assert.deepEqual(store.loadTheses("E1"), []);
      assert.equal(fs.existsSync("data/episodes/E1/episode.json"), true);
      store.saveEpisode({ id: "E2" });

      const snapshot = await buildIndex();
      assert.equal(snapshot.episodesProcessed, 1);
      assert.deepEqual(Object.keys(snapshot.episodes), ["E1"]);

      store.saveIndex({ ...snapshot, episodesProcessed: 2 });
      await buildFundOnly();
      const rebuilt = store.loadIndex();
      assert.equal(rebuilt.episodesProcessed, 1);
      assert.deepEqual(Object.keys(rebuilt.episodes), ["E1"]);
    `], { cwd: dir, stdio: "pipe" });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
