<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Data, the nightly cron, and merge conflicts

`.github/workflows/update-index.yml` runs **every 6 hours**: it processes new
episodes, rebuilds the index, and commits all of `data/` straight to `main`
(`chore: update index …`), which auto-deploys. So `data/holdings.json` is
**owned by the cron** — it is a derived artifact, not a source file.

Because of that, any branch that touches `data/` **will conflict with the cron
on `holdings.json`**. The source of truth is the per-episode theses + the code,
*not* the rebuilt `holdings.json`. To resolve a conflict, never hand-merge the
JSON — rebuild it from the merged theses:

```sh
git merge origin/main          # conflicts on data/holdings.json
npx tsx pipeline/cli.ts build-index --frozen   # regenerate from merged theses (cached prices, offline)
git add -A && git commit        # completes the merge
```

`--frozen` reuses the local price cache (`data/prices/`, git-ignored, seeded
per-machine) so a targeted fix re-judges only the episodes you changed without
refetching every price or moving any number that shouldn't move. To apply a
fix to a few episodes: `reextract --only E1,E2,…` → `build-index --frozen`, then
diff the funds before/after to confirm only what you intended changed.

The cron's `lint` + `test` gate runs the same `npm test` you do locally, and a
**stale-price guard** fails the run loudly if the index as-of date falls >5 days
behind — so a sync that silently stops refreshing can't sit green.
