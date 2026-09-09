# Progress instruction comparison: domain and grammar review

This is a negative, bounded local result. Four real open conversations from recovery revision 199 produced eight completed responses: six applied and two rejected atomically. No conversation closed, no document was created, no offer was accepted and no money moved. This comparison contains no physical watch or continuation. It does not establish a general model ranking or solve repetitive dialogue.

The exact original outputs and private contexts remain in the private recovery evidence. Public observations below use the [original public report](public-report.json), [allowlisted domain metadata](offline-analysis-public.json) and [native grammar checks](native-grammar-public.json). The original ledger SHA256 is `b3ed1456f4679076e11bebd78cef54a19d4abadd7aa8dbd979ab6e7f8352dde4`; the 85-source manifest hash is `24d936798e18de60a024ceeaf84ff7c68d3fd9f30a4b09f02357f4536f440ed6`. Replaying each original response against its own frozen pre-state reproduced every stored after-state hash. No output was repaired or replaced.

## CN: a specific schema/domain size gap

Both Noor responses selected a private, unpublished draft. Each title is 25 ASCII bytes and each body is exactly 600 ASCII bytes: 625 combined. The issued JSON Schema independently permits a title up to 96 characters and a body up to 600 characters. Both outputs satisfy those independent limits, including native grammar membership. The domain additionally limits **title plus body to 600 UTF-8 bytes**, so both fail with `record_content_too_large`.

This is not a UTF-8 expansion or output truncation problem in these two samples. The combined ceiling was stated in the schema description but was not enforced by its independent string constraints. Both failures leave the draft count at the original four and prevent the accompanying message and any other effect from being committed. The private draft text and title are deliberately absent from this public review.

## Projects and records

Every response omitted the `project` operation. The table counts the acting resident's existing pending steps; retained means the same step IDs remain pending after application. It exposes no goal, explanation or private action content.

| Pair / actor | A: pending before → after / retained | B: pending before → after / retained | Project changed in either variant |
| --- | --- | --- | --- |
| BK / B | 1 → 1 / 1 | 1 → 1 / 1 | No |
| CN / N | 5 → 5 / 5 | 5 → 5 / 5 | No; both responses rejected |
| IO / I | 0 → 0 / 0 | 0 → 0 / 0 | No |
| GQ / G | 1 → 1 / 1 | 1 → 1 / 1 | No |

Each independent clone starts and ends with four drafts, zero shares and zero publication intents. Neither variant advances or replaces GQ's pending step. That preservation occurs in the control too, so this sample does not attribute it to the added instruction. IO's speech about beginning work does not create a plan step or execute work.

## Six explicit proposals, not six agreements

The six applied raw responses contain explicit `deal` fields. Their public effects are:

| Pair | A proposal | B proposal | Observed consequence |
| --- | --- | --- | --- |
| BK | B offers K 1.5 cells | Same | Open gift proposal; no transfer |
| IO | I proposes one grow action in Garden, O pays 0 cells, due watch 433 | Same work and price, due watch 432 | Open work proposal; no acceptance or work |
| GQ | G asks Q for 2 cells | Same | Open transfer proposal; no transfer |

These are three matched comparisons, each applied to its own clone. Reused offer IDs across branches are not six offers added to one world. Zero-priced work is not economic payment. Proposal authorship and mechanical validity do not establish that the prose explains the proposal well or that the proposal helps the stated purpose.

The schema does **not** require these proposals. Each issued schema requires only `message` at its root and permits a complete branch without `deal`. For all eight schemas, separate diagnostic objects made by removing `deal` pass Zod; those same objects with `message.close:true` also pass. Native XGrammar 0.2.3, using the exact served schemas and literal UTF-8 JSON strings, accepts all 24 checks: eight original values, eight values without a deal and eight values without a deal with closure. These altered values are grammar tests only. They were not generated responses, were never applied, and are not substituted into any ledger.

This rules out a mandatory deal in the tested contract and compiler language. It does not rule out a sampling bias caused by branch order, token probabilities or instruction wording. All eight generated messages omit `close`. The six generated deals require an open message, so their zero closures cannot independently prove that the model ignored closure guidance when free of that choice. CN's omission also produces no committed message because its draft is rejected.

## Cost and limits

Actual local usage totals 24,469 tokens: A 11,847 and B 12,622. B adds 177 reported prompt tokens per case, plus 67 completion tokens across the four cases. Those local usage figures do not include the complete schema in the same way as provider reservation accounting. The first A response includes model loading, so its latency cannot support an A/B speed claim.

All eight inputs use the same prepared USER, schema, seed, model and 1024-token output maximum within each pair. Only SYSTEM differs. The new harness's 32,000-byte ceiling measures the entire serialized request. The old 24,576-byte messages-plus-schema receiver remains unchanged; BK's control already exceeds that old ceiling at 24,613 bytes. The [public plan](public-plan.json) preserves both measurements.

The useful conclusions are narrow: the combined document-size constraint needs an enforceable transport strategy; proposal generation is optional but still occurred in six outputs; existing projects were preserved equally; and these eight responses demonstrate no reduction of looping or successful document delivery. Semantic concerns in the public speech remain separate from these mechanical findings; see the independent [semantic audit](../p6-progress-comparison-semantic-proof-2026-09-08.json).
