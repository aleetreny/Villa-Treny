# Groq strict transport for P6 — proposal

8 September 2026. **Design only: not implemented, tested against a provider, or enabled.** The user's objective already authorizes architecture and free-quota improvements; this note does not introduce another permission requirement. This proposal changes representation at the Groq boundary, not residents' capabilities, permissions, consent, or the meaning of saved protocols 1–6. It does not establish semantic reliability.

## Evidence and decision

The current [Groq adapter](../../workers/habitat-runtime/src/providers/groq.ts) deliberately sends `strict:false` for `society_turn`. The reported W73 response stopped normally but used a private reference in a public document branch; the local domain rejected it. That is evidence of a best-effort failure, **not a violation of constrained decoding**.

Groq documents strict mode for both OSS20B and OSS120B, with the same requirements: every object property is required, objects are closed, and absent optional values can be represented with null. It documents `anyOf`, `enum`, `$defs` and `$ref`. I found no explicit confirmation for `const`, root unions, or arbitrary conditional keywords. The documentation does not establish that 120B has a more capable grammar than 20B. [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs#schema-requirements)

**Prefer an explicitly persisted transport version over a new society protocol.** Keep the logical contract `society_turn` version 6 and its issued canonical schema. Opt newly created jobs into `groq_p6_strict_v1`; an absent transport marker means the historical adapter, including best-effort behavior. Existing queued, retrying, completed and recovered jobs must never acquire this marker from a global flag. Protocols 1–5 remain ineligible. A P7 would be justified only if we later change which choices or operations are possible.

This option needs a small job/attempt serialization extension and a Groq-specific pure compiler/decoder. It needs no world, SocietyState, document, offer or agreement migration. A deployment rollback must retain the decoder for already issued transport-v1 jobs, or defer them explicitly; it must not reinterpret them as legacy JSON.

## Representation and lossless conversion

Use a closed **root object** with one required property, `choice`. Its schema is a union of complete closed object branches derived from the exact issued P6 schema. This avoids depending on root-level `anyOf` or permissive intersections. Keep definitions at the document root and rewrite internal references consistently.

The payload illustrates the format only; IDs, available fields, required purposes and branches still come from each real prepared turn:

```json
{
  "choice": {
    "project": null,
    "reflection": null,
    "message": { "to": "B", "text": "I will consider your proposal.", "close": null },
    "deal": null,
    "record": null
  }
}
```

Every property present in a wire object schema must be required. Use these conversion rules, stored as a versioned plan rather than inferred from the response:

| Original P6 field | Strict representation | Conversion back to P6 |
| --- | --- | --- |
| An available, optional non-null operation such as `record` or `reflection` | Its exact schema or null; wire field required | Null removes only this designated optional property. Otherwise convert its object recursively. |
| An originally required operation, such as a required first purpose or active reply | Exact schema; no null alternative | Preserve it. Missing/null remains invalid. |
| A field unavailable in this issued job | Not offered, or forced to null only where needed to close an alternative branch | Never manufacture an available operation or recipient. The conversion plan records this branch-local absence. |
| `message.close` in an ordinary message | Boolean or null, required | True and false survive unchanged. Null becomes **omission**, never false. |
| `message.close` accompanying an explicit deal | `enum:[false]` or null, required | False stays false; null becomes omission. True remains forbidden. |
| Required nullable `record.parent` | Existing exact parent binding or null, required | Preserve null as a real value. Do not remove the parent property. |
| Required booleans, amounts, arrays and text | Existing schema, without new null alternative | Preserve false, zero, empty valid arrays and text exactly. |

Do not recursively delete every null. The compiler must prove that a field receiving the omission sentinel did not already accept explicit null. Reject any new optional-and-nullable shape as `unsupported_transport_shape` until a versioned presence wrapper is specified; current draft `parent` is required and does not have that ambiguity. Array positions never use an omission sentinel.

Replace each primitive `const:x` with an equivalent, typed singleton `enum:[x]`; do not stringify IDs, amounts or booleans. Share only identical schemas through `$defs`, with branch-sensitive conversion metadata when presence rules differ. Preserve reference IDs, content hashes, audiences and legal verb/location pairs exactly. Unsupported composition or an ambiguous reference must fail before reservation, not disappear from the schema.

## Preserve complete P6 branches

The compiler must handle the intersection of the original root rules and complete alternatives in [capabilities](../../src/lib/habitat/society/capabilities.ts) and [record-choice](../../src/lib/habitat/society/record-choice.ts). A blind recursive “make everything nullable and required” transformation is insufficient.

- The no-deal branch uses `deal:null` where that field exists in the union; its message may close or stay open. The deal branch requires both the exact deal and its exact eligible recipient message. No `accept`/`reject` operation is added without a currently offered ID.
- Null operations must not defeat the original nonempty-response rule. Where no original field is required, generate complete `anyOf` alternatives with one original property required non-null as a witness. These alternatives may overlap; they must retain every allowed combination. They replace the original `minProperties` condition on the decoded object, not weaken it.
- `record` remains a single explicit operation. A valid record-only response can decode to `{record:...}` without a fabricated reflection or message, **where the issued P6 requirements permit it**. A common response plus a record decodes to both and uses the existing atomic P6 application path. Appraisal alone does not become a new successful no-op; the current decoder remains authoritative.
- Document branches stay correlated: public audience receives only public reference enums; an actor-only branch may receive its offered private references; private drafting cannot schedule publication. Never merge these branches by independently unioning their field enums. An exact draft ID/hash pairing is not a Cartesian product of IDs and hashes.
- Consent remains an explicit deal or record acceptance with an offered ID. A message, null field, omitted close, counterproposal or matching terms never substitutes for acceptance. A commission still binds the exact revision, author, payer, audience, amount and deadline, and payment still requires the physical publication evidence.

All existing bounds must remain in the issued wire schema or have an explicitly documented, equivalent supported encoding. Groq's page is not an exhaustive keyword compatibility specification. Inventory numeric ranges, decimal precision keywords, string/array bounds and references before claiming portability; if an equivalent encoding cannot be established, do not enable this transport. UTF-8 combined document size, current funds, ownership, stale revisions and other domain checks remain local even with a valid grammar.

## Persist what was actually sent and received

At job issuance, persist an immutable per-provider transport plan: logical protocol/version and canonical schema/hash; transport/compiler/normalizer versions; generated wire schema **JSON and hash**; conversion plan/hash; and the exact format-only instruction suffix. The original logical SYSTEM/USER remain unchanged. The adapter appends the saved suffix explaining the wrapper and null/omission rules; this intervention must be recorded, not confused with an identical prompt.

Before each dispatch, freeze the full actual request JSON excluding Authorization, including provider/model, both actual messages, wire `response_format` with `strict:true`, output maximum, reasoning/sampling settings, attempt ID and hashes. A correction attempt has its own request receipt and keeps the already issued transport version. Reserve quota against **this wire request**, including its larger schema and instructions. Never reserve using the smaller canonical P6 schema while sending the transformed schema.

After a response, persist the original bounded response envelope and selected content string **before parsing, normalizing, applying effects or dispatching a fallback**. Save raw wire JSON and normalized P6 JSON separately, with their hashes and lineage. This is required for successful strict attempts too: today's optional rejected-candidate diagnostics alone are insufficient. If durable response storage fails, retain the spent/unknown attempt and do not apply or resend it. Accounting still settles reported usage once; lack of diagnostics must not release a reservation or authorize another request.

Use existing private recovery protections and explicit size/retention limits. Do not expose raw requests, schemas, candidates, normalization plans or low-entropy private hashes through the public observer. A version/source hash alone cannot reconstruct code; replay needs retained matching source or an archived decoder artifact. Full domain replay additionally requires the exact private prepared state/control revisions. If any bytes or state have expired, report the narrower replay scope; do not reconstruct them from the current world. See [diagnostic retention and its present limitations](rejected-response-diagnostics-2026-09-08.md).

## Validation and diagnostics

Order: bounded envelope capture → finish-status check → content JSON parsing → validation against the **saved sent wire schema** → plan-directed conversion → validation against the saved canonical P6 schema and decoder → current-state revalidation → existing atomic application. Reject truncated output even if it parses. Conversion performs no JSON repair, key stripping beyond designated null sentinels, text trimming, amount rounding, reference replacement or inferred action. Existing canonical normalizations still occur in their existing layer.

Add private allowlisted failure phases `issued_wire_schema`, `wire_conversion`, `canonical_schema`, `domain_validation` and `final_revalidation`, with at most eight sanitized paths and an omitted count. Keep actual schema, logical schema, schema used for current revalidation, transport version, finish reason, raw/normalized hashes and state revision references distinct. Unknown property names become `*` in metadata; private values and provider error text remain private captures. A schema-valid response can still be domain-invalid or semantically unfounded. Diagnosis does not add retries or alter fallback policy.

## Offline acceptance gates and later decision

Define `E` as encoding valid P6 JSON and `D` as strict wire conversion. For each frozen state/turn fixture, require `D(E(x)) = x` as JSON values, including field presence and explicit nulls. For every generated valid wire fixture, its decoded candidate must retain the original schema and decoder decision; application to identical clones must produce identical effects or identical refusal. Do not claim that passing a finite suite proves all possible schemas.

| Required fixtures | Expected result |
| --- | --- |
| Common-only, record-only, combined common/record, record plus appraisal; first purpose, active reply and private review | Same original acceptance/refusal and unchanged required-field policy. |
| Ordinary message close true/false/omitted; deal with false/omitted; deal with true or missing message | Preserve all valid meanings; reject the two deal conflicts without filling close. |
| Explicit null parent, absent optional operation, false publish, zero-cost work, empty social plan | Preserve distinct values. Zero work is not payment; empty steps do not complete a goal. |
| All-null response, null required purpose/recipient, missing wire key, root array, unknown/nested extra key | Reject; no canonical effects. |
| Public draft with a private reference; private draft with publish true; wrong draft/hash pair; unauthorized share/commission | Reject before effects. Original private data must not leak into the public projection. |
| Wrong offer ID, self-authored acceptance, expired offer, changed funds, stale cursor, recipient/speaker change | Existing authority checks refuse identically, even if issued wire grammar accepted the shape. |
| Invalid ranges, excessive UTF-8 bytes, hidden/unknown references, illegal facilities, mixed operations | Preserve the original restrictions and atomic rollback. |
| Duplicate response, recovery, rollback, old protocols 1–6 without opt-in, interrupted persistence | No reinterpretation, duplicate action, payment, quota release or automatic resend. |

Also compile every generated schema with the installed local validator and an independent standards validator; passing either does not prove Groq's decoder supports it. Measure actual input reservation and output overhead for all 25 initial jobs, the 12 recorded P6 contexts, reply/commission cases and maximum readable documents. No unsupported schema simplification or truncation may be used to make an 8,000-TPM request fit. Report admission separately from model quality.

After these gates, a bounded Groq compatibility check within the authorized free budget can test the exact adapter. Both OSS models appear in Groq's [Free Plan table](https://console.groq.com/docs/rate-limits), and its structured-output guide states no paid-plan requirement. Architecture and free-quota work are already authorized; paid upgrades or billing activation are outside that scope. This documentation task performs no implementation, inference or rollout. A later successful compatibility sample would establish acceptance of that schema, not reliable negotiation or truthful narratives.
