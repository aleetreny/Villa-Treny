# Villa Treny daily forum runtime

**Current release: `295a17c6-f7de-4bf3-b9fb-1c28d4684469`**, deployed 9 September 2026. `DebateForum` is enabled with **Gemini 3.5 Flash Lite**, following the owner's explicit choice after five 3.8 HTTP 503 responses. The stronger model remains pending acceptance. No paid provider tier was activated.

The actual first edition is stored at `/v1/debates/2026-09-09`: six independent openings, six exact-quote replies and a linked summary, produced in fifteen requests. The next persisted alarm is **10 September 2026 at 09:00 UTC**. Daily generation needs no visitors. Reads and recommendations never dispatch inference. Failed calls remain charged, retries are bounded, and accepted turns are durable.

The same Worker serves the board, archive, residents and approved pixel habitat. Recommendations mean "worth reading", use a signed anonymous cookie and are reversible. Public APIs are under `/v1/debates`; existing bearer authentication protects `/v1/admin/debates` and its configure/usage/adopt/export routes. The private diagnostic exposes the persisted next alarm.

See the [current architecture and operator guide](../../docs/daily-forum.md) and [acceptance evidence and limits](../../docs/daily-forum-review.md). Gemini credentials remain Cloudflare secrets and never enter the client.

The previous `HabitatWorld` remains under its existing name, class and binding, **paused**, at world revision 386 / control revision 4. Its checkpoint checksum matches the verified complete 35-page paused backup exactly. Its 25 residents and old ledgers are retained independently from the six-person forum. The following documentation is historical and applies only to that economic engine.

---

# Historical economic runtime (paused)

**Last economic release: `f50c0b1a-163b-42c0-995f-5374d695a4a1`**, deployed 9 September 2026, with **P8 / SQL12 / society codec 4** and a **10,000-neuron Workers AI daily guard**. Physical world codec 4 and public DTO 2 remain unchanged. Residents can choose among up to three conversations, work or review privately, contact another available person, or leave while waiting. One normal thought selects one operation; additional conversations do not create extra inference calls. Exact consent, document permissions and accepted commitments remain authoritative. Saved P1–P7 jobs keep their issued contracts. See the [attention design](../../docs/research/concurrent-attention-design-2026-09-09.md).

**9 September allowance reallocation — deployed:** the Workers AI daily guard is now 10,000 neurons, within the verified active Workers Free allowance. This reallocates our former 8,000 runtime / 2,000 research buffer; it adds no provider quota. All 1,852 research neurons belong to 8 September and their last conservative hold expired on 9 September at 11:33 UTC. The separate 1,865 ambiguous production neurons remain charged. Validation passes **1,077 application / 377 Worker / 62 Node tests**, 21 browser checks, 6 hosting checks, lint/types/build and dry deploy. The [independent production comparison](../../docs/research/release-2026-09-09/cf10000-production-continuity.json) passes 67 checks: all 2,118 rows in 26 tables remain identical at revision 326, including quotas and clocks. See the [sanitized account evidence and release scope](../../docs/research/cloudflare-free-allowance-reallocation-2026-09-09.md).

For the previous attention checkpoint `5cc86d7b`, [Release verification](../../docs/research/release-2026-09-09/attention-release-validation.json) passes **1,077 application / 377 Worker / 62 Node tests**, 21 fresh browser checks and 6 hosting checks, lint/types/build/dry deploy. The [strict production comparison](../../docs/research/release-2026-09-09/attention-production-continuity.json) preserves every old row and column in 26 tables at revision 322; 2,098→2,100 rows add the exact archival migration. 319 frozen source files match. The pending publication, balances, quotas, old jobs, control and physical/cognitive clocks are preserved. A native review after unlocking the Mac confirms Common at 4x, Journal and Lives; all 45 rooms are covered by the automated browser suite.

**Previous attention checkpoint measurements:** The [selected budget measurement](../../docs/research/attention-budget-candidate6-compact-system-facet-2026-09-09.json) fits all 25 actual revision 317 preparations at 6,587–7,903 Groq tokens. A legal three-open/three-closure fixture remains 8,754 and needs eligible Cloudflare capacity or waiting. The 128-token framing margin is provisional. Neither these fixtures nor the new choices prove better factual grounding, bounded waiting or an autonomous paid-work-to-performance chain. The [post-release status](../../docs/research/release-2026-09-09/attention-live-status.json) is physically healthy; cognition is delayed by provider admission, with 18/25 successful within the previous watch and 25/25 having thought at least once. No P8 model result had been observed at that cut. At that earlier cut, research totaled165 local calls /1,852 CF neurons, with no new evaluation calls at that checkpoint.

**Current semantic evidence — completed local diagnostic:** the [six-call P7/P8 comparison](../../docs/research/attention-chain-mechanical-review-2026-09-09.md) applied every response but created zero agreements. P7 issued three further proposals; P8 only exchanged messages. Y ate in Common identically in both arms and the zero-inference control. W's pre-existing publication executed in all three and is not credited to these replies. The [independent semantic review](../../docs/research/release-2026-09-09/attention-chain-independent-semantic-review.json) also finds no demonstrated improvement. This selected local pair does not isolate concurrency or prove production quality. Current research totals are **171 local calls /1,852 historical CF neurons**, with no new cloud research. The [mechanical receipt](../../docs/research/release-2026-09-09/attention-chain-final-mechanical-receipt.json) preserves hashes, replay and limits.

Cloudflare control plane and canonical scheduler for the Night Shift habitat. It
persists and advances the same deterministic domain world that the standalone Villa-Treny observer renders.

A new habitat starts **paused** with reason `awaiting-domain-engine`, so a deployment
cannot spend inference quota by itself. An authenticated resume command schedules
the physical clock and the separate cognition queue. An already-running world keeps
its physical deadline when resumed for scheduling reconciliation.

## Non-negotiable invariants

The current release is `f50c0b1a` / P8 / SQL12, with society codec4, public
society DTO2 and unchanged physical world codec4. It adds concurrent attention
to the earlier authorized retrieval and structural feedback checkpoints.
The account permission, runtime configuration and complete-cut continuity each
have separate receipts below; none proves useful model output.

- One canonical habitat is one SQLite-backed Durable Object.
- Genesis and maximum population are both exactly **25**.
- Durable Object SQLite is the sole operational authority. D1 may later be a
  rebuildable public projection, never a second source of truth.
- A web visitor can only read health, status, the current snapshot and immutable
  archive days; no visitor path can enqueue, advance the clock or trigger inference.
- For newly marked P7 jobs and saved marked P6 jobs, provider order is closed: eligible Workers AI, then
  Groq Free OSS120B, then OSS20B. Unmarked saved jobs retain CF → Groq20B.
  Unavailable cognition leaves plans/routines operating; there is no paid path.
- Models are compile-time and runtime allowlisted: selected primary
  `@cf/openai/gpt-oss-120b`, supported
  `@cf/google/gemma-4-26b-a4b-it`, historical/configuration-compatible
  `@cf/qwen/qwen3-30b-a3b-fp8`, and Groq fallbacks
  `openai/gpt-oss-120b` / `openai/gpt-oss-20b`.
  GLM and Granite are excluded. An unallowlisted Workers AI model is rejected
  before any quota reservation or fallback dispatch.
- Deployed configuration allows 10,000 Workers AI neurons per UTC day within
  the verified Workers Free allowance, as recorded above. Groq guards
  match each model in the verified Free project: 200,000 tokens / 1,000 requests per conservative
  rolling 24 hours, with 30 requests and 8,000 tokens per rolling minute.
  Existing reservations and usage are preserved, not repriced or reset.
- Quota is reserved before network I/O. An ambiguous timeout consumes the full
  reservation rather than risking an accidental overrun.
- The cron trigger is only a watchdog. The Durable Object owns its single alarm and
  its persisted generation.

On a Workers Free account, excess Durable Object operations fail rather than being
billed. The application also fails closed before provider I/O when its own caps are
reached. Do not enable Workers Paid, Groq Developer, AI Gateway Unified Billing, or
add any billing method for this runtime.

**Previous retrieval release: `caf46bd8-1bda-40f6-a1f3-b60dfe420375`**, published 8 September 2026 UTC (9 September in Madrid). Newly prepared jobs use **P7**, with private authorized record search and one durable focus; **SQL11 / society codec 3** preserve physical world codec 4 and the public society DTO at version 2. P1–P6 saved jobs keep their original interpretation. Search, page selection and clear use normal cognition opportunities; they do not share documents, advance conversations or create another physical action. Pending delivery survives preparation, quota denial, failed responses and P6 turns; an incoming message can invalidate an in-flight lookup through mind revision. See the [retrieval implementation](../../docs/research/authorized-retrieval-implementation-2026-09-09.md) and [bounded structural retry feedback](../../docs/research/structural-retry-feedback-2026-09-09.md).

[Final release checks](../../docs/research/release-2026-09-09/retrieval-release-validation.json) pass **1,019 application / 355 Worker / 62 Node tests**, 21 fresh automated browser flows covering all 45 rooms, six hosting checks with zero external requests, build with 59 deployable files / 46 room PNGs and dry deploy. The [302-file frozen manifest](../../docs/research/release-2026-09-09/retrieval-source-manifest.json) has bundle SHA-256 `d11e7dd6feda80b9427262228a444f204e19e956afc16bc623705d6d60250a14`. The [later 23:25:10 UTC status](../../docs/research/release-2026-09-09/retrieval-propagated-live-status.json) reports revision 247, SQL11, healthy physical/cognitive scheduling, 25/25 successful coverage and zero never-thought residents. The native Mac was locked, so **no native visual review was completed after this release**; the 21 automated browser checks are fresh.

The [exact migration-and-natural-activity receipt](../../docs/research/release-2026-09-09/retrieval-natural-continuity-receipt.json) reproduces every row ID and column of all 26 canonical post-cut tables, 1,750→1,761 rows and revision 245→247. It runs the actual SQL11 migration and one real saved P7 result through the scheduler/router/accounting/domain path offline; historical cognitive fields are preserved before that result, the exact codec 2 row is archived, and 25 empty retrieval cursors are initialized. Duplicate SQL/domain application is a no-op; physical state JSON and clock/control fields remain unchanged. Both strict failures remain valid: the immediate post-cut still held SQL10/Society2, while the later migration-only comparison rejected legitimate natural activity. The cause of the first old cut is not established.

H104's single natural Groq120B result emitted only a message, using 6,486 input / 111 output tokens against 6,519 input + 1,024 output reserved. It performed no lookup or document/economic action, and all seven drafts and empty retrieval cursors remained unchanged. The replay made zero HTTP requests or new inference calls; its 304 local SQL operations are not an assertion count. A synthetic HTTP response wraps retained output/usage, so the proof does not reconstruct original wire bytes, independently measure latency or establish future service behavior. It covers canonical data rows, not remote `sqlite_master` or platform-internal tables.

The [final 25-resident measurement](../../docs/research/retrieval-budget-final-2026-09-09.json) reserves 5,420–7,843 Groq tokens per P7 job versus 5,202–7,553 for P6, adding 218–294 per resident; sums are 163,079 versus 157,130. The [legal 256-draft stress fixture](../../docs/research/retrieval-retained-stress-2026-09-09.json) checks retained-content delivery without inference. These are bounded admission estimates, not measured model use or guaranteed daily coverage. Provider prices, separate free quotas, 1,024-token output allowance, 32k/24k tokenizer bounds, leases and 55-second request window remain unchanged. Local research remains 165 completed calls and cloud research 1,852 conservatively accounted neurons. Evidence-layout B and the broad progress SYSTEM remain unselected; useful autonomous record use and better semantic decisions are not established by this release.

The [predeclared semantic evaluation plan](../../docs/research/authorized-retrieval-semantic-evaluation-plan-2026-09-09.md) remains unexecuted. At revision 247, all seven retained drafts are already supplied to their authors and all 25 P6 preparations report zero omitted drafts. That cut is **not evaluable** for recovery of a real omitted record; no omission, missing text or response may be fabricated to manufacture a comparison. No automatic monitor or new inference is scheduled by the plan.

**Previous request-window checkpoint: `f51806c8-c8a8-4586-8ea1-4e122c1d10e4`**, deployed 8 September 2026 at 22:39 UTC. It adds the cognition request-window correction: a prepared context needs at least **55 seconds** remaining for the 45-second provider window and ten-second commit margin, checked with fresh time after asynchronous preparation and before an attempt is claimed. Provider waits and retries must also leave a usable window. Unusable contexts are retired without adding a resident failure attempt; recorded provider usage is retained. A discarded fresh preparation keeps a future three-minute scheduling floor. Retiring one unusable context releases its provider-specific global wait without discarding another still-usable job or postponing an earlier wake.

The [complete-cut proof](../../docs/research/release-2026-09-08/request-window-release-continuity.json) passes **475 checks**: unchanged revision 235, day 107 IV, every row ID and column in 26 tables / 1,705 rows, including 156 reservations, 98 contexts and 154 provider attempts, across complete 30-page backups. Seven drafts remain; no document share rows, publication intents, commissions or publications are added. This verifies preservation, not improved model decisions.

The [release validation](../../docs/research/release-2026-09-08/request-window-release-validation.json) passes 981 application / 323 Worker / 62 Node tests, build with 59 deployable files / 46 room PNGs, dry deploy and six hosting checks. Its 215-source manifest retains the same UI: the 21 browser flows belong to the previous `5443` checkpoint and were not rerun for this backend-only change. P6, SQL10/society codec 2, physical codec 4, document permissions, consent, engine operations, model routing and free quotas are unchanged. Receipt selection remains active; evidence-layout B and the broad progress SYSTEM remain unselected. Local research stays at 165 completed calls; cloud research remains 1,852 conservatively accounted neurons. The [22:42:39 UTC status](../../docs/research/release-2026-09-08/request-window-live-status.json) records later natural activity at revision 237 with healthy physical/cognitive scheduling, 25/25 successful coverage and no resident who has never thought. A native reload showed Connected, World running and Thoughts active in The Common at 4× with Journal visible. This later status is separate from the unchanged revision-235 deployment cuts; it does not establish improved dialogue or a useful autonomous authored-work chain. The semantic objective remains open.

The [separate original N94 rejection](../../docs/research/release-2026-09-08/N94-message-length-diagnostic-2026-09-09.json) is **not fixed by this scheduling change**: its message had 695 characters against the issued maximum of 300, with no document operation. The real parser/decoder reproduce rejection and the 6,162-token charge remains. At that checkpoint, generic retry feedback omitted the field path and bound; structured feedback had not yet been implemented. The later P7 release adds bounded structural hints without demonstrating that a model will correct its output. Neither retiring an expired context nor a healthy status demonstrates correction of that model behavior.

**Previous receipt-selection checkpoint: `5443a27b-ca4f-4b69-9d77-3017977ed969`**, deployed 8 September 2026 at 22:12–22:13 UTC. Its only new production behavior is deterministic receipt selection within the existing four-memory allowance. Saved preparations, P6 operations, SQL10/society codec 2, physical world codec 4, consent, quotas and the presentation inherited from `7dd380ef` remain unchanged. The experimental evidence-first USER layout **B is not selected in production**.

The [complete-cut continuity receipt](../../docs/research/release-2026-09-08/receipt-selection-release-continuity.json) passes 473 checks at unchanged revision 227, day 107 IV: all row IDs and columns of 1,671 rows in 26 tables, including 152 reservations, remain identical across complete 30-page backups. All 214 frozen release sources match. The cut contains seven drafts and zero share rows, publication intents, document offers/agreements or publications. These counts do not by themselves establish whether a named draft audience grants access.

[Release validation](../../docs/research/release-2026-09-08/receipt-selection-release-validation.json) passes 981 application / 307 Worker / 62 Node tests, 21 browser flows, six hosting checks with zero external requests, build with 59 deployable files / 46 room PNGs and dry deploy. The [revision-227 status](../../docs/research/release-2026-09-08/receipt-selection-live-status.json) records a **healthy physical world and degraded cognition**; the UI shows **Thoughts delayed**, with `providers_deferred`. The [N94 diagnosis](../../docs/research/release-2026-09-08/n94-expiring-retry-receipt.json) reproduces a scheduler preclaim defect, not exhausted quota: only 20.707 seconds of context lifetime remained against a required 55-second request/commit window. The router correctly made no new reservation or provider call, but the preceding claim changed attempt/backoff state. That correction was not included in the `5443` checkpoint. Its status capture does not establish later recovery or semantic improvement.

The [offline receipt-selection measurement](../../docs/research/grounded-receipt-selection-measurement-2026-09-08.json) prepares all 25 residents from revision 218: visible retained own physical receipts improve 2/25→25/25 while the maximum stays four memories, and eight duplicate-loss cases become zero. This measures context availability, not a model's use of that context. In the separate [eight-response layout review](../../docs/research/evidence-layout-semantic-review-2026-09-08.md), all eight applied but B had mixed semantic effects; four private drafts and four offers produced no acceptance, publication, payment, closure or physical watch. The batch used 24,065 local tokens, bringing cumulative local research to **165 completed calls**; cloud research remains **1,852 conservatively accounted neurons**. Neither B nor the earlier broad progress SYSTEM candidate is the live instruction change. Earlier checkpoints below preserve their own observations and totals.

Receipt selection reserves existing action evidence within four memory slots and
deduplicates body history against the final visible selection. It does not add
state, a new model call, a physical action or a success claim. The separate
[older-record retrieval gap](../../docs/research/grounded-receipt-selection-2026-09-08.md#limits-and-adjacent-finding)
remains in saved P6 preparations. New P7 jobs expose authorized literal search,
three-entry pages and exact private focus for retained omitted revisions, as
detailed in the [retrieval implementation](../../docs/research/authorized-retrieval-implementation-2026-09-09.md).
Original audience and other access grants remain authoritative; a zero share count
alone is not proof that a document is inaccessible. Retrieval is not proof of
understanding, sharing or useful writing.

Previous presentation checkpoint `7dd380ef-5c98-4608-9be8-842d31599299` adds only the reviewed
English display translation for public `turn:419` and its exact Journal copy.
The **English translation** label distinguishes it from the unchanged canonical
message. [Its receipt](../../docs/research/release-2026-09-08/public-dialogue-translation-turn-419.json)
retains the original provenance; flour/temperature statements remain the speaker's
claims. The [209-file source manifest](../../docs/research/release-2026-09-08/observer419-source-manifest.json)
identifies the existing translation module and its test as the two source changes.
Engine behavior, prompts, quotas and prepared document contracts are unchanged.

[Release checks](../../docs/research/release-2026-09-08/observer419-release-validation.json)
pass 968 application / 307 Worker / 54 Node tests, 21 browser flows, six hosting
checks with zero external requests, build with 59 files / 46 rooms and dry deploy.
Production Journal and Lives were reloaded and reviewed with the translation
label visible; [live status](../../docs/research/release-2026-09-08/observer419-live-status.json)
reports healthy/healthy scheduling at revision 218. Pre/post revision 216→218 is **not** a frozen-equality result: the
correct strict failure is preserved. The [natural-activity receipt](../../docs/research/release-2026-09-08/observer419-natural-continuity-receipt.json)
reproduces every row ID and column of all 26 post-cut tables: 1,630→1,639 rows,
nine additions, five existing rows updated and none deleted. One natural E90
Groq20B job accounts for the entire delta, using 5,887 input / 195 output tokens
for a public question to L. No physical action, document, offer, payment or
closure resulted; both cuts retain five private drafts with no sharing or publication.

The replay uses the real scheduler/router/accounting/application/archive code
and retained output/usage in offline SQLite. It executes 334 SQL statements,
reproduces exact world/society JSON and confirms duplicate no-ops. The clock is
anchored to saved timestamps, and the successful HTTP envelope is constructed
from stored output/usage because its original bytes were not retained. This is
not independent reconstruction of wire framing/latency or proof of future alarm
delivery. No network request, model inference or production write was made.

The earlier engine reference `af8bb409-387b-45eb-be9e-849163fc3536` preserves SQL10 and society codec 2.
The [21:08 complete-cut proof](../../docs/research/release-2026-09-08/p6-progress-release-continuity.json)
passes 443 checks across complete 30-page backups at revision 210: all 1,606 rows
in 26 tables and 143 reservations remain identical. The [release validation](../../docs/research/release-2026-09-08/p6-progress-release-validation.json)
passes 968 application / 307 Worker / 54 Node tests, build with 59 files / 46 rooms,
dry deploy and six hosting checks; 200 source hashes match. The [following live status](../../docs/research/release-2026-09-08/p6-progress-live-status.json)
reports healthy physical/cognitive scheduling and 25/25 coverage at revision 212
after natural activity. Budgets, model routing and the physical clock are unchanged.

Only received-closure handling/eligibility and marked new draft budgets are
published. The broader progress SYSTEM candidate is retained as experimental
source, **not selected for new production jobs**. Its [eight local comparisons](../../docs/research/model-progress-local-2026-09-08/domain-and-grammar-review.md)
produced six applied proposals and two size rejections: no document, closure,
agreement, payment or physical watch. They used 24,469 local tokens, bringing
local research to 157 calls at that earlier checkpoint; cloud research remained 1,852 neurons. None of these
counters demonstrates useful autonomous progress.

The previous reference-shape release `7a103b97-5ff9-490c-b3ff-fb191582e7a4` changed only the P6 instruction for
`record.refs` ID strings and its regression test. The [20:24 complete-cut proof](../../docs/research/release-2026-09-08/p6-refs-release-continuity.json)
passes 431 checks at revision 199: all 1,564 rows in 26 tables, 137 reservations,
81 saved contexts and 133 attempts remain identical. The [release check](../../docs/research/release-2026-09-08/p6-refs-release-validation.json)
passes 949 application / 302 Worker / 48 Node tests, build, dry deploy and six
hosting checks. The frozen set has 194 sources. The [20:25 follow-up](../../docs/research/release-2026-09-08/p6-refs-followup-live-status.json)
reports healthy physical and cognitive scheduling at revision 201 after natural
activity. Parser, schema, budgets, saved jobs and dual-model routing are unchanged.

[U80's exact private draft](../../docs/research/release-2026-09-08/u80-natural-retry-success-receipt.json)
and [Q81's first Groq120B response](../../docs/research/release-2026-09-08/first-groq120-live-receipt.json)
both succeeded before this hint. U80 used its
saved unmarked route and existing refusal feedback; the four private drafts at
revision 199 had no shares, publications or document commissions. These results
and healthy status do not demonstrate that the hint improves future model output. Q81 used 5,837 input / 199 output tokens in
1.664 seconds, settling its 6,887-token reservation to 6,036. It emitted one
message, with no deal, record operation, payment or physical-watch advance.

The previous SQL10 routing release `13ba0a43-f0e2-45b5-bf38-524faf16b5fb` was verified at 20:14 UTC on
8 September 2026. The [SQL10 continuity proof](../../docs/research/release-2026-09-08/sql10-migration-continuity.json)
passes 252 checks across complete production cuts at revision 195, day 107 IV.
Every old value in 1,546 rows across 24 tables, including 135 reservations, is
preserved. World, society, control and clocks are identical; permitted additive
metadata expands the table set to 26. The frozen release has 194 source files.

The [20:12 live status](../../docs/research/release-2026-09-08/groq-dual-live-status.json)
reports a healthy physical world and **degraded cognition**, with U's preexisting
`invalid_society:invalid_record_choice` pending. Groq120B has zero recorded
submissions at that cut. The [authenticated account readback](../../docs/research/groq-dual-free-account-readback-2026-09-08.json)
separately verifies both OSS models enabled on Free, with the per-model limits
above. Other organization use of the same model can consume its allowance.

The [release checks](../../docs/research/release-2026-09-08/groq-dual-release-validation.json)
pass 949 application tests, 301 Worker tests and 48 Node checks, lint/types, build
and dry deploy. The 59-file build includes 46 rooms; six isolated hosting checks
recorded zero external requests. These checks establish technical behavior and
continuity, not useful autonomous dialogue or successful Groq120B fallback.

The previous [b557 release](../../docs/research/release-2026-09-08/groq-free-release-continuity.json)
verified SQL9 at 19:31 UTC, revision 185, with 24 identical tables and 165 source
files. Its healthy/healthy status, OSS20B-only permission and 252 Worker tests
remain historical observations. The current 14-page research PDF covers that
b557 checkpoint, not SQL10.

Before this quota release, [W73's production receipt](../../docs/research/release-2026-09-08/protocol6-w73-retry-success-receipt.json)
verified one exact private draft from a GPT-OSS 120B retry after a rejected Groq
reply. The retry received explicit correction feedback, so this is not an
identical-input provider comparison. The draft stayed author-only, with no share,
publication, commission, payment or physical-watch advance. Replay and duplicate
protection passed without publishing private content. This single artifact does
not establish writing quality or an effect of the later quota change.

## What exists now

### Deployed SQL10 routing: separate free model budgets

**Introduced in `13ba0a43`, retained in the current SQL11/P7 release.**
`GROQ_120B_ENABLED` accepts explicit `true`/`false` strings and defaults to false.
The deployed configuration enables it; the separate authenticated readback
confirms that the Groq project permits the model. `GROQ_120B_DAILY_TOTAL_TOKENS_LIMIT`
defaults to 200,000 and may be lowered. This adds no paid path or new account.

When enabled, newly prepared P7 envelopes persist
`routingPolicy:"free-models-v1"`. Their eligible order is configured Workers AI,
Groq `openai/gpt-oss-120b`, then Groq `openai/gpt-oss-20b`. Pacing skips create no
reservation. Unmarked saved jobs preserve their previous CF/20B route, original
IDs and content contract even after configuration changes. Disabling the flag
removes the 120B destination. No historical job is rewritten to gain that route.

The two Groq models have separate ledger windows: each has 30 requests / 8,000
tokens per rolling minute and 1,000 requests / 200,000 tokens per conservative
rolling day. A smaller configured daily cap is honored. These are not a pooled
400,000-token allowance: unused tokens on one model cannot subsidize the other's
request. Input and output both count, and other organization use of that model
can reduce available capacity. CF retains its independent 10,000-neuron UTC-day
budget within the verified Workers Free allowance.
The status's aggregate Groq history is not spending authority;
`modelWindows` describes the distinct windows.

The new route allows at most four actual submissions per job, and two per
provider/model destination across wakes. New IDs contain the encoded model;
historical IDs remain readable. The unchanged job's ordinary token count is
shared between the two OSS destinations within one invocation, but reservations,
model identity and actual usage remain separate. Existing byte bounds,
provisional 128-token framing, 1,024-token output cap and best-effort Groq
`strict:false` remain. The strict-transport proposal is not implemented here.

The Durable Object owns a 120-second lease. Routing receives the earlier of lease
or prepared-turn expiry minus 10 seconds for recording, with a 110-second ceiling
on the marked route. Each provider needs a complete 45-second remaining request
window, including after asynchronous token counting. Dispatch rechecks control,
mind revision and the exact saved lease. A stale claimant may retain its own
receipts/charges but cannot close or compact a replacement claimant's job. A
still-owned expired lease rejects its late result. Accounting and durable failure
receipts precede fallback; an unknown charge retains its maximum, and failure to
save accounting or its receipt stops subsequent I/O.

SQL10 adds `quota_reservations.model`, a `quota_model_migration` boundary,
`provider_model_breakers` and a scoped activity index. All existing reservation
values remain unchanged with `model:null`, interpreted as the historical 20B
identity for Groq. Unrecognized historical model evidence aborts migration.
Old 20B-specific restrictions carry into that model's breaker; shared credential
failures still constrain both. No settled usage is repriced or moved to 120B.

The [offline rehearsal](../../docs/research/release-2026-09-08/sql10-offline-migration-rehearsal.json)
restores a complete revision 185 SQL9 backup and runs the actual migration in
isolated SQLite. It preserves all previous world/society/runtime/history values,
129 reservations and CF/20B charges at the identical timestamp; 26 tables replace
24, with zero 120B usage. Original SQL9 and migrated SQL10 recoveries both verify.
No production write, inference or clock advance occurred.
The later production comparison independently preserves all 1,546 old rows and
135 reservations at revision 195. Its three drafts remain private, with zero
shares, publication intents, document commissions or publications. Recovery does
not export `sqlite_master`: index existence is verified by the exact-helper
rehearsal and isolated tests, not independently inventoried in these production
bundles. SQL10 requires a compatible rollback reader; old SQL9 backups remain
supported by the current migration-aware recovery path.

That historical routing-release checkpoint passed 949 application tests, 301 Worker tests and 48 Node
checks, lint/types, build and dry deploy. The build contains 59 files and 46 rooms;
six hosting tests pass. Independent routing and real-DO tests cover marked/new
versus unmarked/saved jobs, deadlines, replaced leases and charges before
fallback. Candidate search reads at most one snapshot per enabled destination
for all 25 candidates. These safeguards do not certify provider output quality,
paid cooperation, sustained throughput or a successful live 120B response.

### Received closure and versioned draft-input budgets

The latest closed conversation's final incoming turn remains available as
`receivedClosure` when it follows the recipient's last successful review. Its
exact turn ID joins that actor's evidence. Existing scheduling guards allow a
review without reopening the exchange or requiring a new reply; a successful
review consumes that eligibility. This does not assert the message was read or
that the actor's purpose is complete.

New P6 preparations carry `records.draftTextMaxLength:504`. The emitted grammar
limits title to 96 characters and body to 504, reserving title space. Preparations
without the marker retain the old 600-character body grammar; existing jobs and
outputs are not rewritten. Domain limits remain 96 UTF-8 title bytes and 600
combined title/body bytes. Character limits address the observed ASCII overflow,
but multi-byte text still needs the unchanged byte validation. Oversized output
is rejected atomically, never silently shortened. The [adapter](../../src/lib/habitat/society/record-choice.ts)
and [closing-turn selector](../../src/lib/habitat/society/closing-turn.ts) implement
these boundaries independently of the unproven broader instruction candidate.

### Private retrieval and exact retry feedback

P7 adds an exclusive private `lookup` branch to the ordinary P6 response. Search,
next page, refresh, read and clear never imply speech, consent, sharing or work.
Search covers only retained authorized drafts, uses a literal normalized query
and returns at most three metadata entries. Selection binds the exact issued
ID/hash and rechecks current ACLs; trusted catalogue metadata is persisted in the
prepared turn outside model prose. A later normal cognition can receive the
complete focused text within the existing three-draft limit. Evicted or revoked
content is unavailable, never substituted or silently pinned.

Society codec 3 stores one private query/cursor/focus and pending flag per resident.
Preparation, quota denial, failures and P6 jobs do not consume pending delivery.
A matching successful P7 turn acknowledges it; explicit clear releases the focus.
Waiting for a reply does not block private lookup or alter that conversation,
but incoming speech still invalidates the old mind revision. Existing fairness,
backoff, leases and provider admission apply; there is no hidden second call.
SQL11 archives the exact preceding cognitive row, and public DTO version 2 excludes
all retrieval state. Old binaries cannot read codec 3 as a supported rollback.

Bounded structural hints use only complete, hash-bound retained P6/P7 rejection
bytes and the issued schema. At most four issues / 600 UTF-8 bytes of known paths,
fixed codes and limits can enter the metered retry USER. There is no private
candidate prose, inferred operation, output repair, extra retry or changed
accounting. Domain and semantic errors are not relabelled as structural failures.
See [retrieval](../../docs/research/authorized-retrieval-implementation-2026-09-09.md)
and [feedback](../../docs/research/structural-retry-feedback-2026-09-09.md) for
isolated durable tests, privacy bounds and remaining limits.

### Existing physical and cognitive services

- A single `HabitatWorld` Durable Object using the current declarative `exports`
  lifecycle and SQLite storage.
- Versioned SQLite migrations, a validated `WorldState` codec (including all 600
  directed relationship edges), an append-only happenings archive with per-person
  indexes, causal watch runs, self-repair via hourly Cron, pause/resume commands,
  provider attempt audit, quota reservations, daily usage counters, and provider
  circuit breakers.
- Independent cognition opportunities at least three minutes apart, with first
  opportunities prioritized and observed-cost pacing for each provider afterward.
  Six-hour reviews, replies and a 30-minute failure backoff remain scheduling
  targets; neither 480 daily decisions nor full six-hour coverage is guaranteed.
  Pure pacing waits create no job, mark no attempt and leave physics untouched.
  See [pacing evidence](../../docs/research/cognition-pacing-2026-09-08.md).
  Thinking never grants another physical action or advances a watch.
- Separate persistent minds with bounded memory, evidence-linked interpretations,
  private/public purposes and executable steps. Context contains only that
  resident's private knowledge and received information. Each conversation turn
  belongs to its actual speaker; commitments require separate counterpart consent.
  The engine checks funds, work evidence, deadlines and idempotent settlement.
- Per-turn JSON schemas list available recipients, references and operations.
  The `society_turn` name/kind is unchanged; new output-contract version 4 uses one
  optional `deal` for relative transfer, loan or work roles, or an exact incoming
  offer's acceptance/refusal. The engine derives distinct parties and absolute
  dates. Version4 also permits a proposal in the first contact, with separate
  acceptance still required. Versions 1/2/3 retain their saved semantics. New
  proposals expire after two watches. Initial turns require an authored
  project and, when a recipient is available, a message. That first contact is
  protocol-driven, not evidence of spontaneous sociability. An active reply must
  speak to its counterpart; later private reviews may be silent. Contact never
  requires disclosure of a private purpose. Social purposes may have zero physical
  steps, and no turn may invent an incoming offer. Old canonical responses and
  persisted terms remain readable.
- New model choices describe actual effects: `accrue_labor_credit`,
  `walk_room_and_log_visit`, `accrue_two_labor_credits`, `log_stock_register`,
  `filter_water` and `clean_space` map to existing engine actions. Generic
  `observe` remains a historical action, not a new offered capability. No alias
  adds writing, consultation or measurements. USER identifies the actor and the
  exact names of offered recipients, then supplies actual context; it does not
  infer another person's location from their duty. Raw core context targets
  6,500 UTF-8 bytes before scheduler compaction/identity framing. Final overflow
  is metadata, not silent truncation of essential commitments.
- Optional appraisal changes one of the actor's own trust, affection, admiration
  or resentment values by ±1, only from the latest offered incoming turn, with a
  private reason. Persistent per-conversation participant watermarks prevent
  repeated assessment, including after memory eviction and at a clamp boundary.
  It never changes reciprocal feelings, financial debt or consent. The reason
  remains an interpretation, not a certified fact about the other person.
- New jobs have a 1,024-token output cap. Gemma uses `max_completion_tokens:1024`,
  thinking explicitly disabled, and the `{name,schema,strict:true}` JSON-schema
  wrapper; GPT-OSS 120B uses that cap/wrapper with `reasoning_effort:low`.
  Qwen preserves its historical
  direct-schema and `/no_think` mapping; the shared helper defaults to Qwen only
  for compatibility and the router always passes the configured model. Groq uses
  best-effort `strict:false`. Local parsing, consent and physical validation remain
  authoritative; requesting strict formatting has not prevented every observed
  schema violation. The completed local V7 run applied 29/37 decisions, with
  nine two-voice conversations and six model-selected physical steps. All eight
  attempted work deals were rejected; there were no agreements or negotiated
  payments. Six own-trust appraisals applied, some with faulty interpretations.
  GPT-OSS 120B is selected after two more relevant matched responses, not a
  broad or sustained-quality demonstration. Protocol 3 was the initial release;
  P7 is now deployed; historical P6 and earlier contracts remain readable. Coverage of all 25
  residents was observed in the historical 14:59 cut, without proving the
  quality or continued frequency of their thoughts. Real-model
  acceptance and semantic quality are tracked separately in
  [the validation record](../../docs/society-validation.md).
- Workers AI primary adapter and direct Groq HTTP fallback. The encrypted key is a
  required Worker binding: it is available in memory to the Durable Object but
  never enters SQL, logs, source control or the public HTTP surface.
- Public status reports bounded provider-attempt diagnostics and aggregate usage
  separately from conservative reservations. It never exposes prompts, generated
  content or credentials. Scheduler failure and overdue time affect health even
  when HTTP and the retry alarm still work.
- Public lightweight status, health, snapshot and day-archive endpoints with CORS
  limited to `https://aleetreny.github.io`.
- A test suite running in the actual Workers runtime with Durable Object storage.

Operational wakeups and simulation time are separate persisted clocks. A retry or
hourly watchdog wake never creates an extra watch. If cognition is unavailable or
invalid, physical watches continue through existing plans and deterministic routines.
An unanswered conversation remains pending. Physical health, successful cognition
and provider availability are reported separately.

Private model context and the public projection call finished executable steps
`steps_finished`; the persisted legacy status remains compatible. This does not
certify the broader prose purpose. Stored actions use current capability names
only where their meaning is resolvable. An old `clean` without a destination, or
legacy `observe`, is annotated with `legacyVerb` and a reason instead of guessing
a water yield or offering it as a new capability. Stored plans/history are not
rewritten. The final context tests cover both distinctions.

The 8 September protocol 3 checkpoint passed 840 application tests, 181 Worker
tests, 11 Node checks, 18 browser flows, lint/types, build and six isolated hosting
checks. Cumulative conservative cloud research accounting is 1,770 neurons,
including unknown-usage reservations. Local runs consumed no cloud allowance.
Neither test acceptance nor valid references guarantee grounded prose, nuanced
feelings, meaningful deal selection or fulfilled personal purposes.

## Model-specific accounting

New Workers AI reservations and complete returned usage use the configured model:
Gemma 9,091 input / 27,273 output neurons per million tokens; Qwen 4,625 / 30,475;
GPT-OSS 120B 31,818 / 68,182.
Each charge rounds up. Changing models never reprices an existing settled ledger.
Complete returned usage uses the larger of token-priced usage and a valid
provider-reported neuron amount, rounded up. Reasoning is already part of total
output and is not added twice.
Incomplete or unknown usage retains the maximum reservation. Input reservations
include the mapped request's schema and framing, not only the resident's prose.

For both allowlisted Groq OSS models, the WASM tokenizer counts the full authored system
message, user context and serialized JSON schema separately with ordinary-token
semantics. Changed instructions and retry corrections are counted too. The
reservation adds 128 tokens for provider framing and reserves the configured
output maximum separately. That framing allowance remains provisional: exact
component counts are not an exact count of Groq's undisclosed server formatting.
Literal special-token strings in resident text are counted as ordinary text.

Initialization happens once per isolate, only on a keyed Groq fallback path;
public status and observer reads do not initialize it. A failed initialization is
cached to avoid repeated allocation. The deployed bound permits **32,000
combined UTF-8 bytes and 24,000 bytes per component**, checked before initialization.
Unknown models, errors or either exceeded bound use the full byte estimate without
truncation. After awaiting the count, dispatch control is checked again before
reserving quota. A tokenizable input still has to fit the independent token and
request quotas. The earlier
[625-token V6 count record](../../docs/research/society-choice-system-token-count-v6.json)
is preserved as historical evidence; it no longer controls current reservations.

The [new bound report](../../docs/research/groq-tokenizer-bound-2026-09-08.md)
preserves a synthetic P6 job with 25,365 authored bytes. It now reserves 6,672
input tokens including framing plus 1,024 output tokens, totaling 7,696. The SQL
test admits it within an empty 8,000-token minute and rejects a tokenizable 32,000-byte
fixture totaling 8,644 before creating a reservation. This is admission evidence,
not provider usage, a server-framing guarantee or improved narrative quality.

The [local tokenizer report](../../docs/research/groq-full-tokenizer-2026-09-08.md)
records parity checks, memory measurements and a complete Worker dry-run upload
of 4,233.98 KiB. Current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
allow 64 MiB uncompressed script size, with no separate compressed-size limit,
128 MB of memory including JavaScript and WASM, and one second of startup CPU.
Lazy initialization moves tokenizer work into cognition; it does not remove its
CPU or memory cost. [Durable Object invocations](https://developers.cloudflare.com/durable-objects/platform/limits/)
have a default 30-second CPU allowance; ordinary free Worker HTTP requests have
a 10-millisecond CPU limit. Local Node/workerd timings and a successful dry run
are not deployed CPU measurements or a production memory guarantee.

## Commands

From the repository root:

```sh
pnpm runtime:check
pnpm build
pnpm runtime:deploy:dry
node workers/habitat-runtime/test-hosting.mjs
pnpm runtime:deploy
```

For local development:

```sh
pnpm build
cp workers/habitat-runtime/.dev.vars.example workers/habitat-runtime/.dev.vars
pnpm runtime:dev
```

Never commit `.dev.vars`.

## Observer hosting

The production observer is packaged into the **same Worker** using
[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/).
`assets.directory` points to the root `dist/`; there is no unused `ASSETS` binding.
The Worker name, `HabitatWorld` export, `HABITAT_WORLD` binding and canonical
habitat ID are unchanged. Adding the observer neither initializes a replacement
world nor changes an existing world's scheduling state.

Files are served before the application Worker. SPA navigation returns
`index.html`, but the reserved patterns `/v1`, `/v1/*`, `/health` and `/health/*`
always invoke the API. This explicit exception matters because
[SPA navigation otherwise bypasses a Worker on current compatibility dates](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/).
Directly opening `/v1/status` must return JSON; a missing API route must remain
a JSON `404`; unauthenticated recovery must remain `401`. Existing CORS remains
unchanged for the previous observer origin. The observer hosted here reads the
canonical API on the same origin and needs no extra CORS origin.

Build with Vite's default base `/` and the canonical runtime URL in `.env.example`.
The Vite build copies only the final room PNGs and fonts. Its distribution check
rejects raw sprite libraries, RoomLab, Worker code and environment files. Existing
source maps remain part of the build. Asset responses use Cloudflare's
[default revalidation and ETags](https://developers.cloudflare.com/workers/static-assets/headers/);
no permanent cache policy is applied to unversioned room filenames or HTML.

`runtime:check` is intentionally independent of `dist/`: Vitest reads the public
Wrangler configuration and derives local SQLite bindings, without resolving
assets, remote AI or local secrets. The installed plugin cannot remove an asset
object through `assets: undefined`, so the API-only test configuration does not
pass that object through its merger. This supports a fresh checkout and CI's
check-before-build order. No frontend build is added to the unit-test command.

After `pnpm build` and `pnpm runtime:deploy:dry`, the standalone
`test-hosting.mjs` test loads the actual bundle from `dist/dry-run/` in Miniflare.
It uses disposable local SQLite, fake administrative credentials, blocked AI and
blocked external HTTP. An instrumented wrapper counts application invocations:
HTML, JavaScript, PNG and SPA requests must make zero, while reserved API requests
must reach the existing handler. It also checks world revision preservation.
No credential loader, production request or inference is used by that test.

The verified distribution is well below the current
[20,000-file free limit and 25 MiB per-file limit](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
Static requests bypassing the user Worker are free and unlimited. API requests
still consume the ordinary Worker/DO allocations; if a reserved Worker request
exceeds a platform limit, static fallback must not disguise that failure.
The dry-run and local HTTP test do not themselves deploy. The owner deployed
version `5b972ccd-1b3b-4024-9165-7266ac2a2f2e` with 59 assets on 8 September 2026
at 13:09 UTC. Startup was reported as 54 ms. The immediate full backup preceded
deployment at 13:08:45, after a naturally scheduled watch reached revision 30,
day 107, watch III. The post-deployment full backup at 13:10:04 and
[comparison](../../docs/research/release-2026-09-08/migration-continuity.json)
confirm identical physical state bytes, all old runtime fields, and existing
columns/rows of 11 history/quota tables. Reconciliation at 13:12:30 kept control
revision 3 and the next physical deadline; it did not resume a paused world or
reset its clock. All-resident thought coverage had not yet been observed at that
13:12 cut; it was subsequently recorded at 14:59 UTC.

A follow-up audit found material SQL read scans over growing history. The additive
schema-8 change with three indexes and active-queue counting was subsequently
deployed with [complete-cut continuity proof](../../docs/research/release-2026-09-08/sql8-migration-continuity.json).
The 181-Worker-test checkpoint above belongs to the earlier schema-7 release;
the current release and checks are identified at the start of this document.

## Secrets

Production accepts two Worker secrets:

- `ADMIN_TOKEN`: required for every `/v1/admin/*` route.
- `GROQ_API_KEY`: optional at the code boundary. When absent, Groq fails closed and
  the watch uses the deterministic policy after Workers AI.

Both names are declared in Wrangler's `secrets.required`, so production deploys
fail before upload if either encrypted binding is missing. The runtime still keeps
the deterministic fallback as a last-resort safety net.

Set them without placing values in config or shell history:

```sh
cd workers/habitat-runtime
pnpm wrangler secret put ADMIN_TOKEN
pnpm wrangler secret put GROQ_API_KEY
```

On Alejandro's Mac, the generated production admin token is also stored in the
login Keychain under service `aleetreny-habitat-runtime-admin` and account
`alejandrotreny`. Retrieve it for an operator request without printing it:

```sh
runtime_admin_token="$(security find-generic-password \
  -a alejandrotreny -s aleetreny-habitat-runtime-admin -w)"
```

The Groq key belongs to the dedicated Free project `habitat-prod`. Its current
only-allow list contains `openai/gpt-oss-120b` and `openai/gpt-oss-20b`. A real
inference smoke test is manual only and must never run in CI.

The [20:10 UTC account readback](../../docs/research/groq-dual-free-account-readback-2026-09-08.json)
records enabling 120B once while preserving 20B. Both models have 30 RPM,
1,000 RPD, 8,000 TPM and 200,000 TPD: 120B inherits the organization defaults;
20B retains its existing project override. Each model has its own allowance,
shared with other uses of that model within the organization. It is not a pooled
400,000-token budget. No billing upgrade, payment method, account or credential
was introduced. No API key is stored in this repository.

The [19:14 readback](../../docs/research/groq-free-account-readback-2026-09-08.json)
preserves the earlier OSS20B-only permission and its increase from historical
10 / 200 / 6,000 / 150,000 limits. Those old limits and permissions do not
describe the current dual-model deployment.

## Provisioned Cloudflare runtime

- Worker: `aleetreny-habitat-runtime`
- URL: `https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev`
- Workers plan: **Free ($0)**
- Cron watchdog: minute 7 of every hour
- Production secrets installed: `ADMIN_TOKEN` and `GROQ_API_KEY`

The production admin token is present as a Worker secret and in macOS Keychain.
The Groq key exists only in Groq and Cloudflare's encrypted secret store.

## HTTP surface

Public:

- `GET /health`
- `GET /v1/status`
- `GET /v1/snapshot`
- `GET /v1/observer` (one atomic revision: snapshot, 600 relationships, economy and public society state;
  supports `ETag` / `If-None-Match` and `304`)
- `GET /v1/archive?day=100` (optional `room` and `person` filters)

Bearer-authenticated administration:

- `POST /v1/admin/pause`
- `POST /v1/admin/resume`
- `POST /v1/admin/cognition/check` (idempotent provider smoke check; no world tick)
- `GET /v1/admin/recovery` (consistent private state and recovery manifest)
- `GET /v1/admin/recovery/page` (bounded immutable archive pages)

`POST /v1/admin/cognition/enqueue` returns `410`: the scheduler is the only creator
of world-bound cognition jobs. Existing unsupported orphan jobs are retired by
migration, rather than accumulating in an unconsumed queue.

Pause/resume body:

```json
{
  "commandId": "a-stable-idempotency-key",
  "issuedAtMs": 1788210000000,
  "expectedControlRevision": 0,
  "reason": "optional operator note"
}
```

Do not put the admin token in frontend code. These endpoints are for an operator or
a trusted deployment job, not the public observer browser.

## Private recovery and long archives

Society codec version 1 now permits optional `Conversation.appraisedThrough`.
The current reader accepts earlier snapshots without that field; an older strict
binary cannot read the extension after it has been written. Rolling back to that
binary is unsupported. Preserve watermarks in recovery rather than dropping them
to bypass validation and potentially repeat an effect. No new physical world or
SQL table is required for appraisal.

`GET /v1/admin/recovery` captures the world, scheduler, control state and mutable
records inside one SQLite transaction. Its checkpoint hashes codec version, rules
version, world revision and exact state JSON. `exportSha256` also covers the entire
export envelope. It neither pauses nor advances the world, changes revisions,
creates jobs, nor consumes inference quota. Both recovery routes require the same
admin bearer and return `Cache-Control: no-store`, without public CORS.

A small export has `complete: true` and contains all tables. A larger archive has
`complete: false`: its `tables` contain the mutable core, while `manifest` contains
each archive table's fixed `upperRowId`, expected `count` and `excludedRowIds`.
The core is limited to 128 rows per table and 4 MiB total. Unexpectedly exceeding
that bound produces an explicit error, never a silently truncated backup.

For each manifest entry, request `/v1/admin/recovery/page` with `table`,
`upperRowId`, the core's `exportedAtMs`, and comma-separated `excludedRowIds`.
Start `afterRowId=-1` (the initial checkpoint can have rowid 0), then use the
returned `nextAfterRowId` until it is `null`. Preserve the original bounds for
every page; do not obtain a new core between pages. New rows above that cut are
excluded, and rows that were mutable at capture are already present in the core.
Terminal jobs, attempts, events and journals are append-only; current and previous
UTC-day billing records remain in the mutable core.

Pages contain at most 128 rows, target 1 MiB, and allow one larger archival row up
to 8 MiB. Each page has its own SHA-256. Table names are allowlisted; cursor and
range inputs are validated. The Worker never loads years of history into memory.
Download pages locally and call `verifyRecoveryBundle(core, pages)` from
`src/checkpoint.ts`. It checks all hashes, common cut, cursor continuity, exact
row counts, duplicates and missing pages. `verifyRecoveryExport(core)` alone
verifies a checkpoint but does not turn `complete: false` into a complete backup.

Recovery files contain private memories and runtime details: keep them outside
source control and public assets. There is no public or automatic restore route.

From the repository root, `node scripts/capture-recovery.mjs /absolute/private/backup-directory`
downloads the core and every page, verifies the complete bundle and saves it with
private file permissions. Supply `HABITAT_ADMIN_TOKEN` in the process environment;
the script never prints it and refuses an output directory inside the repository.

Restoration requires an operator-reviewed procedure, verified backup and a paused
single authority; never start a second world or replace the live database merely
to move the frontend repository.

## Domain boundary

`src/domain.ts` is the only Cloudflare adapter around `src/lib/habitat`. It encodes
the `Map`-backed world into validated JSON, freezes each cognition job against a
world/control revision, and converts a structured model decision into an `Intent`.
The model never supplies the actor and never writes consequences. A world update,
job disposition and causal watch commit happen in one synchronous SQLite
transaction, so a retry can neither apply the same thought twice nor skip the
deterministic fallback.

The observer integration and the non-destructive sixteen-to-forty-eight-room
SQLite migration are documented in [the runtime handoff](../../docs/habitat-cloud-runtime.md).
Migration 4 keeps a byte-identical backup of the previous world and never changes
the original happenings archive. The observer receives historical room aliases
alongside `sourceRoom` provenance. Production state is preserved across deployment.

The preceding physical-world migration uses SQL schema 6 and world codec 4. Migration 6 keeps another byte-exact
pre-migration backup, adds knowledge, plans, fairness and interaction clocks,
economic-event history and verified checkpoints. It preserves identities, balances,
all relationship axes, world/control revision, simulation clock and next watch.
Authored knowledge has no invented acquisition date (`learnedDay: null`); a fact
learned through an actual action records its day and source. Daily checkpoints and
transaction entries record subsequent changes without rewriting earlier history.

SQL schema 7 introduced the separate cognitive state, jobs and society events
while preserving world codec 4. Its evaluation and initial release remain
historical checkpoints. The SQL8 read indexes and all-resident coverage were
subsequently verified, followed by SQL9/P6; see
[the validation record](../../docs/society-validation.md). Retry corrections have private events with the safe
reason and system/user hashes; terminal job inputs are compacted intentionally.
Those hashes do not reconstruct the removed full prompt. Historical benchmark
ledgers retain their full requests independently of production compaction.

The domain uses logical rooms, independently of sprite coordinates and old corridor
capacity. Finite inputs, recipient consent and physical needs still constrain
actions. Emergency food uses actual stocks and an affordable treasury transfer;
manual work remains possible when energy or maintenance is low. Shared work can
meet a companionship need through actual recorded participation. It creates no
conversation or relationship change. Flirting and sharing a fact require an
explicit intent and the relevant consent or knowledge checks.

Reproduce the long offline checks with `pnpm society:validate --long`. The data
in `../../docs/society-validation-after.json` cover 5,000 days for seed 1 and 365
each for seeds 7 and 23. These validate routines, failed-cognition fairness, stock
and currency invariants; they do not call a model or guarantee a particular story.
