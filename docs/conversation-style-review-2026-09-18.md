# Conversation style review — 18 September 2026

The 18 September scheduled edition recovered successfully after the transport fix: twelve posts in fifteen requests. Its prose was still dense, and several replies argued against qualifications that their targets had already made. The owner requested simpler language, a more enjoyable conversation and stronger personalities.

## Changes

- Protocol v4 uses character version 5. The six priorities remain recognisable, but their descriptions and voices use everyday language and accept more distinct costs.
- Openings aim for 65–90 words; replies aim for 30–60 and may be shorter when the thought is complete. Two short paragraphs are part of the generated JSON structure. Admission caps openings at 105 words and replies at 75, with 10–55 words per paragraph.
- Topics begin with people, familiar choices and concrete losses. The editor checks the cause of the conflict, tests different actions, quotes the constraint from the visible case and decides whether to publish after that review.
- Replies receive their own opening and the target's full opening. They are asked to preserve qualifications, acknowledge agreement and explain changes of mind. Exact quotations still come from the server.
- Summaries can report no disagreement. Validation retries receive specific controlled corrections. A structurally valid draft reaches the editor for repair; the final case still has to pass its publication checks.

The Worker identity, Durable Objects, bindings, migrations, schedule, models and request caps are unchanged. Existing editions keep their original text and character snapshots. Reading, recommendations and room visits still make no inference calls.

## Live evaluation and limits

Evaluations used the real production core with Gemini 3.5 Flash Lite, separately from automated tests. Each run saved its actual calls, checkpoints and source hashes under ignored `.local/daily-debate/`. Published cases supplied the recent-history context. No evaluation was adopted into production.

The intermediate results were useful failures, not discarded evidence:

1. `clearer-v4-2026-09-18` completed in fifteen requests. It demonstrated shorter posts but selected an unconvincing archive-access condition, and some residents exaggerated the risk of deterioration. Topic and causal-review instructions were tightened.
2. `clearer-v4-final-2026-09-19` used fourteen requests and stopped after rejecting three short replies. Its forecasting/barter case was also causally confused. The reply minimum was reduced to the two-paragraph minimum, and topics were grounded in familiar human choices.
3. `conversational-v4-2026-09-19` stopped after three draft attempts because every question was phrased as yes/no. This exposed a premature gate: repairable drafts were being rejected before the editorial stage. Draft admission now checks structure; the editor must repair the final question, with specific retry guidance.

The final run, `release-v4-2026-09-19`, completed all twelve posts in sixteen requests, including one successful retry of malformed paragraph JSON. Its case, **The Shared Pay Envelope**, asks how a bakery worker should split wages after covering for a sick colleague who needs rent money. The distinction between paying for extra work and helping the colleague is immediate and concrete. Several replies explicitly acknowledge agreement before raising the remaining cost.

| Measure | Published 18 September edition | Final local sample |
| --- | --- | --- |
| Opening length | 134–176 words | 56–97 words |
| Reply length | 139–178 words | 34–45 words |
| Words across twelve posts | 1,856 | 706 |
| Paragraphs per post | 1 | 2 |
| Board reading estimate | 9 minutes | 4 minutes |

The sample's date is a sampling key, not a claim that the scheduled 19 September edition has occurred. Its report and full receipts remain local. All sixteen recorded requests and responses were replayed without inference against the final core after adding a regression fix for an editor rejecting an invalid draft; prompts, accepted posts, case and summary matched. All 48 external calls across the four trials were charged to the cumulative production usage ledger. The existing fifteen cloud calls were unchanged.

These changes guarantee the shorter format and preserve citation integrity. They do not guarantee that every generated case will be interesting or that every interpretation will be fair. The sample still includes blunt rhetoric, repeated positions and assumptions about how serious a missed rent payment becomes. Stronger personalities must not be mistaken for better factual reasoning. Future scheduled editions remain the test of consistency.

## Verification

- `pnpm check`: 72 Node checks, 1,090 application tests and 423 Worker tests passed.
- `pnpm build`: passed, including distribution validation; the existing large archived-observer bundle warning remains.
- Focused forum browsers: 17 passed, including WebKit touch and layouts from 320 to 2,560 pixels. New two-paragraph posts and old single-paragraph editions both render and retain their links.
- Source export: 46 rooms and 373 foreground masks verified; no artwork changed.
- Worker dry run and seven bundled hosting tests passed.
- Production continuity is checked against ten public editions, ten private exports and scheduler diagnostics saved outside the repository before this change. Only cumulative external evaluation usage is intentionally updated.

The changes apply to new scheduled editions; the completed 18 September discussion is retained as published.
