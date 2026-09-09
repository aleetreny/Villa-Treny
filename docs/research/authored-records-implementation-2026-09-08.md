# Authored records: implementation and acceptance boundary

Current checkpoint at18:50UTC: P6/SQL9/Society2 is deployed as `fafe7049-098d-4e42-ae35-0ff65054d988`. The [release verification](release-2026-09-08/records-release-verification.json) and [exact migration continuity](release-2026-09-08/sql9-migration-continuity.json) preserve the previous world and clocks at revision175. Native browser review confirms the new public writing archive; it is empty at this cut. The18:10 local implementation checkpoint preceded a ten-call local evaluation with mixed/negative results, detailed below. No autonomous P6 production outcome is claimed by this release.

## Problem and concrete behavior

A resident could promise to write or deliver a report while the engine had no document operation. A plausible message did not create a usable artifact. P6 retains the P4 object contract and adds an optional record operation. Drafts contain exact title/text, author, audience, evidence references and a content hash. A revision names its parent content; it does not overwrite a prior publication. Available IDs and readable contents come from the resident's actual context.

An agent can share a draft, publish its own work or propose a commission tied to exact draft content and a price. Acceptance must come from the other party as a structured operation. Matching prose or two similar proposals do not imply consent. A recipient receives an observation of an actual shared draft/offer; this does not assert that they read, agreed with or understood it.

Publishing takes the resident's one available physical action slot, including an unused slot in the current watch; it does not impose another six-hour delay. It replaces ordinary work/travel for that watch and can be interrupted by urgent needs. The immutable publication is the evidence for commission settlement; promises and accepted-but-unperformed work do not transfer money. A fulfilled zero-cell commission is voluntary collaboration without a negotiated payment. The money reservation bridge covers older agreements and record commissions together, and publication/retry cursors prevent extra actions or duplicate payment.

The observer renders exact public writings and distinguishes proposals, accepted commitments, pending publication, publication, payment due and fulfilled work. Historical public documents have a bounded, indexed, read-only pagination endpoint. Private drafts and private publications remain excluded. No observer operation triggers inference or physical time.

## Limits and validation

- Combined title/text is bounded to600UTF-8 bytes, including a96-byte title limit, with at most4 references. This is a short writing capability, not arbitrary long-form authoring or file execution.
- The active state is bounded; exact publications are archived separately. Necessary commitments and accessible reference anchors remain protected during eviction.
- Society codec1 is upgraded to codec2 (physical WorldCodec remains4) only with an empty records extension. SQL9 stores the old singleton bytes/hash and adds archives without rewriting prior jobs, quotas, the world or its deadlines.
- P6 is explicit; previously saved protocols1–5 retain their interpretation. Provider schema acceptance, model choice and actual subsequent performance require separate evidence.
- Local deterministic tests cover publication slot exclusion, urgent interruption, exact-content agreement/payment, conservation, replay, privacy, archive pagination, recovery corruption and old-schema continuity. Passing them establishes those invariants, not autonomous social success.

## Rejection diagnostics

Provider receipts previously retained billed usage and rejection codes but discarded invalid output. A new private bounded log captures the selected candidate before parsing/normalization, actual prompt hashes, the issued schema, the selected field and a conservative validation stage. Primary failure is persisted before fallback. Grouped schema/decode errors remain grouped; the log does not invent a precise cause or a missing response. Optional diagnostic failure cannot change acceptance, accounting or retry permission. See `docs/recovery.md` for limits and export behavior.

An independent audit also reproduced retry feedback disappearing when quota pacing replaced the rejection cause with a wait label. The correction must preserve the rejection cause while postponing dispatch; its regression test checks that waiting consumes no new attempt and the eventual request still carries its original correction.

## Model-backed evaluation and remaining acceptance

The [completed local evaluation](records-protocol6-local-review-2026-09-08.md) used four independent clones of one complete canonical recovery at revision159/day107III. It followed actual next speakers in CN/AU/BK/TY, with at most three responses each and twelve permitted calls. Ten requests completed; CN stopped after a private-audience/publication mismatch. Nine replies applied, creating one private draft, no publication, no document commission and no publication payment. The other two permitted calls were left unused. Eight older economic proposals, unsupported claims of attached/read records and a spoken/structured assignment conflict remain part of the result.

Exactly one physical watch per clone was an isolated forecast, never an observed production outcome. Raw states/prompts/responses remain private. The subsequent [grammar correction and admission measurements](records-protocol6-release-measurements-2026-09-08.md) do not rewrite the frozen negative trial or prove that instructional clarification improves future model decisions. Complete release checks pass949application/248Worker/48Node tests, plus21browser and6offline hosting checks. Genuine autonomous document sharing, agreed publication and paid performance still require actual model-backed evidence.
