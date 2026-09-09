# Authorized record retrieval and focus

Status: bounded design proposal, not implemented. This is a possible structural follow-up to [grounded receipt selection](grounded-receipt-selection-2026-09-08.md), distinct from rearranging a model's existing prompt. No inference, runtime mutation or deployment was performed for this proposal.

## Observed capability gap

The synthetic Alpha/Beta case documented in the receipt-selection review is an authorization-versus-selection mismatch. Alpha remains in the working state and readable by its author after Beta is created. A direct authorized share of Alpha passes the records domain, but the issued P6 grammar cannot express it.

[`recordContext`](../../src/lib/habitat/society/records.ts) selects revisions associated with two recent open offers, the latest own revision and the latest readable revision by someone else, then limits complete drafts to three. [`operationSchema`](../../src/lib/habitat/society/record-choice.ts) restricts document operations to IDs in that prepared selection. The context reports an omitted count but offers no catalogue, pagination or way to request an omitted revision.

This demonstrates a retained-record access gap. It does not establish that this gap caused the observed conversations, sparse publication or any model's false claim of having received a document.

## Smallest proposed boundary

Introduce a separately issued protocol, provisionally P7, for explicit private retrieval. Keep P1–P6 saved jobs and their decoders unchanged.

1. **Discover a bounded catalogue.** Add at most two metadata entries per page: immutable draft ID, exact title, author and creation time, with a next-page cursor. Apply `canReadRecord` before choosing entries, counting them or constructing cursor information. Do not enumerate every accessible ID in USER or schema. A catalogue entry establishes that an authorized revision exists; it does not expose its content or grant a content reference.
2. **Select an exact revision.** A new `read_record` request selects an entry bound to the issued catalogue. Resolve its immutable `draftId/contentHash` from trusted preparation, then revalidate current authorization and existence. Store one private focus binding. This request does not share a record, publish it, accept an offer, endorse its statements or transfer cells.
3. **Supply the content in a later opportunity.** At the next normally admitted cognition, include the focused revision's complete original text and correctly scoped reference grants. The focus replaces a position within the existing maximum of three complete revisions; it does not add an unbounded fourth document. Existing open-offer priorities must remain explicit and deterministic.
4. **Keep dispatch visible and budgeted.** A retrieval response ends that cognition opportunity. There is no internal second model call, synchronous tool/model loop or extra retry. Preparing a job, encountering a closed quota gate or receiving a failed response must not silently consume the pending focus. Normal fairness, pacing, admission and control rules govern the next opportunity.

The focus and any pending-delivery marker need small, durable, private state with explicit codec validation and recovery coverage. They should not be inferred indefinitely from whichever `output_json` happens to be the most recent. Once supplied, the system may record delivery of exact bytes to a model context; it must not label that delivery as understanding, agreement or approval.

No public endpoint or vector index is needed to address the retained working set. A deterministic selector can inspect the already loaded, bounded records state.

## Decisions required before implementation

### Retrieval cost: sequential paging cannot be the only discovery path

A two-entry catalogue over 256 accessible revisions could require about 128 cognition opportunities to reach its final page. At the current global three-minute cadence, 128 opportunities occupy at least 384 minutes before sharing that capacity among 25 residents, provider admission delays or a subsequent content-selection turn. This is a feasibility bound for the proposed interaction, not a measured provider throughput or an acceptable retrieval target.

Keep the design open to a bounded deterministic query over exact titles and/or text, with authorization applied **before** searching, ranking, counting or returning any result. It would use the same stored records and ordinary cognition opportunities; no vector service, model-based search or hidden second inference is proposed. Query syntax, matching rules, result bounds and failure behavior still need design and tests. A cursor should remain a traversal fallback, rather than the only way to reach an old revision. The two-entry page size is therefore a starting budget constraint to evaluate, not an approved complete retrieval architecture.

### Versioned catalogue and cursor under insertions and access changes

Specify cursor semantics before choosing a representation. Offset pagination is insufficient: newer records or grants can move entries between pages. A keyset cursor with an explicit high-water mark is a candidate, but its authorization semantics must also be defined. A later grant can make an older ID newly readable; eviction can remove a previously listed revision.

The design must decide whether a page sequence represents a fixed authorized snapshot or a changing authorized view. Define how a refresh is signalled and how a resident can discover newly granted older revisions without silently skipping retained entries or restarting forever under unrelated activity. A catalogue version must not expose unauthorized titles or global totals. Avoid using unrelated global record revisions as a user-visible activity signal. Opaque cursor encoding alone is not an access-control check.

Bind every issued selection to the actor and trusted page contents. Revalidate access when serving metadata, selecting a revision and preparing its full content. Never substitute a newer revision with the same title. If the selected revision becomes unavailable, return an explicit bounded result without its protected content and without fabricating an archived copy.

### Private retrieval while waiting for an interlocutor

Decide explicitly whether `read_record` is independently eligible while the resident is waiting for another person's conversational turn. The proposed behavior is a private operation that may be scheduled normally without sending a message or consuming, closing or advancing that conversation. It must not require a filler message merely to satisfy a conversational grammar.

This requires a deliberate scheduling and validation boundary. [`nextSocietyActor`](../../workers/habitat-runtime/src/society-scheduler.ts) currently combines replies, overdue reviews and observations; the existing [`commitRecordOnlyTurn`](../../src/lib/habitat/society/turn.ts) still uses shared turn freshness checks. Determine which checks a private retrieval job needs when an interlocutor speaks during its lifetime. Preserve control, actor, sequence, expiry and record-permission validation without letting the operation overwrite a new conversation revision or reinterpret an old conversational response.

Also define a bounded pending-retrieval eligibility signal: selection must eventually obtain a later context, but browsing must not monopolize scarce cognition slots. A pending focus cannot bypass pacing, create jobs while admission is denied or repeatedly shift its due time. It cannot advance physical time or manufacture a new observation solely to force scheduling.

## Implementation surfaces

| Surface | Proposed responsibility |
| --- | --- |
| [`records.ts`](../../src/lib/habitat/society/records.ts): `canReadRecord`, `recordContext` | Reuse existing authorization; add a separately invoked bounded catalogue/focus selector. Preserve the historical P6 selection path. |
| New protocol adapter beside [`record-choice.ts`](../../src/lib/habitat/society/record-choice.ts) | Issue and validate retrieval-specific grammar, bind selections to prepared metadata, and route ordinary document operations through their existing semantics. A retrieval-only branch must not imply another record operation. |
| [`record-types.ts`](../../src/lib/habitat/society/record-types.ts), [`record-schema.ts`](../../src/lib/habitat/society/record-schema.ts), [`schema.ts`](../../src/lib/habitat/society/schema.ts) | Define and validate small private retrieval state, with an explicit compatible codec transition. Preserve existing fields and historical job interpretation. |
| [`society-protocol.ts`](../../workers/habitat-runtime/src/society-protocol.ts) | Route only newly issued P7 jobs to the new adapter. Unknown versions remain rejected; saved versions 1–6 retain their existing routes. |
| [`society-scheduler.ts`](../../workers/habitat-runtime/src/society-scheduler.ts) and [`habitat-world.ts`](../../workers/habitat-runtime/src/habitat-world.ts) | Resolve later-context delivery and private eligibility, atomically persist successful selection, preserve leases/control and use ordinary provider admission. |
| [`checkpoint.ts`](../../workers/habitat-runtime/src/checkpoint.ts), [`recovery.ts`](../../workers/habitat-runtime/src/recovery.ts) | Validate and restore the private focus and cursor consistently across crashes and complete backups. Document old-binary rollback restrictions if the codec changes. |
| [`public.ts`](../../src/lib/habitat/society/public.ts), [`publicRecordView`](../../src/lib/habitat/society/records.ts) | Continue explicit public allowlists. Do not expose private catalogue entries, retrieval intent, cursor state or focused drafts. |

## Acceptance criteria and tests

- **Alpha/Beta end to end:** create both through actual record operations; discover retained Alpha, select it, supply exactly Alpha in a later preparation and share it with an authorized recipient. Verify that neither discovery nor selection shares anything.
- **Catalogue traversal:** cover more entries than one page, equal titles, exact revisions, new insertions, newly granted older records, unavailable selections and cursor tampering. Demonstrate the chosen refresh semantics and that retained authorized entries remain discoverable.
- **Permissions at every boundary:** use two residents and private, named-recipient and public grants. Unauthorized titles, counts, cursor data, text, reference IDs and focus state must never reach another resident or a public DTO. Private source references remain private after retrieval.
- **Conversation independence:** exercise selection while waiting for the other speaker and a new incoming message between preparation and application. Verify the chosen eligibility rules without changing participants, next speaker, transcript, expiry or consent. No message is inferred or required solely to browse.
- **Atomicity and recovery:** duplicate delivery has one effect; a crash, stale control, expired job, rejected output or denied quota leaves a consistent pending focus. Restart from a complete backup and obtain the same exact selected revision.
- **No unintended effects:** reading changes no authored content, project, offer, agreement, publication intent, physical slot, wallet or ledger entry. It cannot count as fulfilled work or publication.
- **Historical compatibility:** replay saved P1–P6 preparations, including both legacy 600-character and marked 504-character P6 drafts. Preserve their issued schemas and acceptance semantics; do not add catalogue IDs or a new operation to an old job.
- **Measured budget:** prepare all 25 residents and stress retained-record capacity, Unicode titles, active commissions and three full documents. Measure complete USER/SYSTEM/schema token estimates and byte bounds. Do not assume two metadata entries always fit; retain the existing admission limits and report an explicit overflow rather than truncating selected text or reference grants.
- **Fairness and calls:** a retrieval result triggers at most a later normally admitted job. Repeated catalogue navigation cannot bypass quotas or starve other residents; there is no hidden second inference or model server action.

## Retention boundary and remaining risks

[`releaseOldDraft`](../../src/lib/habitat/society/records.ts) can remove old working-set drafts when the 256-entry capacity is reached. [`saveSociety`](../../workers/habitat-runtime/src/habitat-world.ts) permanently archives publications with their drafts; it does not archive every unpublished private revision. The public `getRecords` route is an observer-only archive projection, not an authorized private retrieval service for residents.

The first change should therefore promise access to **retained but omitted authorized revisions**. Recovering evicted unpublished drafts requires a separate retention/authorization design. A focus should handle eviction explicitly; pinning every historical focus indefinitely could instead prevent legitimate capacity reclamation.

Additional cost and latency are real: paging or selecting may require more than one ordinary cognition opportunity. This trade-off must be measured rather than described as free or instantaneous. Complete retrieval also does not ensure that a model distinguishes authored claims from factual outcomes; the earlier layout experiment remains a separate semantic evaluation.

**Sequential paging cannot be the sole practical retrieval method.** With256 retained entries and two metadata entries per page, inspecting every page would consume128 cognition opportunities. At the current global three-minute minimum that allocates384 minutes of opportunities to one resident, before reserving time for the other24. This is a capacity calculation, not a measured model run. Before implementation, evaluate a bounded deterministic query over authorized titles and text, filtering by `canReadRecord` before matching, ranking or counting. Return exact source content and a bounded result page; keep the cursor as a fallback. Such a query needs neither embeddings nor a second model call, but its matching rules, access-change behavior and cost still need specification and tests. No search implementation or semantic success is established by this proposal.
