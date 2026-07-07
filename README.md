# The All-Index

An unofficial, automatically-updated index of the companies analyzed on the
[All-In podcast](https://www.allinpodcast.co/). For each company it shows **what
each host actually said** (per-host theses with attributed excerpts), a
**synthesized view** of the discussion, **independent market data**, and
**retrospective performance** — how the call has played out since.

> **Not financial advice.** Informational/commentary only. Independent project,
> not affiliated with or endorsed by the podcast or its hosts. Full transcripts
> are kept private; only short, attributed excerpts are published.

---

## How it works

```
RSS feed ──▶ AssemblyAI ──▶ Claude ──▶ Claude ──▶ Yahoo Finance ──▶ holdings.json ──▶ Next.js site
 (episodes)  (transcribe +   (name      (extract    (price history +   (aggregated)     (Vercel)
              diarize)        speakers)   theses)     performance)
```

1. **`pipeline/rss.ts`** — reads the All-In RSS feed, classifies episodes
   (roundtable / interview), extracts audio URLs. *(no key)*
2. **`pipeline/transcribe.ts`** — AssemblyAI transcribes with diarization +
   word timestamps. Speakers come back as anonymous clusters (A, B, C…).
3. **`pipeline/speakers.ts`** — Claude maps clusters → hosts
   (Chamath / Jason / Sacks / Friedberg / Guest) using direct-address cues and
   the standard intro.
4. **`pipeline/extract.ts`** — Claude extracts per-host company theses:
   stance, conviction, reasoning, a short verbatim quote, and a timestamp.
5. **`pipeline/market.ts`** — Yahoo Finance daily history; returns anchored to
   the episode date over 1m / 3m / 6m / 1y / since. *(no key)*
6. **`pipeline/build-index.ts`** — aggregates theses into company holdings,
   attaches market data, and synthesizes the cross-host view → `data/holdings.json`.
   The headline index includes public companies whose **current scored view** is
   net-bullish, entering when that bullish stance was adopted. Host funds are
   stricter: they trade only portfolio-scored exposure windows such as explicit
   longs/shorts, ranked investment selections, and pair/basket legs.
7. **`app/`** — Next.js site renders the index and per-holding detail pages.

### Scoring threshold

- **Scored views** are attributed medium/high-conviction theses. They can move a
  holding's current bull/bear/mixed stance and the headline Besties Index.
- **Portfolio-scored calls** are a narrower subset: explicit in/out language,
  ranked investment selections, explicit shorts, or named pair/basket legs. They
  drive the per-host funds and chart markers.
- **Audited but not traded** receipts include conditional calls, day-trade
  asides, private companies, broad-market or macro exposures, benchmark
  ETFs/baskets, crypto tokens, and unpriced names. Host pages show these with
  exclusion reasons instead of silently dropping them.
- **Commentary/low-confidence rows** stay visible where useful, but do not move
  simulated performance.

## Quick start

```bash
npm install
cp .env.example .env      # then fill in the two API keys

# These work with no keys:
npm run pipeline feed                      # list latest episodes
npm run pipeline market NVDA 2025-05-22    # test market data
npm run dev                                # view the site (uses sample data until you run the pipeline)
```

### Run the full pipeline on one episode

Needs `ASSEMBLYAI_API_KEY` and `ANTHROPIC_API_KEY` in `.env`:

```bash
npm run pipeline run --number 274     # or --latest, or --id E274
npm run dev                           # site now shows real, sourced theses
```

The transcript is cached on disk, so re-running to iterate on the extraction
prompts doesn't re-spend on transcription.

## Automation (no local runs)

`.github/workflows/update-index.yml` runs every 6 hours: it processes any new
episodes, rebuilds the index, and commits `data/`, which triggers a Vercel
deploy.

Social automation guidance lives in `docs/social-automation.md`, with the draft
posting cadence seeded in `social/schedule.json`. Social state should stay
outside `data/`; the index cron owns generated data artifacts.

To enable it:
1. Push this repo to GitHub.
2. Add repo secrets `ASSEMBLYAI_API_KEY` and `ANTHROPIC_API_KEY`.
3. Connect the repo to Vercel (zero-config Next.js deploy).

Backfill the catalog once with `npm run pipeline sync -- --limit 50` (repeat as
needed); after that the weekly drop is picked up automatically.

## Cost

- **Transcription:** AssemblyAI free tier ≈ 185 hrs (covers ~half the back
  catalog); then ~$0.27/hr. Ongoing weekly episode ≈ pennies.
- **Extraction:** Claude tokens — cents per episode (system prompts are cached).
- **Market data + hosting:** free (Yahoo Finance, Vercel hobby, GitHub Actions).

## Data layout

```
data/
  episodes/<id>/episode.json      # metadata        (committed)
  episodes/<id>/theses.json       # extracted theses (committed)
  episodes/<id>/transcript.json   # full transcript  (gitignored — private)
  holdings.json                   # aggregated index (committed; drives the site)
  sample/holdings.json            # illustrative fallback for key-less rendering
```

## Commands

| Command | Keys | What |
|---|---|---|
| `npm run pipeline feed` | – | list latest episodes |
| `npm run pipeline market <T> <date>` | – | test market data for a ticker |
| `npm run pipeline run [--latest \| --number N \| --id E274]` | ✓ | full slice for one episode |
| `npm run pipeline sync [--limit N]` | ✓ | process new episodes + rebuild index |
| `npm run pipeline build-index` | ✓ | re-aggregate processed episodes |
| `npm run pipeline audit-candidates [-- --all]` | – | scan cached private transcripts for high-signal picks/trades; reports transcript coverage and optionally prints all matched candidates |
| `npm run social generate` | – | generate review-first X/social draft candidates from the current index |
| `npm run social publish -- --candidate-file <file> --dry-run` | – | preview the exact X thread that would be published |
| `npm run social ledger list` | – | inspect the social posting ledger |
| `npm run quality` | – | validate generated-data invariants |
| `npm test` | – | run scoring-unit tests |
| `npm run dev` / `build` / `start` | – | the Next.js site |
