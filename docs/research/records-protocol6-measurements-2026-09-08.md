# Records protocol 6: offline boundary and capacity checkpoint

8 September 2026. P6 is an explicit option; **autonomous generation remains P4**. This checkpoint made no model request, started no model server, and changed no production world or provider limit. The [measurement artifact](records-protocol6-measurements-2026-09-08.json) contains all 25 initial cases, four document scenarios, exact job hashes, the reproducible fixture scripts and a 58-file source manifest verified unchanged across measurement.

## Format and authority

P6 extends the tested P4 object with one optional `record` operation. It does not use P5's tuple. The [first remote P5 job](ordered-choice-provider-status-2026-09-08.md) eventually succeeded after two rejections and additional validation feedback; that sequence does not establish a tuple incompatibility or stable remote behavior. This format choice limits the additional change while the records capability is evaluated separately. Protocols 1–5 and their saved dispatcher paths remain intact.

The new adapter permits an existing resident's record-only operation without inventing a reflection. Initial project and actual reply requirements still apply. It validates both parts and commits them atomically: a failed record operation discards the ordinary message/project changes too. A records cursor ahead of the mind's applied sequence cannot consume a new cognition as a false success. A coherent duplicate remains an idempotent replay.

Only exact, accessible revisions enter the context. Authoring, sharing, revising, commissioning and acceptance use structured operations, IDs and hashes; prose implies none of them. Explicit recipients receive an observation that makes them eligible for the existing scheduler and invalidates stale preparations. The notification does not claim they read, endorsed or published the text. Public sharing does not broadcast 25 cognition requests.

## Measured maximum reservations

Groq columns include ordinary token counts for SYSTEM, USER and the full JSON Schema, a provisional 128-token framing margin, and the unchanged 1,024-token output maximum. These are admission reservations, not measured server use. Cloudflare maxima retain the conservative UTF-8 payload calculation; no neurons were consumed by this measurement. See the [tokenizer method and limits](groq-full-tokenizer-2026-09-08.md).

| Synthetic context | P4 Groq maximum | P6 Groq maximum | P6 Cloudflare neuron maximum | P6 USER bytes |
| --- | ---: | ---: | ---: | ---: |
| Initial 25, maximum | 5,121 | 5,632 | 657 | varies |
| B reads an exact shared draft | 5,088 | 5,993 | 703 | 2,813 |
| A receives a publication commission | 5,276 | 6,518 | 766 | 3,735 |
| A reviews an accepted commission | 3,771 | 5,114 | 606 | 4,135 |
| A has three full 600-byte revisions and two incoming commissions | 5,259 | 7,223 | 850 | 6,320 |

Two document cases exceed the current 6,000-token Groq admission limit. They remain subject to Cloudflare's quota and the existing independent candidate search; this checkpoint does not raise limits, promise a daily number of thoughts, or establish a provider's willingness to generate a useful response. The 5,993-token case has very little headroom for a larger context or retry feedback.

Repeated source grants were compacted into public/private ID lists. Byte-identical schema subtrees share definitions. No document text, obligation, legal operation, evidence ID or numerical bound was removed to obtain these figures. A test expands the references and verifies that every ordinary P4 field and branch remains identical. The large case retains all three title/body payloads at exactly 600 UTF-8 bytes each.

## Deterministic verification

- 29 adapter/canonical-core tests passed, including 9 adapter tests; 15 targeted Worker protocol/schema tests passed. Worker TypeScript and ESLint of the changed files passed. These are directed checks, not additional counts to add to the root release suite.
- The synthetic sequence covers a draft, an independent request for changes, an immutable revision, a commission, exact-ID acceptance and an intent bound to the revised bytes. At this adapter checkpoint no physical watch runs, no document publishes and no payment occurs. The physical-slot and payment integration has separate tests.
- Native XGrammar 0.2.3 accepted 4 valid outputs and rejected 19 invalid outputs across initial authoring, a private share, reader commissioning and author acceptance. Checks included fabricated fields, root arrays, IDs and hashes. The unchanged native FFI was used because the embedded Python package's optional Torch helpers were unavailable; no dependency was installed. This demonstrates local grammar membership, not hosted-provider compatibility or narrative quality.

Artifact SHA256: `56b92c4087b382c9387175f834507afe14c98193427002f7b692e93a1ce10393`. Source manifest SHA256: `8325c8ffd94b558e946de15cbfd81d67926f75893ebb0a316123f2d764ff1805`. Previous measurement artifacts are unchanged. Model evaluation and activation require a separate coordinated decision; passing these tests alone does not justify changing the autonomous default.
