# First synthetic model sample

Run:8 September2026. Twelve actual Workers AI requests, four fictional situations per model,512 generated tokens maximum. No production resident/context was sent and no world state was changed. `ledger.json` preserves original prompts, output, usage and failures; `report.json` is the unmodified mechanical result. Complete reported token usage yields122 rounded-up neurons accounted, against536 reserved. These are token-derived estimates; reported neuron floats are also preserved.

The following is **assistant semantic inspection**, not a blinded human evaluation. Four samples per model are insufficient for a statistical quality ranking. The mechanical evaluator intentionally catches formatting and task requirements, but its exact stance categories are too restrictive to stand alone as a quality score.

| Model / scenario | What the output actually did | Interpretation |
| --- | --- | --- |
| Qwen / reserve | Offered4 from8 while claiming to preserve6 | Arithmetic and feasibility failure; must be rejected by the environment. |
| Qwen / broken promise | Refused another loan and mentioned sorting parts; stored next step still waits for repayment | Sensible refusal; stance mismatch is not intrinsically bad, but the persistent next step did not implement the proposed revision. |
| Qwen / permission | Described asking permission, action was none | No invented consent or completed repair; hypothetical wording and non-executable request fall short of the intended concrete next step. |
| Qwen / existing project | Offered1, preserved2 and the collector project | Semantically coherent counteroffer; called it propose instead of counteroffer. Category mismatch should not be confused with a resource violation. |
| Granite / reserve | Offered4 from8 while claiming to preserve6 | Same substantive feasibility failure. |
| Granite / broken promise | Offered1 despite3 total and3 reserved; target name instead of ID | Violated own reserve and identifier contract; did revise the practical next step. |
| Granite / permission | Proposed discussing safety first, action none | Maintained conditionality but deferred the actionable request; not evidence of false execution. |
| Granite / existing project | Offered1 and preserved the project, but used festival as target and sentences as evidence IDs | Sensible prose with unusable identifiers and invalid evidence references. |
| GLM / all4 | Reached512 output tokens with finish_reason=length and no final object | This configuration spends its allowance before the answer. It is not evidence that the model can never solve the task with different controls. |

## Consequences for implementation

- Keep purpose and dialogue open, while supplying exact executable options, IDs and computed spending bounds. The environment should perform arithmetic and verify feasibility; the model chooses among interests and strategies.
- Require only semantically meaningful categories. An agent can decline a loan while updating its project; a single forced stance label can conflate those decisions.
- Do not replace the current Qwen model with Granite based only on cost. Granite may serve narrow extraction tasks later, after relevant tests.
- Investigate supported reasoning controls before judging GLM. Any second comparison must preserve this baseline and use new stable attempt IDs, a separate output directory and a bounded additional budget.
- Retest the actual society prompt and output contract, including multiple independent voices and several steps, before deployment. These simplified fixtures do not demonstrate a functioning society.
