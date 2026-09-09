# Six local P4/P5 comparisons: explicit acceptance, with limits

Completed on 8 September 2026. This is an assistant review of preserved fictional research outputs and actual core effects, not a human participant evaluation or a production outcome. The machine-generated [report](report.json) retains its original `humanReview: pending` field; this separate review supplies the interpretation without changing that report or the ledger.

All six responses passed the supplied grammar and applied. Each P4 control proposed work again. Each P5 response selected the exact incoming offer ID and created an active agreement in its own clone. Every agreement was for **zero cells**. There were no physical watches, completed work units, payments or balance changes.

## What was held fixed

The [plan](preselected-plan.json) fixed three historical states from the same J/L conversation and the order J44:P4/P5, L45:P5/P4, J46:P4/P5 before HTTP. The historical P4 payload, USER, sampling, seed, model, 1,024-token output limit and disabled thinking were retained. P5 changed the response grammar and the format instructions derived from that saved P4 SYSTEM. It did not add the later English instruction, invent messages or insert proposed answers.

P5 represents the economic choice first in a fixed two-element array, followed by the message and optional cognition fields. This is a **joint format/instruction intervention**, not an isolated test of object-property ordering. It leaves refusal, counterproposal and no deal available. The fixtures were selected because they already contained negotiation; they cannot estimate spontaneous negotiation, population-wide acceptance, general narrative quality or model rankings.

Each response applied to the same before-state as its paired control. P5 outputs did not feed subsequent cases: the three agreements are alternative branches, not three agreements accumulated in one world. The first two historical counterproposals changed a deadline legitimately. Acceptance was never a success requirement for those cases.

## Case review

| Case | Incoming work terms | P4 decision and effect | P5 decision and effect | Interpretation |
| --- | --- | --- | --- | --- |
| J44 | Offer 70: L repairs once at Workshops, J pays 0, due 401 | Hire again, due 402; creates offer 75 | `accept:offer:70`; creates agreement 75, due 401 | P4 requests a different deadline and is legitimate. P5 explicitly consents to the existing terms; this is an alternative choice, not proof that P4 was wrong. |
| L45 | Offer 75: the same work, due 402 | Offer own work, due 401; creates offer 79 | `accept:offer:75`; creates agreement 79, due 402 | Again, the deadline counterproposal is legitimate. P5 accepts without silently changing its deadline. |
| J46 | Offer 79: the same work, due 401 | Prose says it accepts, but proposes identical terms and creates offer 83 | `accept:offer:79`; creates agreement 83, due 401 | This is the clearest improvement: P5 makes the structured decision match the acceptance language. P4's new proposal is not consent. |

All agreements remain active with progress 0, no completion timestamp and no physical evidence. The payer and worker, price, facility, units and deadlines come from the referenced offer; the adapter did not synthesize acceptance or revise terms. None of these zero-price agreements demonstrates an economic payment.

Narrative grounding remains imperfect. In J44, P4 says L is already there, while L's actual body remains in Hold. P5's trust appraisal cites a real received turn but treats L's arrival as established; that turn establishes a stated intention/readiness, not a physical arrival. The appraisal is mechanically valid yet its stated basis overreaches the evidence. J's actual room is Workshops in all three fixtures, so the broad worksite claim is consistent; a particular “power bay” position and materials personally prepared there are not separately established by the stored state. J46 P5 retains that phrasing. Global stock and J's cell balance do not prove personal possession or staging of materials. The grammar improvement has not resolved these semantic issues.

## Measured usage, distinct from reservations

| Local reported usage | P4, three calls | P5, three calls | P5 minus P4 |
| --- | ---: | ---: | ---: |
| Input tokens | 6,211 | 6,505 | +294 |
| Output tokens | 358 | 167 | −191 |
| Total tokens | 6,569 | 6,672 | +103 |

The local server applies JSON Schema as a decoding grammar; it does not include that whole schema in its reported prompt-token count. P5 used 103 more reported tokens across these three calls despite its smaller schema. These counts are not a Groq bill or a cloud cost estimate.

The separate [offline component measurements](../ordered-choice-measurements-2026-09-08.json) include SYSTEM, USER and schema tokenization, a provisional 128-token framing margin and the full 1,024-token output reservation. For the exact J44/L45/J46 payload pairs, Groq maximum reservations decrease respectively **5,687→5,252; 5,612→5,177; 5,673→5,238**: 435 tokens per request, 1,305 over the three. That is a reservation difference, not measured provider use or a claim that provider framing is exact. No Groq or Cloudflare request was made here.

Measured request latencies were P4: 13,008/2,392/2,618ms and P5: 2,182/1,662/1,810ms. The first P4 request includes loading the model; the server reports a 6.1-second model load. The samples are too few, and that startup differs, so these figures do not support a general speed claim. All six responses ended normally, with no schema-fallback Warning header or schema-fallback warning in the saved server log. The server did report a nonfatal memory-cap warning at startup; Apple’s existing Metal cap was left unchanged.

## Reproducibility and closure

The [ledger](ledger.json) preserves reservations before dispatch and raw response bodies before application. The [offline verification](offline-verification.json) replayed all six using zero HTTP requests and zero ledger writes. P5 effects match their translated P4 canonical effects, duplicate application makes no further changes, and the clock and input fixtures remain unchanged. All three parsed P4 outputs exactly match the historical controls. This does not mean their HTTP metadata or raw transport bodies are identical.

Before source release, 66 captured current source files and five probe scripts were checked, along with the 62-source historical overlay and its Vite/Zod versions. Source bundle SHA256: `6a434bd04e8086ee88eea4ba82aa5985c2e92f230d8c636cf892816dbdbda160`. Ledger SHA256: `6b4f3aea806f1bfa6cfe260f97b45a4c172443451971f042de9fae746e34a13a`. [Other artifact hashes](offline-verification.json) preserve the plan, payloads and raw results.

The isolated server 39618 was stopped with SIGTERM and exited 143. Port 8018 had no listener afterwards; the user's server 29617 on 8000 remained running. [Execution evidence](execution-evidence.json) records the commands, usage and provenance. The prior four measured weight hashes were inherited with file-identity/timestamp guards; this run rechecked metadata and server sources, not every weight byte.

This closes the authorized six requests. The cumulative count is 139 completed local requests; cloud research remains 1,852 neurons. The demonstrated result is exact-ID acceptance in three selected alternative contexts, including repair of the final prose/decision mismatch. It does not demonstrate paid work, completed repairs, autonomous economic emergence, or reliable factual narration.
