# Independent review of agency and persistence

7 September 2026. Reviewer: the observer implementation agent, independently reading the runtime agent’s new engine/backend changes. This pass did not edit engine or Worker implementation. The test state was local and ephemeral; no live watch or paid model invocation was requested.

Read `knowledge.ts`, `verbs.ts`, `tick.ts`, `state.ts`, `economy.ts`, `domain.ts`, `checkpoint.ts`, prompt packing, and the relevant migration/export/status code.

## Findings and corrected outcomes

1. **Foreign secret IDs leaked through the output schema.** The prompt’s `fact` enum listed every `secret:from:to:knower` ID even when the user context was filtered to the actor’s own knowledge. This disclosed hidden relationships and the person who knew. The runtime agent changed the output field to `string | null`, lists only the actor’s available knowledge, and keeps engine-side authorization. A whole-job regression now inspects both prompt and schema.
2. **Reverse relationship scores exposed unspoken feelings.** `relationships.heldBy` supplied the other resident’s exact six private axes, despite the Weave being an observer-only instrument. Those values are removed from agent context. Own feelings and witnessed memory remain available.
3. **Checkpoint metadata was outside its checksum.** The independent script changed revision26 to27 without changing the state or SHA and verification accepted it. The corrected checksum includes codec, rules, revision and serialized world. Repeating the same mutation is now rejected.
4. **Malformed historical events passed the persistence boundary.** A stored record with a date50 days ahead and `who: ['A','A']` was accepted. The codec now rejects future events and repeated participants. The same independent input is rejected after correction.
5. **A recipient could initiate a second sustained interaction in the same watch.** `A → B speak` followed by `B → C speak` both succeeded because the busy check applied only to the next recipient. The runtime agent confirmed a one-sustained-interaction-per-person rule and checks the actor as well. Repeating the reproduction gives first=true, second=false. Instant transfers remain explicitly exempt and retain resource/loan constraints.

Reproduction script: `/tmp/villa-observer-review/engine-check.mjs`. It imports the actual modules through Vite SSR and constructs fresh state, rather than copying their validation logic. Before/after results were sent to the primary and runtime agents.

## Other reviewed behavior

- Logical room anchors may be shared by25 residents; no sprite floor capacity is imposed on a committed world. Visible occupancy remains an observer concern.
- Knowledge transfer requires an existing fact held by the actor; teaching does not expose private facts. Generic conversation does not automatically reveal a secret.
- Deliberate visits persist for subsequent watches, while urgent needs and obligations may interrupt them.
- Migrations retain backups and validated state before introducing agency/checkpoint tables. Recovery export is read-only and routed through authenticated administration.
- Connectivity and clock health are distinct; overdue watches and rollback errors are now represented in status.

This is a targeted independent review, not a proof that the full simulation is free of every possible defect. Source-derived foreground masking and the observer’s room imagery have separate audits.
