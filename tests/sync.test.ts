import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
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
  const next = selectSyncEpisodes(feed, [episode(1), ...first.todo], new Set(), { limit: 2 });
  assert.deepEqual(next.todo.map((e) => e.id), ["E4", "E5"]);
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

test("completion requires extracted theses, including a valid empty extraction", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "all-in-sync-"));
  try {
    // Load the store in a separate process so its cwd-based data directory is
    // isolated from the repository's actual episode artifacts.
    const storeUrl = new URL("../pipeline/store.ts", import.meta.url).href;
    execFileSync(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"), "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import fs from "node:fs";
      const { default: { store } } = await import(${JSON.stringify(storeUrl)});
      store.saveEpisode({ id: "E1" });
      assert.equal(store.hasTheses("E1"), false);
      store.saveTheses("E1", []);
      assert.equal(store.hasTheses("E1"), true);
      assert.deepEqual(store.loadTheses("E1"), []);
      assert.equal(fs.existsSync("data/episodes/E1/episode.json"), true);
    `], { cwd: dir, stdio: "pipe" });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
