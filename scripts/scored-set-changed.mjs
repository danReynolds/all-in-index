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

/** The scored SET each fund holds — tickers only, so a price move doesn't count. */
const membership = (s) => ({
  "Besties Index": (s.indexFund?.constituents ?? []).map((c) => c.ticker).sort(),
  "Bear Book": (s.bearBook ?? []).map((b) => b.ticker).sort(),
  "Guesties Index": (s.guestiesFund?.constituents ?? []).map((c) => c.ticker).sort(),
});

const before = membership(load(beforePath));
const after = membership(load(afterPath));

let changed = false;
const lines = [];
for (const fund of Object.keys(after)) {
  const added = after[fund].filter((t) => !before[fund].includes(t));
  const dropped = before[fund].filter((t) => !after[fund].includes(t));
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
