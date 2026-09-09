# Matched alternative-model comparison: manual review

Date: 8 September 2026. Original [ledger](ledger.json) and [report](report.json) remain unchanged. This review separates transport failure, accepted state changes and semantic quality.

## Accounting and scope

Four attempts consumed **100 conservatively accounted neurons**. The GLM/B request returned HTTP 401 after OAuth expired; its **68-neuron reservation remains charged locally** because usage is unknown. The operator refreshed OAuth, then continued the other IDs without repeating the failed one. Authentication failure says nothing about GLM's response quality on B.

| Case and model | Result | Input / output tokens | Accounted neurons | Latency |
| --- | --- | --- | --- | --- |
| B / GLM | HTTP 401; no response | Unknown | 68 retained | 326 ms |
| B / Gemma | Applied, with semantic defects | 775 / 147 | 12 | 3,153 ms |
| G / GLM | Rejected: invalid work deadline | 919 / 76 | 8 | 11,757 ms |
| G / Gemma | Applied, with invented technical observations | 949 / 117 | 12 | 2,387 ms |

The three completed requests reported 2,643 input and 340 output tokens, and 30.693627394104004 provider neurons in total. Their rounded local charge was 32; the other 68 is an unknown reservation, not measured inference. Every candidate used the same corresponding V4 prefix, prompt and schema as its case, with the model's documented wrapper and thinking disabled. No candidate influenced another candidate. No production state or physical watch changed.

## Content and consequences

**B / Gemma:** The message is more developed than Qwen's stock phrase and asks Kes a concrete question. However, it invents a “new inventory layout” that was not in the supplied state. Its opening also implies seeing someone nearby, although exact physical co-location was not supplied. Asking for Kes's opinion only indirectly relates to Bex's want to be consulted herself. No project was created: `project` remains null, despite the instruction to begin a purpose. The accepted effect was a conversation with Kes, not an actual inventory change or a persistent plan.

**G / GLM:** It replies to Dima and uses distinct worker/payer IDs, improving on Qwen's rejected self-party offer. It nevertheless sets `dueWatch: 400` when the current watch is already 400 and the schema's future minimum is 401. The core rejects the entire response as `invalid_work_deadline`; no new message, offer or balance change commits. The spoken destination is an airlock while the terms name `hold`, so the claimed agreement would also need a semantic location check. This one result does not show reliable schema enforcement or negotiation.

**G / Gemma:** The terse surname address fits Gita's supplied manner, and the reply names Dima correctly. The professional fluency hides the central failure: the model says integrity is within tolerance, identifies a drifting sensor array and locates it in sector four. None of those observations was supplied. Dima had only requested an inspection. The core can store the message as a claim; it does not establish those conditions as physical facts. However, accepting the dialogue still exposes the invented situation to later minds and the observer. No project, offer, agreement or physical inspection was created.

Both Gemma responses cite valid IDs, but a valid citation does not support invented details. G's citation to Dima's inspection request cannot establish sensor measurements. Neither model's completed response maintained an actual project in these cases. There was no independent acceptance or executed work.

## Conclusion and next question

Gemma's two replies are more fluent and shaped by the character descriptions than these Qwen baselines, but fluency is not grounded autonomy. GLM corrected party identity in its one completed case and then failed the deadline. The missing GLM/B response, two selected cases, a single sample each and different provider mechanics preclude a statistical winner or a general model ranking.

The next test should make the information boundary and task explicit, distinguish voice guidance from facts to announce, require a first persistent purpose, and compare complete configured pipelines within a fixed budget. It must preserve these failures and still inspect semantic grounding, rather than count `applied` as a sufficient quality score. No new experiment was executed for this review.
