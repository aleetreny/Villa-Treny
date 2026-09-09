# Independent review of the selected P8 attention protocol

Date: 2026-09-09. Scope: offline review of the selected C6 grammar, compact SYSTEM, resident selection, and provider reservations. No real inference, network request, deployment, world advancement, or shared implementation edit was performed by this review.

**No new concrete implementation blocker was found within this bounded review.** Selection improves available choices and measured request size. It does not establish better autonomous social behavior, guaranteed access to every provider, or bounded waiting time for every resident. The final integration suite was still running when this review was written; earlier terminal results below are explicitly historical.

## Selected instruction contract

The default producer in `workers/habitat-runtime/src/society-scheduler.ts` now emits protocol 8. Explicit earlier versions retain their own producer and saved interpretation. `attention-instructions.ts` selects the compact string; its 5,328 bytes have SHA-256 `e9589b12d43c1447413905058492f1fc0a3b3f7fdf9b05e9ff9eb9818863e6c2`, exactly matching the frozen measured C6 compact SYSTEM. The previous measurement remains labelled a counterfactual because it preceded this selection; it has not been rewritten retrospectively.

Reading the instructions alongside `attention-choice.ts`, the retrieval/record adapters, `dialogue.ts`, and the independent domain tests found the following agreement:

| Instruction | Enforced behavior and limit |
| --- | --- |
| Choose one attention operation or exclusive lookup | The emitted grammar permits reply, contact, private, or leave, with their own content shapes; lookup is separate. Unknown keys and mixed operations are rejected. |
| Establish a purpose, without mandatory first speech | A first private decision needs a project. Empty private content preserves an existing purpose; it cannot create one. |
| Review a selected exchange, or select none | Only the chosen supplied channel revision is acknowledged. Private with `null`, preparation, rejection and lookup acknowledge no channel. An acknowledgement proves neither understanding nor consent. |
| Leave while waiting | Leave adds no fabricated farewell, closes only its selected exchange, expires its open conversation offers, and preserves accepted obligations and document commissions. |
| Capacity is not consent or location | Both endpoints need an available channel slot; one open channel per unordered pair is allowed. Exact visual co-location is unnecessary. Acceptance still requires the exact incoming offer in the selected exchange. |
| Use supplied evidence and optional appraisal | Each presented channel contains the latest exact own and received text. Earlier omitted messages are not recreated. Appraisal is restricted to the selected received speaker and offered reference. |
| Plans, speech and drafts are not execution | Physical plans still wait for the physical watch. Record publication, access, commissioning and consent remain explicit operations. Removing duplicated authorization metadata from USER retains it exactly in private prepared bindings. |

English, voice, relevance, truthfulness, preserving useful plans and avoiding repetitive dialogue are instructions, not proofs of compliance. Schema validation alone cannot determine whether a plausible sentence invents a fact or whether a conversation is interesting. Reducing SYSTEM wording was checked for contract consistency by reading, not by new model output.

## Capacity evidence

The original complete revision-317 recovery and deterministic legal fixture were kept fixed. Every measurement used the real frozen Worker preparer, all 25 actors, full SYSTEM + USER + JSON schema, ordinary `o200k_base` tokenization, 128 provisional framing tokens and the unchanged 1,024-token output reservation. No evidence was shortened to make a result fit.

| Same input | P7 combined reservation | Selected C6 + compact SYSTEM | P8 maximum payload/component bytes |
| --- | ---: | ---: | ---: |
| Revision 317, all 25 residents | 5,801–8,171; five exceed 8,000 | 6,587–7,903; all fit | 25,323 / 14,282 |
| Legal fixture, three open channels and three unread closures | 5,327–6,977 | 5,548–8,754; A exceeds 8,000 | 29,919 / 16,520 |

The smallest observed margin is **97 tokens**. This is an ordinary-token estimate plus an explicitly provisional framing allowance, not the provider's exact prompt count. Both measured P8 scenarios satisfy the 32,000 combined / 24,000 per-component byte guards. Those guards select tokenization or conservative full-byte fallback; they do not truncate content. A future richer record, offer or channel state can exceed either token or byte threshold. The legal fixture is not a universal worst-case context.

Cloudflare maximum reservations summed over the 25 measured jobs are 20,959 neurons for revision 317 and 17,170 for the fixture. These are sums of conservative one-request maxima, not actual use or a promise that all requests fit within one daily free allowance. Settled real usage may be smaller; ambiguous usage retains its maximum.

See [fixed C6 measurement](attention-budget-candidate6-2026-09-09.json) and [C6 compact SYSTEM measurement](attention-budget-candidate6-compact-system-facet-2026-09-09.json). Public artifacts contain numbers and hashes; full prompts, exact recovery and reproducible scripts remain outside Git.

## Fairness and remaining starvation risks

`nextSocietyActor` gives priority to residents without a successful thought, alternates overdue reviews and incoming exchanges, and orders waiting people by their last success before message age. Three channels do not count as three queue positions. Preparation and failure preserve unread markers; the existing 30-minute failure backoff, six-hour ordinary review and three-minute minimum cadence remain. Markers on closed channels survive unrelated successful decisions.

`prepareNextSocietyJob` searches at most 25 resident candidates against one quota snapshot per enabled model. If the oldest person's context is not presently admissible, a smaller candidate can proceed. Known physical watches, review times, backoff expiry and conversation expiry trigger reconsideration. A skipped candidate does not receive invented speech or a successful acknowledgement.

This is fairness among eligible, admissible **people**, not a guaranteed deadline. Specifically:

- A request over 8,000 reserved tokens cannot use either Groq model under the current local project limit. Changing Groq model does not reduce that same request. Cloudflare may eventually admit it, or changing real context may make it smaller. Neither event is guaranteed on a fixed schedule.
- Smaller requests can become admissible before a larger one as provider pacing and available capacity change. A larger resident can wait repeatedly; unavailable Cloudflare, insufficient quota or permanent oversize can leave that resident waiting indefinitely. The bounded search avoids a global queue blockage but does not prove starvation freedom.
- Receiving an opportunity does not force a person to review a particular channel. The model may choose private work, another exchange or no channel. Unread evidence remains pending, but repeated delivery, comprehension and eventual response are not guaranteed.
- The global retained-conversation limit remains **40**, in addition to three open channels per resident. A closed channel can be retired for new P8 contact only after both participants have acknowledged its current revision. Forty retained channels with no eligible retirement block new contacts even when an individual has fewer than three open channels. This protects unread closures; it is a real capacity limit.

The existing `attention-scheduler.test.ts` and `cognition-candidate-search.test.ts` exercise individual fairness, independent closing reviews, backoff, exclusion of occupied residents, skipping a large candidate and reconsidering newly eligible work. They do not prove eventual service under arbitrary future quota and model choices.

## Cloudflare reservation safety

Reading `providers/router.ts`, `providers/free-model-router.ts`, `providers/workers-ai.ts`, `quota.ts` and their existing tests found no P8 bypass of quota accounting:

1. Cloudflare computes its maximum from the complete serialized provider request, using the conservative byte estimate plus framing allowance and the full output cap. The configured model's tariff is rounded upward.
2. Pacing is read-only admission advice. Immediately before dispatch the runtime rechecks control and performs the authoritative synchronous reservation, then marks that exact attempt dispatched. A positive pacing result is not permission to exceed the ledger.
3. Confirmed usage settles once. Missing or incomplete usage does not release the reservation; invalid model answers still consume resources. Provider-reported neurons can raise the charged amount, never reduce it below the configured tariff on complete reported tokens. A larger-than-reserved actual charge is recorded rather than discarded.
4. Accepted and pending cross-midnight charges retain the ledger's existing treatment. Changing model or protocol does not reprice stored history. Per-destination and total job submission limits still apply before alternatives are dispatched.

These checks constrain this application's local admission. They do not independently certify provider metering, future tariff changes, unmeasured framing, or unrelated account usage. No current console quota or production ledger was fetched during this offline review.

## Verification evidence and boundary

- C4→C5: all 100 recorded schemas are byte identical; all 50 P7 prepared outputs are identical. Every P8 cursor/reference-access binding was relocated exactly; no other evidence or authority was removed. [Exact relocation proof](attention-authority-relocation-candidate4-vs-candidate5-2026-09-09.json).
- C5→C6: 170,890 adversarial cases, 21,922 accepted by both and 148,968 rejected by both, zero disagreement. [Corpus result](attention-grammar-candidate5-vs-candidate6-2026-09-09.json).
- Independently, all 100 C5/C6 schemas match after expanding acyclic references and normalizing only object key order and scalar `enum`/`required` order. All prepared turns and remaining job metadata match. This checks recorded validation constraints beyond the sampled corpus. [Structural proof](attention-schema-normalization-candidate5-vs-candidate6-2026-09-09.json).
- Historical independent terminal runs: 14 domain attention tests and five Worker scheduler tests passed, with ESLint passing and zero real inference. These runs preceded the final default/SYSTEM selection. Existing candidate-search, quota, provider and integration tests were reviewed; their final selected-source execution belongs to the root integration report and is not claimed complete here.

This review supplies no new autonomous behavior sample. It demonstrates expanded legal attention choices, preserved consent/evidence mechanics, smaller measured requests and retained reservation controls. It does not demonstrate a more interesting economy, semantic accuracy of future dialogue, better model reliability, guaranteed completion of every conversation, or deployment success.
