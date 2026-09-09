# Opening proposals: protocol 4 decision and cost

Protocol 4 allows an optional transfer, loan or work proposal in a resident's first message. It does not interpret that message as the other person's consent. This extends an operation the canonical core already supported and removes the adapter's compulsory introductory exchange. The change is implemented locally. The subsequent [37-call protocol4 evaluation](model-society-protocol4-local-2026-09-08/review.md) applied every response but produced zero deals or payments; deployment remains a separate decision.

The preceding [37-call grammar run](model-society-v7-grammar-local-2026-09-08/review.md) produced zero deals. Allowing proposals earlier is therefore a concrete reduction in required protocol steps, not evidence that the model will negotiate well or choose to negotiate at all. The shortest exchange can become **proposal → counterpart acceptance**, two authored voices, instead of **introduction → counterpart proposal → initiator acceptance**, three. Questions, counterproposals or refusals can still require more turns. No actual call saving is assumed in capacity forecasts.

## Versioned contract

New jobs use output contract `society_turn`, version 4. Named wrappers `proposalCapabilityChoiceJsonSchema`, `decodeProposalCapabilityChoice` and `applyProposalCapabilityChoice` enable opening proposals explicitly. `applySocietyProtocol` selects the wrapper from the saved job's version. The existing version 1 canonical operation, version 2 choice adapter and version 3 capability adapter keep their defaults. There is no global switch that gives a pending version 3 response new authority.

The wire fields and capability names stay the same. At an opening, the schema adds only proposal variants: transfer give/ask, loan lend/borrow and work work/hire. It never offers accept/reject without an actual incoming offer. The proposer is the current actor; the counterpart comes from the eligible literal `message.to` directory. Models cannot supply arbitrary parties or absolute dates. A deal requires a complete message. In the final protocol4 boundary, omitted `close` keeps it open, following canonical behavior; explicit `close:true` conflicts with a deal. Protocol2/3 still require explicit false for their deals. An ordinary message can omit `close` or close the exchange. If nobody is available, no message or deal is exposed. No proposal is mandatory, and private purposes are not automatically published.

The core rechecks actor control, mind/conversation revisions, time, availability and the proposing payer's actual uncommitted funds before creating an offer. It does not query a counterpart's private balance to decide which proposals to expose. New offers expire after two watches. They do not debit accounts, move bodies, create labor or reserve an invented escrow balance. A counterproposal replaces the old offer instead of accepting it.

Only the actual counterpart can later accept the exact offer ID and terms. Acceptance rechecks funds, debt limits, deadlines, worker commitments and physical prerequisites. Rejection creates no transfer or debt. Closing expires an unanswered offer; silence is not acceptance. Accepted work reserves the existing payer's promise, without creating money, and supplies a physical action when the worker has no runnable personal step. Personal plans and urgent needs can still take precedence. Completion and payment depend on recorded physical outcomes and available funds; an accepted contract is not a guarantee of success.

The version 3 SYSTEM remains unchanged. Version 4 replaces its conversation-only deal sentence with:

> Deal is optional. To propose a concrete transfer, loan or work commitment that serves your purpose, use deal, including first contact. Words alone do not schedule work or move cells. Ordinary discussion needs no deal.

The final protocol4 instructions also explain canonical omission, work/hire roles and exact-offer acceptance. The preceding protocol3 literal remains unchanged. Instructions still distinguish defined effects from invented facts, forbid unrelated physical work as a substitute for conversation, and state that a proposal is not consent, execution or payment.

## Measured cost on the 37 saved contexts

The [offline measurement script](opening-proposal-audit-2026-09-08.mjs) reads the **37 requests in the new conditional-grammar local run**, ledger SHA `1cfd4fb0e79e04bee8f25f6c6a19378065090cd09fbd31e6ccf93fcc0c6f6031`. It changes the opening schema and SYSTEM sentence in memory, retaining each exact USER context. These are counterfactual payload counts, not future model responses or a replay of a society that actually proposed deals. All 37 saved outputs remain syntactically valid. A separate comparison confirmed that the cost transformation matches the implemented producer for all 25 GENESIS actors.

Counts use cached official tiktoken 0.14.0 ordinary `o200k_harmony` tokens for SYSTEM, USER and serialized schema, plus the runtime's explicit 128-token framing allowance and a **1,024-token output reservation for every request**. This is not exact provider-reported input usage or a measured bill. Results are in the [measurement JSON](opening-proposal-audit-2026-09-08.json).

| Same 37 saved contexts | Total reserved tokens | Per-request range | Requests over 6,000 |
| --- | ---: | ---: | ---: |
| Current version 3 grammar | 165,893 | 3,266–5,268 | 0 / 37 |
| Opening schema only | 182,117 | 3,266–5,268 | 0 / 37 |
| Opening schema and version 4 instruction | 183,153 | 3,294–5,296 | 0 / 37 |

Only 12 contexts gain an opening deal schema: A, B, D, E, F, I, J, N, P, R, S and V. These add **1,308–1,396 schema tokens each**, totaling 16,224. The instruction adds 28 tokens to each of 37 contexts, another 1,036. Combined overhead is **17,260 reserved tokens, about 10.4%**. The other 24 conversational contexts already expose proposals; Y still has no recipient. Maximum authored input is 16,635 UTF-8 bytes, below the current 24,000-byte tokenizer guard.

These totals exceed the configured 150,000-token Groq daily allowance if treated as one day of unrefunded Groq reservations. Individual request fit is not a promise of whole-day capacity. The production quota allocator, settlement behavior and newly planned pacing are not tested by this arithmetic. Future longer transcripts, debt lists or offers may exceed these ranges. No Workers AI bill, cloud quality ranking or economic success rate is inferred from them. No cloud request was used; research accounting remains 1,852 neurons.

## Verification and remaining evidence

The offline candidate passed 757 positive/negative grammar checks. The implementation passed 72 society tests across five files, five saved-protocol dispatcher tests, runtime TypeScript and ESLint at this checkpoint. New cases exercise six proposal directions/roles, exact counterpart acceptance, refusal, ordinary closure, verbal promises without effect, superseded offers, private-balance separation, existing reservations, busy recipients, stale control/time, no available recipients, real work followed by conserved payment, duplicate application and unchanged older protocols.

Those resource effects occur in explicit synthetic unit fixtures. They are not model-generated agreements. The subsequent isolated run reported 37 applied responses and zero offers or payments, without forcing negotiation or editing responses. All messages omitted `close`; because a later deal requires an earlier explicit `close:false`, grammar field order remains a potential confound rather than evidence of economic disinterest. Its complete review is linked above.

## Later bounded evidence

The [compiler audit](deal-branch-recommendation-2026-09-08.md) justified aligning protocol4 omission with the canonical core. The subsequent [six-decision probe](model-society-open-message-local-2026-09-08/review.md) emitted five proposals but no acceptance; it retained a contradictory advisory description that is documented without repairing outputs. After clarifying that description and exact-offer acceptance, [one final continuation](model-society-exact-accept-local-2026-09-08/review.md) made a shorter counterproposal, still with no agreement or payment. Independent synthetic tests prove the contract mechanism, while these model samples do not establish successful negotiated autonomy. No further inference is implied.
