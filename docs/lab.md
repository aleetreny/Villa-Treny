# The Lab

Four small daily experiments on how one language model chooses, judges and reasons when it speaks as six fictional residents. They are observations, not demonstrations: each experiment states its unit of observation and, where meaningful, the baseline that chance alone would produce. Departures from a baseline are patterns in a sample; they do not establish a cause.

| Route | Experiment | Unit of observation | Baseline |
| --- | --- | --- | --- |
| `/lab` | Overview | — | — |
| `/lab/verdict`, and the end of every debate | The Verdict | one juror's complete ranking of the other five | uniform ballots: 3 points per juror–candidate cell |
| `/lab/coin` | The Coin | one model answer, `heads` or `tails` | 50% heads |
| `/lab/companions` | The Two Who Come | one resident's choice of two companions | 40% per eligible resident, 10% per pair, 16% mutual |
| `/lab/mystery` | The Villa Liar | one resident's accusation, explanation and confidence | 1 in 6 by guessing |

Every page accepts `?date=YYYY-MM-DD`. Pages read stored results only.

## Protocols

Protocol strings are stored with every run (`lab-verdict-v1`, `lab-coin-v1`, `lab-companions-v1`, `lab-mystery-v1`); the puzzle generator is `villa-liar-v1` and the walk scenario `walk-v1`. A wording change requires a new protocol so stored results remain comparable. Aggregations are stratified by model and protocol and computed by the deterministic functions in `src/lib/lab/aggregate.ts`.

**The Verdict.** Created only when the current date's v6 debate is complete. Each resident receives its own profile, the case and all nine attributed contributions, and a candidate list whose order rotates daily (stored). Structured output allows only the five other IDs; the server independently rejects self-votes, duplicates and incomplete rankings, retrying within budget. A winner is computed only from six valid ballots, using Borda points (5–1). Ties are resolved by first places, head-to-head among neutral voters (recomputed within any smaller tied group), then second- to fifth-place counts; a remaining tie is reported as joint winners. Participation count and first turn are stored as confounders. Historical debates are never backfilled: they show “No jury recorded”. A held debate shows “unavailable”; an unfinished one “pending”.

**The Coin.** Twelve requests per day: six **neutral** requests that are byte-identical (same system text, instruction, schema, model and settings; no persona or context) and six **persona** requests that add one resident's profile before the same instruction. Conditions are stored and displayed separately, never pooled. No random-number generator decides or replaces an answer; seeded randomness only assigns neutral answers to portraits. Invalid content (`invalid_json`, `truncated`, `blocked` or a schema mismatch) is recorded as invalid and **not retried**, because retrying would select which answers are observed; transport failures with no content are retried. The page shows Wilson 95% intervals and an exact two-sided binomial test. `heads` is always listed first, so a label-order effect cannot be separated from a preference; this is a stated limitation rather than a hidden condition.

**The Two Who Come.** The canonical text is “You are going downstairs for a short walk. You can invite exactly two of the other five residents. Who do you choose?” Candidates are described only by their existing profile lens and introduction, with an explicit instruction not to invent shared history. Candidate order rotates so that over five days each candidate appears once in every slot for each chooser; the order is stored and a position check is published. A resident's opportunities to be chosen are the valid choices made by the five *others*. Pair opportunities exclude decisions by either member of the pair. Mutual rates use days on which both answered.

**The Villa Liar.** `generatePuzzle(date)` builds six formal statements in anonymous roles (innocent, accuse, either, neither, liar, truthful, group, conditional), enumerates all six culprits and accepts the set only when exactly one assignment makes the culprit's statement false and the others true, at least four statement kinds appear, and exactly three statements are needed (a single comparable difficulty band). Roles are then mapped to residents by a seeded permutation; every six-day block names each resident as culprit exactly once. If the bounded search fails, tested fallback templates are used. The run is refused if an independent check of the published statements does not give a single culprit. Explanations are generated from the solver. Residents may accuse themselves. Only the requested public explanation is shown. Visitor guesses stay in the browser's `localStorage`.

**Acceptance.** The structured-output schema sent to the model asks for a short note (reason or explanation). Acceptance checks only the measured fields — the ranking, the two choices, the accused resident and confidence, or the coin face — and stores a missing note as an empty string. Rejecting a valid choice for a missing note would select which choices are recorded; this was observed on the first production day, when a valid companion choice arrived with an empty reason, and is covered by a regression test.

## Scheduling and request budget

The Lab lives in the forum's existing `DebateForum` Durable Object (`villa-treny-daily-v1`), so one alarm and one provider ledger govern every request. New SQLite tables: `lab_config`, `lab_runs`, `lab_attempts`. No binding, class, migration or instance name changed.

- **Priority.** The debate keeps its slot whenever it is due, or due within two minutes. The Lab dispatches only while today's debate is finished, held or waiting longer. The verdict runs before the three independent experiments, which are then served fairly by fewest attempts per unit.
- **Shared ledger.** The existing 300-per-Pacific-day Lite guard (20 for Flash) and the three-dispatches-per-minute pacing now count debate attempts, Lab attempts and registered external usage together. Before a Lab dispatch, the debate's full remaining per-edition allowance (20 minus attempts already made) is held in reserve.
- **Independent budgets.** At most 3 attempts per unit; per-day run caps of 12 (verdict), 18 (coin), 12 (companions) and 12 (mystery). Retries back off (30 s after invalid content, 60 s × attempt after transport failures, an hour or `Retry-After` after rate limiting). Authentication or missing-key failures stop the run.
- **Normal day.** 12 debate requests + 30 Lab requests (6 ballots, 12 coins, 6 companions, 6 mystery answers). Worst case: 20 + 54 = 74, well under the 300 guard.
- **Durability.** Each attempt receives the identity `date/experiment/unit#n` and is inserted before the network call; the response is saved before it is applied; a replayed or stale result changes nothing. A crashed attempt becomes a charged timeout. Full prompts/results are kept 90 days; receipts (model version, response ID, usage, latency, SHA-256 prompt digest, raw text up to 4,000 characters) and runs persist.
- **Windows.** A Lab date runs from 09:00 UTC to the next 09:00 UTC. At the next edition, unfinished runs close as `partial` or `unavailable`, keeping every valid observation.

The model is the forum's configured production model (`gemini-3.5-flash-lite`); there is no automatic fallback. Parameters: temperature 1, one candidate, structured JSON output, thinking LOW (coin, companions) or MEDIUM (verdict, mystery), 4,096 output tokens for Lite.

## Operations

The Lab is **disabled by default** and requires both the forum and the Lab to be enabled.

- `GET /v1/lab`, `GET /v1/lab/{experiment}`, `GET /v1/lab/{experiment}/{date}` — public, GET-only, stored data. Any other method returns 405; query parameters are rejected.
- `GET /v1/admin/lab` — schedule, attempt counts per quota day and recent runs (bearer token).
- `POST /v1/admin/lab/configure` with `{ "enabled": true }` — records the activation date on first enable. `{ "enabled": false }` pauses dispatch; stored results remain public.
- `GET /v1/admin/lab/export?date=YYYY-MM-DD` — runs and full attempt evidence for a date.

## Tests

`src/lib/lab/lab.test.ts` checks Wilson intervals and exact binomial tests against known values, Borda totals and every tie-break rule on 4,000 random juries, joint winners, ballot and companion validation, three years of puzzles (unique solutions, rendered text matching formal truth sets, culprit balance), and the aggregation denominators. `workers/habitat-runtime/test/lab.test.ts` runs the Durable Object with mocked Gemini: inert public reads, default-disabled state, a full day (jury first, fair interleaving, byte-identical neutral coin prompts), debate priority, invalid coin answers recorded without retry, ballot retries, crash recovery without new requests, the shared quota and debate reserve, honest verdict availability, and window closure. `tests/browser/lab.spec.ts` drives the pages with synthetic fixtures (tests only): navigation, GET-only traffic, date navigation, keyboard network inspection, the mystery reveal and its local persistence, the verdict under debates, pending and empty states, reduced motion, and 320/390/768 px layouts.

## Limits

Six answers a day is a small sample, and separate requests to one model are not strictly independent. Many comparisons appear at once, so some will look unusual by chance. Persona answers are generated by fictional personas of one model; they are not people, friendships or social behaviour. The verdict judges fictional arguments, not who is right.
