# Ordered choice: experimental provider status

Recorded on 8 September 2026; updated after the production return to P4. **The first remote P5 job eventually applied successfully through Cloudflare on its third attempt.** Protocol 5 remains an explicit experimental option while reliability is assessed. The autonomous producer now defaults to protocol 4 in published version `5ca55e3b-4375-43bd-a22e-46a390ba3c1d`; the [production-return continuity proof](release-2026-09-08/p4-production-return-continuity.json) records the verified deployment transition.

The [six local comparisons](model-society-ordered-choice-local-2026-09-08/review.md) demonstrated valid grammar and equivalent core effects. Three P5 outputs accepted exact incoming offer IDs in separate fictional branches. All three agreements had zero price and no executed work or payments. This limited result does not establish remote-provider compatibility or general narrative reliability. The historical ledger, source bundle and [component measurements](ordered-choice-measurements-2026-09-08.json) are preserved unchanged.

## First remote P5 job

The first observed autonomous P5 job, resident F / sequence 58, was rejected twice before a Cloudflare retry succeeded. The initial two-rejection cutoff is superseded by this complete three-attempt sequence:

| Attempt timestamp (UTC) | Provider | Recorded outcome | Latency | Proven boundary |
| --- | --- | --- | ---: | --- |
| 16:48:35.693 | Cloudflare GPT OSS 120B | `invalid_structured_output` | 5,288ms | The selected response failed the generic structured-payload parser, before P5 schema or domain validation. |
| 16:58:23.153 | Groq | `invalid_cognition_payload`; runtime detail `invalid_society:invalid_ordered_choice` | 1,712ms | A generic JSON object reached validation but did not satisfy the ordered-choice contract. |
| 17:01:24.060 | Cloudflare GPT OSS 120B | Success; saved P5 job `applied` | 2,617ms | The saved object has `turn`, passed the P5 contract and applied to the current society. |

The third attempt was **not an identical-input repetition**. After the Groq domain rejection, the existing retry path appended this feedback to USER: “Previous attempt was refused: invalid_ordered_choice. Correct that issue using only the supplied state and exact IDs.” This is automatic validation feedback, not a supplied answer. Consequently, the later success cannot be attributed solely to sampling variation, to the response format, or to that feedback: this single sequence does not isolate those causes.

Confirmed usage was Cloudflare **2,285 input / 129 output tokens, 82 neurons** on the first attempt; Groq **4,308 input / 763 output tokens** on the second; and Cloudflare **2,307 input / 144 output tokens, 84 neurons** on the successful third attempt. These are recorded actual usage values, distinct from the larger maximum reservations.

These are production attempt metadata, not published resident text. The failed raw Cloudflare response was not retained, so its content, envelope and exact parsing failure cannot be reconstructed from the recorded error. The earlier two failures do **not** prove that `prefixItems` or tuples are unsupported; the subsequent accepted response demonstrates that this remote Cloudflare path can produce and apply P5. P5 still has an object root, `{ "turn": [...] }`; the generic parser accepts nested arrays. No permissive parsing, prose extraction or invented acceptance has been added. One success after two rejections does not establish reliable provider behavior, and the precise causes of the rejected payloads remain unresolved.

[Cloudflare JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) does not guarantee schema adherence and does not document a tuple-keyword compatibility matrix for this backend. [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs) distinguishes strict and best-effort modes; the current request uses best-effort mode to retain optional fields. Local XGrammar validation proves compatibility with that local compiler, not with either remote implementation. The new production evidence establishes one successful Cloudflare P5 application; no successful Groq P5 application was observed in this sequence.

## Evidence for the update

The existing public status capture `/tmp/villa-p4-return-status.json`, observed at 17:07 UTC, reports world revision **149**, cognition health `healthy`, no pending residents and an empty active queue. It records the successful Cloudflare attempt at `1788886884060`. Its SHA256 is `3037952d4868f71f069fe93779b365852ed75bbd2c32aa7a0de927ee22e12d30`.

An offline read of the full paginated recovery bundle `20260908T170641036Z-pre-p4-production-return/recovery.json`, held in the private extraction-backup directory, confirms job `habitat-canonical:mind:F:7:58:g:3` has protocol **5**, status `applied`, **3** attempts and a saved output with root key `turn`. The bundle SHA256 is `7b418f1cb0d6e4d03657d0e37b54030c1154efebcd564a3ed9aa848892eef95c`. This note publishes no private prompt or response prose. The same capture retains control revision 3 and the next physical watch at `1788894484141` (19:08:04.141 UTC).

The [public application receipt](release-2026-09-08/first-protocol5-live-receipt.json) records the structured choice `no_deal` and public `turn:289`. Application created no offer or agreement, changed no balance, and advanced no physical watch. It demonstrates a valid P5 conversational application, not economic acceptance, payment or completed work.

## Containment and compatibility

Only newly prepared jobs use the restored default 4. Explicit `protocolVersion: 5` still prepares P5 for controlled evaluation. Saved jobs retain their original protocol; dispatch and replay support versions 1–5. Pending jobs are not rewritten. The physical state, clock, history, provider limits, reservations and fail-closed validation are unchanged by this source correction.

Validation of the correction passed: **32 directed Worker tests in four files**, Worker TypeScript checking and ESLint of the changed source/tests. Coverage includes default 4 versus explicit 5, stored P5 completion after the default change, stale P5 rejection and candidate selection. These are the directed checks for this correction, not a combined release-test count. The production return is now published with the continuity proof linked above. No model request was made for this correction or its tests.
