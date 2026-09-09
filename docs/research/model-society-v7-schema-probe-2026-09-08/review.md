# Conditional deal grammar: compatibility checkpoint

The single authorized GPT-OSS120B request returned HTTP200 with the proposed complete-branch schema. It consumed **82 neurons** after rounding up reported usage (81.68153381347656): 1,470 input and512 output tokens. The response exhausted its experimental512-token output limit and was **not applied**. This confirms that the provider accepted this request format; it does not establish complete generation, enforcement for every possible instance, successful negotiation or useful planning.

The [ledger](ledger.json) retains the exact request, original response, usage and local rejection. Its SHA256 is `3b0bbd1f9f74b370ee29daf26ded750e4c1b7047dd7b65242cece7d5d9aa826b`. There was one attempt, no retry, no physical watch and no production-state mutation. External research accounting became **1,852 /2,000 neurons**, leaving148. The initial221-neuron reservation was persisted before dispatch and settled only after complete usage arrived. OAuth expiry was checked before reservation; no credentials are stored in the evidence.

## Intervention and its limits

The experiment reconstructed exact V7 L initial-turn index11 using the frozen source bundle and replayed before-state. SYSTEM, USER, recipient directory, seed and temperature were unchanged. The two changes were the conditional JSON schema and a generation cap of512 instead of the production1,024. Low reasoning and the strict provider wrapper remained in place. This was a format probe, not a controlled quality comparison with the earlier1,024-token response. No deal or second voice was forced, and no field was filled automatically.

The [harness](../../../scripts/benchmark-society-v7-schema-probe.mjs) uses a single stable attempt ID, no retry of completed or ambiguous requests, cached official tiktoken counts and a2,048-token template margin. For this request, authored components were724 SYSTEM +679 USER +2,384 schema tokens; input reservation5,835, output reservation512, neuron reservation221. Provider-reported input is not the same measurement as complete authored-component counting.

## Why the shorter condition was discarded

Zod4.4.3 compiles root `anyOf`/`allOf` alongside `type:object`, but a permissive partial alternative can lose unknown-key failures during intersection. The first66-token candidate correctly rejected a missing or true `message.close`; it nevertheless accepted certain top-level extras, nested message extras and a raw `offer` field when `close:false` was present. It was rejected before any provider request.

The final grammar uses two **complete, closed object alternatives**:

- No deal: every original field is available except `deal`; ordinary messages keep their original optional boolean `close`.
- Deal: every original field remains available; `deal` and `message` are required, and the complete message schema requires `close:false`.

Large field schemas are shared through `$defs`. Arbitrary references such as `#/properties/project` failed in the installed compiler, so they were not used. The direct `.properties.message.properties.to.enum` interface remains unchanged for the scheduler's recipient directory. Project, reflection, deal and appraisal bodies use equivalent shared references.

For JSON instances, these alternatives express the existing grammar intersected with **no deal OR explicit open message**. The authoritative decoder already required that condition. No valid meaning, raw response normalization, canonical offer terms, version1/2 interpretation or application effect is changed. Semantically unrelated work still passes if its syntax and physical capability are valid; a test explicitly preserves that limitation instead of claiming grammar can assess purpose.

## Offline evidence and integration

Before the request, 881 mutations of all37 actual V7 responses and a further2,304 cases around a real incoming offer had no mismatch with that condition. They included acceptance/rejection, omitted/true/false/null close, unknown fields, numeric bounds, references, appraisal and capability/facility constraints. All eight original V7 deal-without-open-message failures were blocked. The later runnable tests retain these regressions, consent and idempotency checks, and durable-reservation/expiry/no-network checks.

The implementation in [capabilities.ts](../../../src/lib/habitat/society/capabilities.ts) generates **exactly the schema sent for this frozen L case**, SHA256 `5e1106aa4ecf5679ad494e339e56299c0270d6cf26461d85c6806b0109b04507`. The version1/2 producer, parsers and effects were left intact. Fifty-six targeted society tests, runtime TypeScript and ESLint passed; this subtask did not deploy the change.

The final condition adds324–328 tokens /1,207–1,227 bytes to22 saved V7 schemas that permit deals; the other15 are unchanged. Recounting the same37 jobs yields Groq reservations of **3,266–5,268 tokens**, all below the6,000 request guard, totaling162,706 before settlement refunds. Current Workers AI byte-based reservations become371–621 neurons per request at the unchanged1,024-token production output maximum. These replace the earlier pre-condition capacity figures for this exact corpus; future longer conversations can still exceed those ranges.
