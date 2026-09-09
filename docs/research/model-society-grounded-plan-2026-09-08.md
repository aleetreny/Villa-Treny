# Grounded-turn intervention: execution gate

8 September 2026. **Prepared, not executed.** This is a joint intervention, not a factorial experiment or a model ranking. It changes the task instruction, message placement, mandatory initial purpose, provider strict mode and GLM's thinking/output settings together. The [preceding comparison review](model-society-alternatives-2026-09-08/review.md) remains the historical baseline.

The [new harness](../../scripts/benchmark-society-grounded-turns.mjs) reconstructs the exact V4 prefixes for G's response to D and B's first opening. Their context JSON is byte-identical to the corresponding original JSON substring. It does not add facts, rewrite messages, change balances, regenerate a room or alter production. Each candidate applies to its own clone using the original prepared turn, after checking the experimental schema. The [payload plan](model-society-prompt-plan-2026-09-08.json) records exact requests, source-job hashes and reservations.

## Changed instruction and grammar

The [candidate SYSTEM](society-prompt-candidate-2026-09-08.txt) is a separate system message. The user message contains only the original context JSON. It tells the actor to choose a purpose rather than continue a story, treat claims as claims, and treat absent details as unknown. Voice controls delivery, not lines to copy or biography to announce. A reply must address the actual other person and advance the topic. It forbids invented completed actions, observations, objects, faults, locations, promises and consent. Physical steps must serve the purpose; unrelated inspection is not a substitute for a plan.

When `ownProject` is null, the cloned schema requires `project`; it still allows `steps: []` for a social purpose. Other schema fields and bounds remain unchanged. Local experimental validation rejects a missing initial project and any schema violation before applying the candidate. It never fills in a purpose on the model's behalf. This is not yet a production-core requirement.

Both candidate payloads now set `strict: true` in the documented `json_schema: { name, schema, strict }` wrapper. Optional JSON properties do **not** by themselves establish that Cloudflare cannot handle strict mode. The model API schemas expose this parameter; the actual nested optional schema still needs a real request to establish compatibility. Do not import Groq-specific restrictions as a Cloudflare fact. Sources: [GLM API](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/), [Gemma API](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/).

Start with one Gemma/G call to test this exact wrapper and its grounding on the previous invented-sensor case. Inspect the original response before any continuation. If strict mode fails, preserve the failure; do not automatically change it to false or spend another ID as a hidden retry. If a later best-effort branch is deliberately evaluated, essential deadline ranges should be present in its context, not assumed to have been enforced merely because they appeared in a schema. This first intervention keeps the context unchanged.

## Budget and order

| Order | Model/case | Thinking | Output cap | Complete prompt/schema bytes | Maximum reservation |
| --- | --- | --- | --- | --- | --- |
| 1 | Gemma / G | Disabled | 768 | 8,604 | 118 neurons |
| 2 | GLM / G | Enabled | 1,536 | 8,604 | 115 neurons |
| 3 | Gemma / B | Disabled | 768 | 6,649 | 101 neurons |
| 4 | GLM / B | Enabled | 1,536 | 6,649 | 104 neurons |

The candidate SYSTEM is 2,194 UTF-8 bytes. Each input reservation includes the complete messages/schema bytes plus 2,048 template units. Output, including reasoning, is capped and charged per model. Thinking is controlled with `chat_template_kwargs.enable_thinking`; there is no assumed separate free reasoning allowance. The [official Workers example](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/) shows Gemma's disabled mode, and both API schema trees describe the toggle. Published [neuron rates](https://developers.cloudflare.com/workers-ai/platform/pricing/) remain unchanged.

The local cap is **300 neurons**, with at most four unique request IDs and one new call per invocation by default. The unsettled worst-case sum is **438**, so four calls are conditional on complete reported usage releasing reservation. The script stops before the next request would exceed 300. Two unknown first outcomes retain 233 and prevent the next 101-neuron reservation. Tests cover this exact gate. Failed or unknown IDs are never repeated.

The operator reported 926 external experiment neurons already accounted and reserved up to 750 for a later V5. Spending this full 300 would leave 24 of the 2,000 external experiment allocation. These are local accounting limits, not new provider allowance; production has its separate reserve in the same account. Do not enlarge this gate to obtain four results.

**Deployment tradeoff:** the stronger instruction currently breaks the conservative Groq initial-fit target. Offline measurement gives 6,886–7,477 reserved tokens across the 25 initial GENESIS jobs; all exceed 6,000. This is an isolated Workers AI candidate, not a drop-in production prompt with proven Groq fallback. If it improves grounding, further integration must either preserve a validated compact representation or honestly defer oversized fallback jobs under the existing quota. No quota estimate is silently weakened to make the test pass.

## Decision criteria and limitations

Record provider acceptance, local schema/domain acceptance, missing initial purpose, invented observation and text/action mismatch separately. A useful result should address the real recipient, pursue the actor's own purpose and keep future proposals distinct from things already done. G can ask for details or plan an inspection; it must not invent a sensor reading. B should seek a meaningful part in a decision, without claiming an existing layout or incoming request. An offer is optional; grounded questions and refusals can be valid progress.

Inspect goal/steps alignment, distinct work parties, deadlines, exact money, citations and the actual resulting state. Current audited world-affordance gaps are not fixed by this experiment: missing own-location context, the restricted `note` action, and work deadlines that can be infeasible for the promised amount of work. Distinguish these interface defects from model prose failures. No candidate is allowed to fabricate context to hide them.

The comparison can assess the usefulness, latency and cost of these two configured pipelines on two selected cases. It cannot isolate thinking's causal contribution or prove a statistical winner. A reduction in false scene facts is required before a broader V5 claim; accepting four JSON objects is insufficient. There is no physical watch, production alarm or sustained-life evaluation here.

Offline checkpoints: the Node self-test passes with all network requests forbidden; it covers exact prefix/context replay, new schema requirements, per-model caps, staged/crash replay, raw-output preservation, unknown reservations and credential gates. Targeted ESLint passes. Existing V4 sources and the preceding comparison are unchanged. Live results and semantic review: **pending**.
