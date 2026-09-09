# Cognition pacing audit — 8 September 2026

The old three-minute scheduler could spend the available daily inference budget in the first part of the day. Alternating overdue reviews and replies protected selection while capacity remained; it did not preserve capacity for later. After recent reviews, twelve legal ongoing conversations could occupy every slot. This was reproduced offline, not observed as a production incident.

## Reproduction and limits

Run `node scripts/audit-cognition-pacing.mjs` from the repository. The script uses synthetic genesis state, twelve continuing conversations with valid canonical responses, real physical watches, the current SQL quota ledger in in-memory SQLite and the current pacing implementation. An explicit historical selection function supplies the before comparison. Network access is blocked. No saved world, credentials, model inference or remote writes are involved. This measures scheduling under an imposed workload; it does not evaluate language quality or predict residents’ choices.

The workload assumes a 580-neuron CF maximum and 80-neuron confirmed charge; Groq reserves 4,900 tokens, with either unknown usage or 3,000 confirmed tokens. These are explicit illustrative costs, not guarantees derived from the generated workload’s prompts. The provider meters retain maxima until usage is complete. Runtime caps remain 8,000 CF neurons and 150,000 rolling Groq tokens; no free entitlement is enlarged.

| Policy / Groq usage assumption | First 25 successes | Total within 24h | CF / Groq | Last success | Recent coverage at 14h | Turns per resident |
| --- | --- | --- | --- | --- | --- | --- |
| Old / unknown | 2h24 | 123 | 93 /30 | 6h09 | 0/25 | 2–8 |
| Old / confirmed3,000 | 2h24 | 142 | 93 /49 | 7h06 | 0/25 | 2–9 |
| Paced / unknown | 1h15 | 122 | 93 /29 | 23h48 | 24/25 | 4–5 |
| Paced / confirmed3,000 | 1h15 | 140 | 93 /47 | 23h57 | 25/25 | 4–6 |

The old cases first deny both providers at 6h12 and 7h09 respectively. Pacing retains a similar number of opportunities across the day, with fewer concentrated repeats. The 24/25 result is an explicit limitation: neither the six-hour target nor 25 successful first thoughts is guaranteed with failures, higher costs, unavailable providers or different conversation patterns. The script samples admission every three minutes; production can schedule directly at the calculated later opportunity.

## Admission rule

- A resident without a success has selection priority, respecting occupied jobs and failure backoff. Only the first opportunity (`lastAttemptAtMs === null`) bypasses pacing. It still passes maximum reservation, idempotency, attempt caps, rate limits and circuit breakers. Failure does not leave unlimited bootstrap privileges.
- Each provider estimates cost from its most recent matching dispatched reservations: complete confirmed cost, otherwise the reserved maximum. Charged failed responses count. Unknown usage never implies zero cost. The identity lookup is bounded to 16 recent dispatches, and the cost sample to 8; a known different model is excluded from the cost estimate, but still debits the real meter.
- With remaining allowance `R`, the next job’s hard maximum `M` and estimated cost `E`, planned opportunities are `0` if `R < M`, otherwise `1 + floor((R - M) / max(1,E))`, also bounded by remaining request allowance. `M` keeps room for an actual reservation; it is not treated as the expected cost when authoritative usage shows a smaller number.
- With opportunities remaining, CF spreads them until UTC reset. An old ambiguous reservation releasing earlier cannot compress the whole available daily allowance. Groq uses its actual rolling release schedule. If nothing can fit, the next release must actually free enough allowance and request capacity.
- The next admission time is anchored to the provider’s last real dispatch, spaced over those remaining opportunities. Observer reads, quota denials, restart, deployment and resume do not move that anchor. Groq is available as a separately paced fallback while CF waits; no fictitious primary attempt is recorded.
- Both-provider waits are resolved before creating or claiming a job. A saved context that cannot survive its wait is retired without another attempt and replaced only when a future opportunity arrives. Exhausted per-job providers are excluded; if neither has attempts left, the job ends without another claim.
- Async preflight revalidates world revision, control generation, actor revision and current job status/attempts/due time before claim. A concurrent world change or another claim cannot be overwritten by an old snapshot. Final response validation uses current state.

Pacing is scheduling advice. The existing real quota reservation remains the sole permission to dispatch. No new tables, history rewrite, provider calls, physical-clock reset or financial effects were introduced by this patch.

## Checks and release status

The dedicated pacing tests cover cold history, unknown/zero usage, changed models, UTC boundaries, staggered rolling releases, CF carry, repeated reads/reconstructed ledgers, request exhaustion, first-opportunity fairness, fallback selection, no-job waiting, expired pending contexts, exhausted providers and changes across the preflight await. Core/provider tests also retain pause-before-reservation and old protocol dispatch behavior. These targeted results overlap the full suite; do not add their counts to historical totals.

Protocol 4 is a separate compatible producer change: first-contact proposals may accompany a message, but the counterpart must still accept in its own later turn. Runtime producers default to4; historical evaluation can pin3; stored versions 1/2/3 retain their original interpretation. A larger offered schema is included in the actual reservation calculation.

Deployment and a production coverage observation remain separate steps owned by the release process. This report does not claim that the synthetic transcripts or their outcomes occurred in the real world.

## Candidate size must not block the whole queue

A further deterministic fixture creates 24 loans of 0.1 cells from A to the other residents. Every proposal, acceptance and closing message passes protocol 4; both the world and society pass their codecs. B then awaits A's answer, while C awaits D's answer. A is first in scheduler order. With the final protocol-4 English guidance and actual WASM tokenizer, A reserves **7,029 Groq tokens** and D **5,480**. Their conservative CF maximum reservations are **808 and 640 neurons** respectively. The [new measurement record](cognition-pacing-measurements-english-2026-09-08.json) contains the complete synthetic harness, a 70-file source/dependency hash manifest, component counts and zero-network assertion; sources were unchanged before and after measurement. The [previous description-version record](cognition-pacing-measurements-2026-09-08.json), with totals 6,982/5,433 and maxima 800/632, remains unchanged and is linked by hash from the new artifact.

The Groq totals comprise exact ordinary-token counts for authored SYSTEM, USER and serialized schema, plus the provisional 128-token framing margin and 1,024-token output reservation. For A those components are 889 + 2,246 + 2,742; for D, 889 + 926 + 2,513. This is not an observed provider-side prompt count. CF continues to reserve conservatively from serialized request bytes plus its margin, priced at the configured model's rates; neither number is a measured inference charge.

After the English-guidance update, the candidate-search, society-schema, saved-protocol and Groq-tokenizer suites pass **36 tests in four files**, with application/Worker TypeScript and targeted ESLint. This targeted run is separate from the earlier complete Worker checkpoint below; a final integrated release check remains the release owner's responsibility.

The language change affects only new protocol-4 prompts: Pilar's canonical `anda`/`hijo` examples are projected as familiar encouragement and affectionate address rendered in English. Her rhythm and practical character remain, while other residents' voice descriptions are unchanged. Protocol 4 explicitly requests English for messages, reflections, project goals and every `why`, even after non-English quoted speech. Names, IDs, original transcripts and evidence references remain exact. Tests preserve hashes of two pre-change protocol-3 jobs and the transcript/evidence identity of an isolated Spanish exchange. This adds no language detector, automatic translation, inference retry or change to historical state; prompt instructions alone do not guarantee model compliance.

With only 100 CF neurons remaining and no Groq usage, the old single-candidate preflight scheduled the entire mental queue at midnight for A, although D was admissible immediately. The corrected preparation searches at most 25 residents in scheduler order with a local exclusion set, reusing one immutable quota snapshot per provider. It persists only the first admissible job; skipped residents keep their unchanged priority and last-attempt state. No context is shortened to make another provider accept it. When all candidates must wait, it retains the earliest candidate admission time. Final hard reservations always use fresh authoritative state.

Three dedicated regressions exercise the genuine 24-loan state, the different CF maximum sizes, one current-window SQL read per provider for the entire search, unchanged minds/physics/charges, and control changes during token counting. The integrated checkpoint after this correction passes 209 Worker tests in 20 files, TypeScript and targeted lint. These counts replace, rather than add to, earlier overlapping checkpoints.

## Reconsideration when new work becomes eligible

A long provider wait could also span a physical watch that creates new observations, an individual six-hour review deadline, the end of a failed-attempt backoff, or the expiry of an open conversation. Conversation expiry creates factual observations for both participants and can reduce their ongoing context. Checking only the residents eligible before that wait could postpone newly admissible work until midnight. Both preparation and pending-job pacing now cap that wait at the earliest known future eligibility change. Dates already passed when selection began are ignored; deadlines crossed during asynchronous token counting are retained. The next wake stays at least three minutes ahead of the fresh completion time. Provider dispatch anchors, reservations, resident attempt timestamps and the physical clock are unchanged by this scheduling calculation.

The Durable Object regressions execute a real physical watch, then separately cross actual review, backoff and conversation-expiry deadlines in the 24-loan fixture. Each reevaluation selects a job that fits the still-available Groq quota. The physical watch may itself settle obligations and reduce A's context; the test checks actual request size rather than requiring a different actor regardless of the new state. Expiry is verified through the persisted conversation status and both participants' new observation references. Early and repeated wakes create no extra job or provider attempt. Additional cases cross those deadlines during asynchronous preflight and verify the fresh three-minute floor, rather than skipping the newly eligible resident. No provider is called in these fixtures.

The new calculation is written only after the existing control generation and global world-revision checks; pending-job handling additionally checks the actor revision and current job status, attempts and due time. Other `next_cognition_at_ms` writers were reviewed: initial migration/resume and missing-clock reconciliation retain their existing initialization behavior; a normal due wake or cognition error retains the three-minute retry cadence. The physical schedule is not rewritten by the new cap.

The final integrated checkpoint passes **218 Worker tests in 20 files**, Worker type generation, TypeScript and targeted ESLint. The 12 dedicated candidate-search cases and 15 pacing cases are included in that total. This supersedes the earlier overlapping checkpoints and must not be added to them. It does not claim a deployment or successful six-hour coverage in production.
