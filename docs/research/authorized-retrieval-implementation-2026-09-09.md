# Authorized record retrieval: released implementation

Status: **deployed as `caf46bd8-1bda-40f6-a1f3-b60dfe420375`**, SQL11 / society codec 3 / P7. This implements the retained-record access boundary in the [retrieval design](record-retrieval-design-2026-09-09.md). The design remains a historical proposal; the concrete decisions below supersede its provisional two-entry page and open cursor questions. No new model calls were made for this implementation or its budget measurement. This is a functional capability change, not evidence that agents will use records correctly or make better social decisions.

## What a resident can do

Newly prepared protocol 7 jobs offer a private `lookup` alternative: `search`, `next`, `refresh`, `read`, or `clear`. It cannot be combined with speech, a project, a document operation, an appraisal or a deal. A successful lookup changes only that resident's private retrieval bookkeeping and ordinary cognition success/sequence counters. It neither reads on another resident's behalf nor shares, publishes, endorses or pays for anything.

Search is deterministic over the retained working set of at most 256 drafts. It normalizes a literal query using Unicode NFC, lower case and collapsed whitespace; the limit is 96 Unicode code points. Authorization precedes matching, ranking, counts and pagination. Ranking prefers exact titles, title prefixes, title substrings and then body substrings, with deterministic time/ID tie-breaks. Each page contains at most three authorized entries.

The cursor binds the actor, normalized query and snapshot of matching authorized metadata. Relevant insertion, grant or eviction requires an explicit refresh; an unrelated private insertion does not disclose activity by invalidating the cursor. There is no archive search, vector service or additional model call. An evicted unpublished revision remains unavailable.

`read` selects only an ID on the issued private page. The server retains its exact draft ID/hash binding in `PreparedTurn.recordRetrieval`, checks the current page, content integrity and access again, and saves one private focus. This trusted metadata is outside model prose. The model sees only the bounded catalogue, exact offered IDs and focus availability; it cannot supply replacement hashes or a fabricated trusted page.

At a later normally admitted P7 cognition, an accessible focus supplies its complete original content and scoped references within the existing maximum of three complete drafts. Catalogue metadata alone grants no content reference. A missing or inaccessible focus is reported unavailable without substituting a newer revision. `clear` removes the query, cursor and focus and leaves no pending delivery.

## Persistence, timing and consent

Society codec 3 adds 25 private retrieval entries: version, per-actor revision, query, cursor, focus, pending flag and last applied sequence. Codec validation bounds every field and rejects impossible future IDs, inconsistent retained hashes and cursors ahead of their minds. Eviction or a later access change does not invalidate the entire society; current access is rechecked at retrieval boundaries, and focus does not pin a draft against retention.

Preparation and quota denial do not consume pending delivery. Rejected, expired or stale results also leave it intact. Only a successful ordinary P7 turn tied to the same retrieval revision acknowledges pending delivery, retaining the selected focus. A saved P6 turn does not acknowledge it. A lookup can set another pending request; a duplicate applied sequence has no second effect. Delivery establishes that exact bytes were supplied, not that the model understood or agreed with them.

A resident waiting for an interlocutor can choose the private alternative without advancing or closing that conversation. It still obeys control, expiry, sequence, mind-revision and retrieval-revision checks. An incoming message during the provider request changes the resident's mind revision and makes the old lookup stale. Pending retrieval joins existing fair scheduling and backoff at the ordinary global cadence; it does not bypass admission, reserve a special wake-up or create a hidden second inference.

SQL11 archives the exact previous cognitive row in `society_layout_backups` and migrates it to codec 3. World codec 4, existing jobs, world revision, clocks, authored-record archive and provider ledgers remain separate and unchanged by this migration. Recovery recognizes old rules and validates the new private state. The public society DTO remains explicitly version 2 and includes no retrieval query, page, cursor, focus or pending flag. Restoring a codec 3 database into an old binary is not a supported rollback; the archived prior row is evidence and a migration input, not permission to discard subsequent activity.

P1–P6 continue to use their existing dispatchers and issued contracts. P7 has an explicit version and preserves ordinary P6 operation semantics; it does not reinterpret pending historical jobs. The separate [released structural retry feedback](structural-retry-feedback-2026-09-09.md) improves bounded error information without changing response acceptance.

## Measured capacity, not consumed quota

[Final measurement](retrieval-budget-final-2026-09-09.json) prepared the same 25 residents from a complete revision 235 backup with P6 and P7, without HTTP or state mutation. These are conservative complete Groq reservation estimates including the unchanged output allowance, not observed provider token usage.

| Metric, same 25 preparations | P6 baseline | P7 final |
| --- | ---: | ---: |
| Reservation range per job | 5,202–7,553 tokens | 5,420–7,843 tokens |
| Sum across 25 jobs | 157,130 tokens | 163,079 tokens |
| Jobs above 8,000-token admission | 0 | 0 |
| Maximum complete payload bytes | 24,333 | 25,634 |
| Sum of conservative CF neuron ceilings | 18,597 | 19,492 |

The P7 increment is 218–294 tokens per job, 5,949 across this fixture. All 25 fit the per-request 8,000-token gate at this cut; a larger future context can still be deferred. A complete simultaneous sweep is not promised: CF ceiling totals exceed the 8,000-neuron daily runtime allocation, and Groq minute/day windows and model-specific remaining balances still constrain scheduling. Prices, output cap, provider routing, 8,000 runtime / 2,000 research CF split, and both Groq models' separate 30 RPM / 1,000 RPD / 8,000 TPM / 200,000 TPD limits are unchanged. Searches and later focused turns consume ordinary cognition opportunities and their actual inference budget.

The separate [retained-capacity fixture](retrieval-retained-stress-2026-09-09.json) constructs 256 legal 600-byte public drafts through actual domain operations across all 25 authors, without publication, agreement, economy change or HTTP. Its initial P7 reservations peak at 7,660 Groq tokens; selecting an older focus and supplying all three complete revisions reserves 7,731, with 25,827 combined authored-component bytes and a 13,300-byte largest authored component. This is a synthetic capacity check, not production content or a guarantee that future commitments and retry feedback fit.

## Verification and remaining limits

- [Pure retrieval tests](../../src/lib/habitat/society/record-retrieval.test.ts) cover authorized search, bounded pages, relevant access changes, unavailable selections and snapshot validation.
- [Protocol tests](../../src/lib/habitat/society/retrieval-choice.test.ts) and the [independent review cases](../../src/lib/habitat/society/retrieval-review.test.ts) exercise omitted Alpha retrieval followed by an explicit share, private waiting, stale incoming speech, actual eviction, current access checks, clear and legacy separation.
- [Codec tests](../../src/lib/habitat/society/retrieval-state.test.ts) cover migration, exact bindings, genuine 256-entry eviction, Unicode bounds and public privacy. The focused app checkpoint passed 31 tests across codec, record migration, appraisal and agency fixtures.
- [SQL11 migration/recovery tests](../../workers/habitat-runtime/test/retrieval-runtime.test.ts) verify exact prior-row archival, untouched historical jobs/tables, corruption rejection and private restoration. Together with records/recovery/quota fixtures, the focused Worker checkpoint passed 24 tests.
- [The durable job test](../../workers/habitat-runtime/test/retrieval-job-runtime.test.ts) passed actual `applySocietyJob` processing of search, read, P6 and P7 results, two complete export/restore boundaries, duplicate no-ops, pending preservation and exact focused text delivery. It uses isolated fixtures, no HTTP, no provider-attempt rows and no quota reservations. Conversation, records, balances and world time remain unchanged.

[Final release validation](release-2026-09-09/retrieval-release-validation.json) passes 1,019 application / 355 Worker / 62 Node tests, types/lint, 21 fresh browser flows covering 45 rooms, six hosting checks with zero external requests, build with 59 deployable files / 46 room PNGs and dry deploy. The [302-source manifest](release-2026-09-09/retrieval-source-manifest.json) has bundle SHA-256 `d11e7dd6feda80b9427262228a444f204e19e956afc16bc623705d6d60250a14`. Native post-release visual review remains pending because the Mac was locked; automated browser tests are fresh.

The [23:25:10 UTC status](release-2026-09-09/retrieval-propagated-live-status.json) reports revision 247, SQL11, healthy physical/cognitive scheduling and 25/25 successful coverage with zero never-thought residents. The [exact continuity receipt](release-2026-09-09/retrieval-natural-continuity-receipt.json) reproduces every row ID and column of all 26 post-cut canonical tables: 1,750→1,761 rows, revision 245→247, actual SQL11 migration plus one natural H104 P7 message. The old cognitive fields and exact archived codec 2 bytes survive migration; 25 retrieval cursors initialize empty. Physical JSON and clock/control fields remain unchanged, and duplicate SQL/domain application has no effect.

Both strict failures are preserved: the first immediate post-cut still contained SQL10/Society2, and the later migration-only comparison rejected the natural turn. The reason for the initial old cut is not proven. The successful offline replay used 304 SQL operations and a synthetic HTTP envelope around retained output/usage, with zero network requests or new inference. It does not establish original HTTP bytes, independent latency or platform service behavior. H104 used 6,486 input / 111 output tokens from Groq120B, against 6,519 input + 1,024 output reserved; it emitted no lookup, document operation or economic effect. All seven drafts remained unchanged.

The [semantic evaluation plan](authorized-retrieval-semantic-evaluation-plan-2026-09-09.md) is predeclared but unexecuted. Revision247 is not a valid access-gap sample: all seven drafts are already supplied to their authors and all 25 P6 preparations report zero omitted drafts. An omission or planted response must not be manufactured to create a comparison. No new research inference was performed: cumulative local calls remain 165 and cloud research 1,852 conservatively accounted neurons. Actual P7 retrieval, latency under scarce quota, improved factual grounding, successful negotiation and autonomous completion remain unestablished.
