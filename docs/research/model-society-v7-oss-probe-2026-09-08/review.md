# GPT-OSS120B on two exact V7 cases

Both responses are more useful than their matched local V7 outputs: B answers the actual request without the unrelated growing contract, and L turns an actual request for repair help into a pending repair step. This is a narrow positive result. It does **not** demonstrate reliable planning, negotiated agreements, completed work or a statistically superior model.

The [report](report.json) includes the two matched baselines and new responses; the [ledger](ledger.json) preserves full requests and original provider output. Neither file was edited for this review. Ledger SHA256: `aeb431d0fa99270213921a703c603e5dc217b99bcb62ebfe0772401e13711c6f`.

The cases are B's first reply, sequence25, and L's first individual turn, index11. Each uses its exact saved V7 before-state, SYSTEM, USER, JSON schema, seed and temperature. Only the model/provider wrapper changes to GPT-OSS120B with low reasoning and a1,024-token output limit. The cases are applied separately to cloned states; they are not a continuation of one another. The harness does not add `close:false`, remove a deal or repair an output.

## B — answering Cato's request

In the local baseline, B's useful clarifying question was bundled with hiring Cato to grow in the garden for zero cells. The full response was rejected because the deal omitted the required open-message field. That agricultural work also had no causal connection to drafting waking criteria.

The new response omits the deal and offers a short outline for Cato to review. Its reflection cites the real incoming `turn:12` and correctly recognizes that being asked for a draft connects to B's wish to be consulted. This advances the actual conversation. The outlined criteria are newly proposed content within the fiction, not measured patient facts, established habitat rules or a medically validated protocol. Cato has not reviewed or adopted them, and no document artifact is created.

Two material weaknesses remain:

- B replaces the social project with the same broad goal and old rationale, but adds a **drink action in the hold**. Drinking does not draft, revise or agree the criteria. If that sole listed step later completes, it would still not establish the project's goal. The response therefore removes an unrelated economic contract while retaining unrelated physical padding.
- The emitted message is exactly300 characters and ends with an unfinished question, “Does that cover”. The provider reports `finish_reason: stop` and470 completion tokens, so this is not exhaustion of the1,024-token generation budget. The response reaches the message field's character bound without ending the sentence cleanly.

The motor accepts the response, persists the pending drink step and B's reflection, and makes Cato the next speaker. No physical action, resource transfer or appraisal occurs in this probe.

## L — repair assistance with a personal motive

The local baseline offers Juno repair help but appends an unpaid work deal without the required open-message field; the whole response is rejected.

The new response answers Juno directly, says Lior will help, and ties the choice to wanting a future favor. It creates one pending `repair` step at Workshops. This action is a meaningful mechanical match to the request: it can increase maintenance while consuming actual resources when the physical engine executes and revalidates it.

Lior's statement that he will count on a favor is a unilateral social expectation. It does **not** create a debt, record Juno's acceptance, establish payment terms or transfer cells. This restraint is appropriate. A future favor would require another person's response before it could become a bilateral commitment.

The motor accepts the response and makes Juno the next speaker. The clock and every balance remain unchanged. The repair remains pending: this probe demonstrates a relevant plan, not a completed repair. Nothing here demonstrates that Juno supplies the repair costs or has agreed to repay Lior.

## Outcome and limits

| Measure | B | L |
| --- | --- | --- |
| Domain result | Applied | Applied |
| Input/output tokens | 1,588 /470 | 1,470 /441 |
| Rounded accounting | 83 neurons | 77 neurons |
| Full reservation before request | 251 neurons | 246 neurons |
| Observed latency | 11.786s | 10.554s |
| New economic agreement | None | None |
| Physical action executed | None | None |

Total accounting is **160 neurons** under the390-neuron probe cap. Complete usage from B released enough reservation capacity for L. Both independently pass the saved dynamic schema and authoritative capability validator, and the duplicate-application check passes. No relationship or balance changes occur.

These cases support considering GPT-OSS120B for further use where a small number of more relevant decisions is preferable to many cheap malformed decisions. They do not justify a broad quality ranking or a claim that economy and agency are solved. The continuing test is whether the model can maintain grounded purposes across replies and actual outcomes, choose relevant steps consistently, and form precise agreements through another person's independent consent. No additional cloud call was made for this review.
