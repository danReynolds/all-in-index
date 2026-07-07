# Social Automation Playbook

This is the operating guide for automated and semi-automated X posts for The
All-Index. Keep it current as platform behavior, X API pricing, and our own
audience data change.

## Goal

Grow a useful audience by publishing receipt-backed market commentary from the
index, not generic podcast promo.

The account should make the site feel alive: latest episode calls, portfolio
status, live disagreements, old receipts, and prediction check-ins. Every post
should stand on its own in the X feed and give readers a reason to follow even
when they do not click through.

## Voice

- Crisp, factual, and slightly opinionated.
- Scoreboard language: calls, receipts, track record, alpha, live disagreement.
- Fair to the hosts. Do not dunk on people just because a call is down.
- Concrete numbers over adjectives.
- No financial advice language. Say "scoreboard", "tracked call", "if followed",
  or "since the call", not "buy", "sell", or "trade this".
- No fake urgency. Avoid "breaking", "must see", "insane", "guaranteed", and
  similar engagement bait.
- Use host names naturally. Do not tag hosts automatically.

## X Best Practices

Treat these as defaults, not permanent laws. Review them monthly.

- Do not put URLs in the main post by default. Current third-party studies and
  X's own API pricing both make link-first posts a bad default. Put the useful
  content in the main post, then add the deep link in a reply when the link
  materially helps.
- If using a thread, keep it short: usually 2-4 posts. The first post must work
  without opening the thread.
- Use native images for recurring scoreboard posts when available. Prefer a
  generated card or chart screenshot over a bare link preview.
- Use the most specific deep link: `/the-index`, `/insights`, `/predictions`,
  `/awards`, `/episode/[id]`, `/holding/[slug]`, `/host/[host]`, or
  `/guest/[slug]`. Do not default to the homepage.
- Ask concrete questions only when the post is naturally debatable. Avoid empty
  engagement prompts.
- Use hashtags sparingly. Most posts should use none. A relevant cashtag is fine
  for one or two public names when it is central to the post, but do not turn
  the post into a ticker cloud.
- Avoid duplicate phrasing. The same template should not run twice in the same
  two-week window unless the underlying event is materially new.
- Do not automate replies to other accounts, keyword searches, trends, or host
  posts. That is both low-quality growth and a policy risk.
- Treat bearish/fumble posts, host comparisons, quote excerpts, new extractions,
  and any current-news framing as review-required.

Useful references:

- X automation policy: https://help.x.com/en/rules-and-policies/x-automation
- X API pricing: https://docs.x.com/x-api/getting-started/pricing
- Buffer link-performance study: https://buffer.com/resources/links-on-x/
- Buffer 2026 X timing study: https://buffer.com/resources/best-time-to-post-on-twitter-x/
- Sprout 2026 X timing study: https://sproutsocial.com/insights/best-times-to-post-on-twitter/

## Post Types

### Latest Episode Recap

Purpose: turn each newly processed episode into one timely, native summary.

Trigger: after a new episode is processed, the site builds, and the social
generator can see the episode page data.

Default format:

1. Main post: the highest-signal 1-2 calls or disagreements from the episode,
   no URL.
2. Optional reply: one more receipt or "what changed in the index".
3. Link reply: episode deep link.

Review level: required until the generator has a strong record. Always review
when a scored-set change is involved.

### Portfolio Pulse

Purpose: keep followers oriented on the live scoreboard.

Trigger: weekly, using the latest deployed index data.

Default format:

1. Main post: Besties Index vs S&P, active position count, and one leader or
   laggard, no URL.
2. Optional native image: index chart or compact scoreboard card.
3. Link reply: `/the-index`.

Review level: can become auto-publishable once templates are stable because it
is derived from already-published data and avoids quotes.

### Receipt Of The Week

Purpose: resurface one old call with the current outcome.

Trigger: weekly, rotating through high-signal holding pages.

Default format:

1. Main post: host, company, call date, current return or alpha.
2. Thread post: short attribution and why it mattered.
3. Link reply: holding page deep link.

Review level: required when using direct quote text, bearish language, or a
"wrong so far" frame.

### Open Duel

Purpose: create discussion around active host disagreements.

Trigger: weekly, from `activeDuels()` in `lib/insights.ts`.

Default format:

1. Main post: "On [company], [bulls] are bullish and [bears] are bearish. Since
   the disagreement crystallized: [return]."
2. Optional follow-up: who is currently winning and what would change the score.
3. Link reply: `/insights`.

Review level: review-required until tone is proven.

### Prediction Check-In

Purpose: keep the prediction page visible without over-posting.

Trigger: monthly, plus event-driven when a prediction resolves.

Default format:

1. Main post: one prediction whose status changed or is nearing a deadline.
2. Optional reply: current scorecard.
3. Link reply: `/predictions`.

Review level: required for resolved predictions; draft-only for ambiguous or
manual judgments.

### Awards And Leaderboards

Purpose: package the index into shareable recurring hooks.

Trigger: every other week or monthly, using `computeAwards()` and host/guest
leaderboards.

Default format:

1. Main post: one award, recipient, and stat.
2. Optional thread post: runner-up or receipt.
3. Link reply: `/awards`, `/host/[host]`, or `/guest/[slug]`.

Review level: required for fumbles, bear traps, or host comparisons that could
read as personal.

### Quarterly Portfolio Report

Purpose: create a durable scoreboard moment.

Trigger: first suitable weekday after quarter end, once the latest index build is
fresh.

Default format:

1. Main post: quarterly scoreboard headline, no URL.
2. Thread posts: best call, worst call, new entrants/exits, benchmark compare.
3. Link reply: `/the-index`.

Review level: required. This should feel like an editorial report, not a cron
status update.

## Schedule

All times below are Eastern Time. GitHub Actions schedules use UTC, so workflows
must convert explicitly or document the UTC equivalent.

Use `social/schedule.json` as the machine-readable seed for future workflow and
generator code. The schedule is intentionally conservative: quality beats volume
while the account is small.

Recommended standing cadence:

- Tuesday 9:10 AM: weekly portfolio pulse.
- Wednesday 10:10 AM: receipt of the week.
- Thursday 12:30 PM: open duel or insights post.
- Friday 1:10 PM: latest episode recap only when a new processed episode exists.
- First Tuesday of each month 10:10 AM: prediction check-in or awards post.
- First Tuesday after quarter end 10:30 AM: quarterly portfolio report.
- Monday 11:00 AM: performance review, no public post.

If the weekly episode lands later than expected, freshness can beat the slot.
Post the recap 30-90 minutes after the episode page is live, unless that puts it
late evening or weekend. In that case, hold for the next weekday morning.

## Review Gates

Draft-only until manually approved:

- Any post based on a newly extracted episode.
- Any post tied to a scored-set change PR.
- Any post with a quote excerpt.
- Any post that frames a host as wrong, flip-flopping, trapped, fumbling, or
  losing a duel.
- Any post with `@` mentions.
- Any post that ties the index to external news or trends.

Eligible for later auto-publish:

- Weekly portfolio pulse with no quote, no mention, and no URL in the main post.
- Simple leaderboard or index-status update using already-deployed data.
- Low-risk awards that do not target a person negatively.

## Performance Review Loop

The point of automation is not to set and forget. Review performance on a fixed
cadence and change the playbook when the data says to.

Weekly review:

- Pull the last 7 days of posts.
- Record impressions, likes, reposts, replies, bookmarks, profile visits,
  follows, link clicks when available, and qualitative reply quality.
- Mark each post by type, time, format, whether it used an image, whether it had
  a link reply, and whether the main post had a URL.
- Pick one lesson and one experiment for the next week.

Monthly review:

- Compare post types by median engagement rate and follower conversion.
- Identify the top 3 posts and bottom 3 posts.
- Decide whether to change cadence, timing, thread length, visual use, or tone.
- Update this playbook and `social/schedule.json` if the change should persist.

Quarterly review:

- Evaluate whether X is driving site visits, follows, direct mentions, and
  durable discovery.
- Decide whether to add another channel, raise/lower frequency, or start limited
  auto-publishing.

Suggested review artifact:

```
social/reviews/YYYY-MM-DD.md
```

Start from `social/reviews/TEMPLATE.md`.

Each review should include:

- Date range.
- Posts reviewed.
- Best performer and why.
- Worst performer and likely cause.
- Experiments run.
- Decision for next period.
- Playbook updates made.

## Implementation Notes

Future generator output should separate:

- `mainPost`: no URL unless explicitly allowed.
- `threadPosts`: optional native context.
- `linkReply`: optional deep link reply.
- `risk`: `low`, `medium`, or `high`.
- `reviewRequired`: boolean.
- `evidence`: holding, episode, insight, prediction, or award IDs used.
- `scheduleId`: one of the IDs from `social/schedule.json`.

The ledger should live outside `data/` because the index cron owns `data/`.
Use `social/ledger.json` or GitHub issue comments for dedupe and audit history.

## Current Commands

Generate review drafts:

```bash
npm run social -- generate
npm run social -- generate --schedule-id weekly-portfolio-pulse
npm run social -- generate --schedule-id weekly-receipt --json-out social/drafts/latest.json --md-out social/drafts/latest.md --assets-dir social/drafts/assets
```

Preview a publish thread without contacting X:

```bash
npm run social -- publish --candidate-file social/drafts/latest.json --dry-run
```

Publish safety:

- Non-dry-run publishing is allowed by default only for candidates with
  `reviewRequired=false` and `autoPublishEligible=true`.
- To publish a manually reviewed candidate that fails that gate, pass
  `--allow-reviewed` locally or set `allow_reviewed=true` in the manual GitHub
  workflow dispatch.

Record a manually published post in the ledger:

```bash
npm run social -- ledger add \
  --candidate-file social/drafts/latest.json \
  --post-url https://x.com/i/web/status/POST_ID
```

Inspect the ledger:

```bash
npm run social -- ledger list
```

Validate social automation without contacting X:

```bash
npm run social:check
```

Use `npm run social -- check --require-x-credentials` only when verifying a
real-publish environment; ordinary CI should allow missing X credentials so
draft generation and dry-run publishing can stay active before launch.

Verify X credentials without creating a public post:

```bash
npm run social -- check --require-x-credentials --verify-x-api --require-expected-x-username
```

That check calls X's authenticated-user endpoint (`/2/users/me`). It catches
misconfigured Apps, missing user-context permissions, and API access enrollment
issues before a non-dry-run publish attempts `POST /2/tweets`.

## GitHub Workflows

- `social-drafts.yml` creates or updates stable review issues by schedule slot
  and labels them `social-draft` + `needs-review`.
- `social-publish.yml` is manual-dispatch only. Its default is `dry_run=true`.
  Non-dry-run publishing requires X credentials and commits the resulting
  `social/ledger.json` update back to the repo. Review-required candidates also
  require `allow_reviewed=true`. The publish step verifies the authenticated X
  account against `X_EXPECTED_USERNAME` before the first public post.
- `social-review.yml` opens a weekly internal performance-review issue from
  `social/reviews/TEMPLATE.md`.
- `social-check.yml` validates the generator on PRs. Manual dispatch can also
  run the no-post X credential verification by setting `verify_x_api=true`.

Draft generation can emit deterministic SVG scorecards for candidates with a
useful native visual. Today that covers the weekly portfolio pulse and quarterly
report; the draft workflow uploads those files as `social-draft-assets`.

Publishing credentials:

- Preferred for CI: OAuth 1.0a user-context tokens via `X_API_KEY`,
  `X_API_SECRET`, `X_ACCESS_TOKEN`, and `X_ACCESS_TOKEN_SECRET`.
- Required for CI non-dry-run publishing: GitHub Actions variable
  `X_EXPECTED_USERNAME`, set to the exact posting-account handle without `@`.
- Fallback for local/manual experiments: `X_BEARER_TOKEN` only if it is a
  user-context token with write scope. App-only bearer tokens are read-only and
  cannot publish posts.

The user-context tokens must belong to the public All Index posting account, not
the developer's personal X account. X access tokens represent the account that
authorized the App; if the verifier prints a personal handle, do not publish
with those tokens.

The publish command posts the main post first, then replies in order with thread
posts and the optional link reply. This preserves the link-free main-post rule
while keeping the deep link attached to the conversation.

## Production Rollout Checklist

After this system merges to `main`, roll it out in order:

1. Run `Social Drafts` manually with `schedule_id=weekly-portfolio-pulse`.
2. Confirm the generated issue has:
   - link-free main post copy,
   - a deep-link reply,
   - evidence and route metadata,
   - uploaded SVG asset when expected.
3. Run `Social Publish` manually with the same schedule ID and `dry_run=true`.
4. Create or sign in as the dedicated All Index X account, then authorize the
   developer App from that account. Add the resulting user-context credentials to
   GitHub Secrets:
   - `X_API_KEY`
   - `X_API_SECRET`
   - `X_ACCESS_TOKEN`
   - `X_ACCESS_TOKEN_SECRET`
5. Add GitHub Actions variable `X_EXPECTED_USERNAME` with the dedicated account
   handle, without `@`.
6. Run `Social Check` manually with `verify_x_api=true`; it must verify the
   dedicated X account before any non-dry-run publish.
7. Run one controlled non-dry-run publish for `weekly-portfolio-pulse`.
8. Confirm:
   - the X thread posted in order,
   - the main post has no URL,
   - the link reply points to the right page,
   - `social/ledger.json` was committed by the workflow,
   - the next draft generation skips the recently used topic.
9. Keep all review-required schedules manual for the first 1-2 weeks.
10. Fill in one weekly performance review issue before changing cadence or
   enabling broader auto-publish.

Do not enable unattended publishing for episode recaps, receipts, duels,
prediction resolutions, fumbles, bear traps, quote excerpts, or host mentions
until the review loop has enough real post data to justify it.
