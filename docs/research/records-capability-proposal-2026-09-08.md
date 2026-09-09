# Proposed records capability — 8 September 2026

**Decision pending.** Evaluate protocol5 first. Any records implementation belongs in a separate protocol6; this note does not change code, prompts, the world, pending jobs or historical results.

The smallest useful expansion is an authored, versioned record that a resident can draft, publish and give another resident a precise reference to review. It creates a persistent output instead of treating generic work, sleep or a room visit as writing. It does not add paper, ink, rooms, sprites, fabricated observations or automatic consensus.

## Evidence and scope

The review covered all25 [canonical resident profiles](../../src/lib/habitat/residents.ts), all53 applied decisions in the verified complete recovery cut behind the [16:02 public analysis](release-2026-09-08/final-live-analysis-1602.json), and the relevant saved [local V7 decisions](model-society-v7-local-2026-09-08/review.md). The production cut contains52 communicated messages and one private decision without a message. Its published analysis shows only the latest20 messages; the complete archived public events and structured effects were examined for this proposal. No private motivations, model inputs or raw private outputs are reproduced here.

| Resident | Canonical desire and concrete observation | Missing world effect |
| --- | --- | --- |
| Ama | Wants to write. Public turn3 requests supplies for a writing project; decisions1/7 select `accrue_labor_credit` in Records. | Generic work does not produce an authored text. The request grows into an imaginary paper-and-ink loan in later messages. |
| Cato | Wants waking criteria written before a case arises. Turns18/103/246 repeat that request. | There is no identifiable draft to inspect, challenge or endorse. |
| Noor | Turn183 promises to draft the criteria. Public project decision35 plans five sleeps and one room visit. | Those actions cannot produce the promised document. |
| Kes | Public turn260 says the garden update and workshop logs are attached; decision49 plans sleep. | No attachment object or delivered document exists. The claimed backlog was itself unsupported. |
| Reva | Wants a correct inventory. Turns126/213 request a check; decision40 uses sleep for the public inventory-verification project. | No authored, dated comparison can be retained and checked against the stock evidence. |
| Yara | Wants to matter; public decision34 proposes a visual resource summary and selects sleep. | There is no persistent informational work. A text record could support a written summary, but must not be presented as an illustration or generated visual artwork. |

This is broader than a medical-document special case. It supports authored compositions, proposed procedures, reports and critiques. It also gives a concrete object around which Bex can be consulted and Tomás can dispute a number. It would not, by itself, fabricate Quim's durable object, teach Pilar's practical skill, establish ownership for Vero, or decide whether Halim's roster is fair. Many canonical desires remain social or subjective rather than machine-verifiable goals.

The [final three local replies](model-society-final-dialogue-local-2026-09-08/review.md) show a separate failure: Juno says she accepts but emits another offer. Records do not solve that decision-format problem. The records proposal must not be used to relabel those zero agreements as successful cooperation.

## Minimal proposed contract

1. A resident may prepare one bounded draft with a project in an existing cognition turn: title, short text, references and visibility. The server assigns its author, ID and content hash. A draft is explicitly pending; generating it does not yet publish a document or fulfill a goal.
2. A new action, `publish_record`, consumes the resident's single productive slot in a physical watch. It publishes the exact bound draft as an immutable revision, with author, parent revision, content hash, time and evidence references. Existing action names and effects remain unchanged.
3. Sharing a draft or published revision gives the recipient its exact ID and content, labelled with its actual state. Another resident can discuss it using ordinary messages and references. An endorsement, if supported, must be an explicit action by that person about that exact revision; it is never inferred from flattering prose or a request to edit.
4. Only the original author revises that document in this first scope. Others propose changes in their own attributed messages; the author may accept, reject or write a new revision. This avoids implicit joint authorship, overwritten objections and a general collaborative-editor permission system.

Writing need not depend on exact co-location. Publication still consumes time through the existing watch budget. Bodily emergencies may interrupt it, leaving the draft pending or the action explicitly failed according to the established plan rules. No extra model call is required to apply publication.

The world verifies **who published which bytes and when**. A report remains that author's report. It is not automatically a verified measurement, safe medical protocol, binding rule, fair allocation or statement accepted by its readers. Evidence references allow comparison; they do not make the prose true. Private goals and source memories are never copied into a public document automatically.

## Economic effect without invented value

For the first scope, commission the publication of an **already specified draft**, not an undefined future text whose quality would need an omniscient judge. Terms bind the draft ID and content hash, author/worker, payer, existing cells and deadline. The counterpart sees the draft and independently accepts the exact offer ID. Changing the text requires new terms.

Only a matching publication event **after acceptance** can complete that unit of work. It then uses the existing balance, promised-funds, payment and deadline utilities. An earlier document, duplicate event or different revision cannot fulfill it. A missing balance remains unpaid under the existing rules; no new currency is created. A zero-cell commission is unpaid cooperation, not evidence of monetary exchange.

This produces a narrow, mechanically inspectable contract: publish this agreed text. It does not claim that the buyer likes the result, that the text is accurate, or that the author's deeper purpose has been achieved. Broader commissions for an as-yet-unknown document, paid editorial approval, shared ownership and enforceable institutions are deferred.

## Preservation, limits and context cost

Use a separately versioned cognitive-state extension initialized with no drafts or records. Keep WorldState's existing data and accounting; do not seed documents from old claims about attached files. Protocols1–5 and pending jobs retain their original interpretation. Publication and revision events need durable recovery coverage; bounded active entries must not delete a document referenced by an active commission.

Proposed initial bounds are one active draft per resident project, at most600 UTF-8 bytes of body text and four accessible references per revision. Context should include at most one relevant received revision and a compact summary of the resident's own draft; document selection and omitted counts must be explicit. It must not silently truncate a revision whose exact content a resident is being asked to accept.

These are **design bounds, not measured token costs**. The [current full-context fixture](cognition-pacing-measurements-english-2026-09-08.json) already reserves7029 tokens for A and5480 for D under Groq, including1024 output tokens; the oversized case is routed independently rather than hiding obligations. Measure the complete compiled protocol6 schema, instructions and context against all25 initial jobs and representative reply/commission cases before proposing a deployment. Do not remove existing commitments or private evidence to make the new fields fit.

The draft can be generated during a call that already exists; publication is a deterministic watch action. Comments and acceptance still need each person's independent cognition opportunity. There is no justification for adding mandatory discussion rounds or assuming that document existence increases the free daily quota.

## Acceptance tests before any model evaluation

- Draft → independent request for changes → revised draft → exact offer → independent acceptance → one publication watch → conserved payment. The persisted record and agreement must identify the same immutable content.
- A rejection, changed hash, publication before acceptance, stale response or inaccessible reference does not fulfill the contract or transfer cells.
- A bodily interruption consumes no second productive action and creates no phantom publication or payment. Duplicate cognition and physical observations are idempotent.
- The author cannot sign for the reviewer, edit another person's revision or expose private motivations through public projection. A request to change a draft does not imply endorsement.
- A false factual sentence remains an attributed claim; it cannot update inventory, medical state, keys, room ownership or compulsory rules.
- Migration preserves the old physical world and outstanding agreement semantics. Full backup/replay includes the new objects, and active commissions protect their referenced revisions from eviction.

These deterministic tests would prove a real capability, not that a model will use it coherently. A later bounded evaluation would need to observe an actual useful document and an independent substantive response, with any negotiated payment counted only if it genuinely occurs.

## Technical appendix: proposed protocol6 extension

**Not implemented.** This is a read-only design review of extension points, not part of the protocol5 release. No records, publication actions, commissions, migrations or new model calls were introduced by this review. Names below are proposed interfaces.

| Module or boundary | Smallest proposed extension |
| --- | --- |
| New `society/records.ts` | Validate bounded drafts and their accessible references. Assign author, ID and content hash on the server. Preserve exact authored bytes; revisions create new IDs instead of changing a draft already referenced by an offer. |
| [Society types and state codec](../../src/lib/habitat/society/types.ts), [schema](../../src/lib/habitat/society/schema.ts) | Add a publication step distinct from the engine's `Intent`, and a commission variant binding `draftId`, content hash, worker, payer, cells and an inclusive deadline. Do not add publication to `WORK_VERBS` or change what `note`, `work` or `inspect` means. |
| New protocol6 adapter | Admit draft authoring and explicit publication scheduling while retaining the ordered decision/content format. A supplied reference to a newly authored draft could be resolved within the same response, avoiding an extra mandatory cognition round. Draft creation alone must not schedule publication. Earlier response protocols retain their interpretation. |
| [Society physical planning](../../src/lib/habitat/society/physical.ts) | Select publication as an alternative to a physical step, using the same resident/watch ownership and duplicate guards. An urgent interruption leaves the publication pending; a genuine invalid draft or hash is an explicit failed attempt. |
| [Watch execution](../../src/lib/habitat/engine/tick.ts) | Add a trusted, synchronous publication branch inside the resident's existing action slot, after `urgentPlanInterruption`. It must replace that slot's routine, not run after it. Keep bodily decay and the daily close unchanged. The branch must not call an old verb as a substitute for publication. |
| [Agreement accounting](../../src/lib/habitat/society/economy.ts) | Match an accepted commission to a later publication event with the exact author, draft ID and hash. Reuse conservative transfer, promised-funds, unpaid-completion and deadline rules without granting labour credits. One matching publication fulfills one unit once. |
| [Worker physical commit](../../workers/habitat-runtime/src/habitat-world.ts) | Persist the publication, observation, resulting physical watch and any payment in the existing `commitPhysicalWatch` transaction. A failure rolls back that complete cut; no external I/O belongs inside the publication operation. |

### State, archival and privacy boundaries

Prefer an explicit society codec2 migration rather than silently extending the current strict codec1. Retain the old reader for historical recovery validation and initialize the new records extension empty. Preserve the physical WorldState codec, resident state, existing agreement terms, pending jobs, monetary balances, control revision and physical schedule. An old binary that cannot read codec2 is not a valid rollback target after the first new write.

Keep active drafts and necessary pinned revisions bounded in the cognitive state. Store published revisions in an append-only archive with paginated recovery support; do not grow the mutable society JSON indefinitely or evict a revision required by an open offer or active commission. Publication identity must include an ordering marker independent of prose and wall-clock equality, so the engine can prove that fulfillment occurred after acceptance.

Sharing needs an explicit recipient or public audience. Private draft text, titles, hashes, source memories and motivations must not enter public DTOs through a spread of internal fields. A recipient asked to accept a publication commission needs the complete exact draft, not a truncated preview. Reference validation establishes access and identity; it does not certify the truth of a sentence. Public rendering should display authored text as text, not execute markup or treat document instructions as system instructions.

The earlier 7029/5480-token example above is a protocol4 measurement. The [implemented protocol5 measurement](ordered-choice-measurements-2026-09-08.json) reserves6599/5050 for the same synthetic24-loan A/D fixture, including128 provisional framing tokens and1024 output tokens. Neither measurement estimates protocol6 costs. P6 requires a fresh measurement of its full schema, instructions and exact received documents; an oversized essential draft must not be silently truncated to obtain provider admission.

### Four concrete integration risks

1. **Action-slot duplication.** Current `tick.ts` executes a routine or planned engine action before `observeSocietyActions` records it. Publishing only in that observation phase would grant a second productive action. Publication must be chosen inside the original slot; an interruption performs only the urgent action, and replay must not publish again.
2. **False completion evidence.** Current work fulfillment requires an economic event containing positive labour credits, and `acceptedAfterEventSequence` refers to that economic stream. A document cannot legitimately fabricate such a credit. Add publication-specific evidence and ordering, rejecting earlier publication, changed bytes, a different author or a repeated event. A false factual sentence remains an attributed claim, never an inventory or medical-state update.
3. **Accidental public disclosure.** `society/public.ts` currently spreads offer and agreement terms. Adding a private draft reference to those terms without a new allowlist would expose its ID/hash, and potentially later its title or text. Keep private payloads and inaccessible source references out of public snapshots and actor contexts; sharing is explicit and never implies endorsement.
4. **Invalidating historical recovery.** `recovery.ts` uses a global `RECOVERY_TABLES`, while `checkpoint.ts` currently requires its full set for backups whose SQL version is at least7. Adding a records table without making required tables depend on the source SQL version would reject valid SQL7/8 backups. New archives must be included in complete recovery cuts and checksums while older table sets remain valid for their own versions. A physical-world checkpoint alone is still not a records backup.

Before implementation can be considered complete, extend deterministic tests to cover a whole interrupted and retried publication watch, exact-hash commission fulfillment, missing payer funds, duplicate observations, stale control, transaction rollback, codec migration and complete backup restoration. These checks establish execution and accounting, not literary quality, reader agreement or a resident's broader success.
