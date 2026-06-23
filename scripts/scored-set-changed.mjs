// Decide whether a pipeline run changed WHAT we score (fund membership) or only
// refreshed prices/returns. Membership changes ship a person a review PR; pure
// price refreshes auto-deploy. Run with plain node (no deps):
//
//   node scripts/scored-set-changed.mjs <before.json> <after.json> [out.md]
//
// Prints "scored" or "price-only" to stdout, and writes a human-readable summary
// of the membership delta to out.md (default scored-change.md) for the PR body.

import fs from "node:fs";

const [beforePath, afterPath, outMd = "scored-change.md"] = process.argv.slice(2);
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/**
 * The scored SET behind every reviewable surface — tickers only, so a price move
 * doesn't count. Covers the index/bear book/guesties AND the per-host funds and
 * per-guest scorecards: a host opening a call on a name already in the index, or
 * a guest's first scored call, is a scored change that must route to review even
 * though the headline ticker-sets don't move.
 */
const membership = (s) => {
  const sets = {
    "Besties Index": (s.indexFund?.constituents ?? []).map((c) => c.ticker).sort(),
    "Bear Book": (s.bearBook ?? []).map((b) => b.ticker).sort(),
    "Guesties Index": (s.guestiesFund?.constituents ?? []).map((c) => c.ticker).sort(),
  };
  for (const [host, f] of Object.entries(s.hostFunds ?? {})) {
    sets[`${host}'s calls`] = (f.constituents ?? []).map((c) => c.ticker).sort();
  }
  sets["Guest scorecards"] = (s.guestLeaderboard ?? [])
    .flatMap((g) => (g.picks ?? []).map((p) => `${g.guest ?? g.slug}:${p.ticker}`))
    .sort();
  return sets;
};

const before = membership(load(beforePath));
const after = membership(load(afterPath));

let changed = false;
const lines = [];
for (const fund of new Set([...Object.keys(before), ...Object.keys(after)])) {
  const a = after[fund] ?? [];
  const b = before[fund] ?? [];
  const added = a.filter((t) => !b.includes(t));
  const dropped = b.filter((t) => !a.includes(t));
  if (added.length || dropped.length) {
    changed = true;
    const parts = [];
    if (added.length) parts.push(`added ${added.join(", ")}`);
    if (dropped.length) parts.push(`dropped ${dropped.join(", ")}`);
    lines.push(`- **${fund}**: ${parts.join("; ")}`);
  }
}

fs.writeFileSync(
  outMd,
  changed
    ? `An automated index run **changed the scored set** — a human should eyeball it before it goes live (a new scored call, a flip, or a dropped position):\n\n${lines.join("\n")}\n\nPrices/returns also refreshed in this run. Merge to deploy.\n`
    : "Price/return refresh only — no membership change.\n",
);

process.stdout.write(changed ? "scored\n" : "price-only\n");
