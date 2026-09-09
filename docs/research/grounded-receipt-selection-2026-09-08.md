# Grounded receipt selection

Status: deterministic receipt selection deployed in `5443a27b-ca4f-4b69-9d77-3017977ed969` on 8 September 2026 at 22:12–22:13 UTC. The [complete-cut receipt](release-2026-09-08/receipt-selection-release-continuity.json) passes 473 checks at unchanged revision 227; [release validation](release-2026-09-08/receipt-selection-release-validation.json) records the final checks. This verifies deployment and preservation, not a demonstrated semantic improvement. The separate evidence-first layout B completed its local comparison with mixed results and is not selected in production.

## Reproduction before changes

Using the complete revision 218 recovery cut and current P6 producer, an offline preparation for each of the 25 residents found:

- 23 received no memory containing their retained physical-action receipt; 11 did not receive their latest observation of any kind.
- 8 had a stronger duplicate-loss case: Body.memory contained the exact action outcome, but preparation removed it because a matching observation existed somewhere in their mind; the observation itself was then absent from the selected four memories. The actor received neither copy.
- All existing conversations retained the latest self and incoming turns in these 25 preparations. This sample does not reproduce loss of those two voices.

The cause is in `turn.ts`: lines 36–40 rank observations, claims and interpretations together, using words from the current conversation/project; lines 41–42 deduplicate against the entire stored mind rather than the final visible selection. `ownProject.steps` provides status but omits its retained `evidenceId` link. Thus repeated verbal material can outrank the actual outcome, even with space for only four memories.

The extraction uses only local files. Metadata is in `/tmp/villa-p6-context-structural-audit.json`; the reproduction script is `/tmp/villa-audit-p6-context-structural.mjs`. Neither contains a model inference or production mutation.

## Implemented layout

Keep the existing maximum of four visible memories. Reserve within that limit:

1. The actual observation referenced by the latest completed/failed project step, if that observation still exists.
2. The most recent retained physical receipt for this resident, when different from the first receipt.

The remaining positions retain the current relevance ranking. Claims and interpretations cannot become reserved outcomes. Retain exact text and identifiers; do not invent a receipt for an evicted event. Keep reserved receipts during optional-context compaction, declaring essential overflow rather than silently losing them. Expose a step's evidenceId only when its observation is actually present.

Deduplicate Body.memory against the observations finally visible in the context. If compaction removes a matching memory, its body copy becomes eligible again, within the existing own-history limit. Reference IDs are rebuilt from the final context. No new state, migration, operation, money, consent or provider call is needed; saved prepared jobs remain immutable.

Tests cover high-ranked claims/interpretations, duplicate restoration after compaction, outcome privacy, missing/false evidence, final reference binding, memory bounds, byte stability of saved preparations, and 25-context before/after costs with the real tokenizer.

## Limits and adjacent finding

The earlier eight-response comparison already provided decisive evidence for B/K, I/O and G/Q, yet the model still misread it. Fixing retrieval cannot be presented as a cure for those cases. In particular, a pending repair is not a failure before its physical watch, and an attributed claim of an attachment is not a document grant.

An independent synthetic clone exposed a separate records limitation: after W creates private drafts Alpha and Beta, Alpha remains readable by W and a direct authorized share of Alpha passes the records domain, but the P6 grammar rejects that share because `recordContext` only selects the latest own draft. `records.ts:319–322` and `record-choice.ts:76–78` have no retrieval/focus operation for omitted accessible revisions. This is a real longer-term capability gap, not evidence that it caused the currently observed sparse document production. It is outside this patch. The [authorized record retrieval and focus design](record-retrieval-design-2026-09-09.md) proposes a separate versioned boundary for retained, readable revisions; that design is not implemented.

## Validation and measured cost

The [25-case measurement](grounded-receipt-selection-measurement-2026-09-08.json) uses the same complete revision 218 cut, timestamps, model output limit and SYSTEM. Only `turn.ts` changed between the two source snapshots. Each case is a preparation, not an inference.

| Measure | Before | After |
| --- | ---: | ---: |
| Residents receiving their retained own physical receipt | 2/25 | 25/25 |
| Residents losing both copies through premature deduplication | 8/25 | 0/25 |
| Maximum visible memories | 4 | 4 |
| Sum of 25 Groq reservation estimates | 156,159 | 156,103 |
| Groq reservation range per case | 5,299–7,429 | 5,299–7,427 |
| Sum of 25 conservative Workers AI neuron maxima | 18,506 | 18,488 |

There are 16 visible step-to-receipt links. Four residents still omit their latest observation of another kind; this patch protects bounded action evidence, not all historical observations. Other memories retain ranked positions. Per-case Groq differences range from −29 to +33 tokens, including 1,024 output tokens and the provisional 128-token framing allowance. All 25 cases remain below the 8,000-token admission ceiling. These sums are neither actual usage nor a daily forecast.

At the earlier offline checkpoint, validation passed 232 society tests across 25 files, including 8 new retrieval cases; 28 focused Worker tests across 4 files; both TypeScript checks; and targeted ESLint. The final fixture correction retained valid importance weights 3/5 and the 8 new tests passed again. That checkpoint performed no inference, production mutation or deployment; the later release is documented above.

The separate experimental evidence presentation was subsequently measured below after its full-USER round trip preserved the actual identity prefix and every original value.

## Experimental evidence-first presentation: cost only

The separate [layout measurement](evidence-layout-token-measurement-2026-09-08.json) applies `renderSocietyEvidenceLayout` to the full current USER of all 25 corrected revision 218 preparations. The identity and recipient prefix remains byte-exact. All 25 inverse checks pass; original values, reference grants, array order and text are preserved. SYSTEM, schema and the 1,024-token output cap are identical between A and B. This module is experimental and is not imported by the production runtime.

| Reservation measure | A: current layout | B: evidence-first layout |
| --- | ---: | ---: |
| Total for 25 preparations | 156,103 | 157,656 |
| Range per preparation | 5,299–7,427 | 5,347–7,494 |
| Smallest margin to the 8,000-token ceiling | 573 | 506 |
| Cases within the request-size ceiling | 25/25 | 25/25 |
| Byte-fallback counts | 0 | 0 |
| Sum of conservative Workers AI neuron maxima | 18,488 | 18,710 |

The change adds 45–69 reserved tokens per person, 1,553 across the 25 cases. All measurements use the actual installed WASM tokenizer over full SYSTEM, USER and schema, plus the existing provisional 128 framing tokens. No tokenizer fallback was used. Request-size eligibility does not imply current budget or pacing availability; these are offline estimates, not spending.

The full-USER prefix issue found during review was fixed in the experimental renderer before measurement. No identity text was silently discarded. Information-preserving layout and acceptable cost do not prove improved model grounding. This cost measurement made no model or network request. The subsequent [bounded local comparison and semantic review](evidence-layout-semantic-review-2026-09-08.md) completed eight responses: all eight applied, producing four private drafts and four offers, with zero acceptance, publication, payment, closure or physical watch. Both layouts already used the corrected receipt selection, so this comparison does not isolate its semantic effect. B had mixed results, including a private heading advertised as a substantive list in the CN case; it is not selected for deployment. The batch used 24,065 local tokens. Original evidence and the [zero-HTTP replay proof](model-evidence-layout-local-2026-09-08/replay-receipt.json) remain separate from these offline reservation estimates.
