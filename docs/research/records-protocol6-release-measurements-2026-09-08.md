# Records protocol 6: audience constraints and release measurements

8 September 2026. This is an offline checkpoint of the source whose autonomous producer now selects P6. It does not certify deployment. The [new measurement artifact](records-protocol6-release-measurements-2026-09-08.json) records 25 initial residents and four synthetic document contexts against a 59-file source manifest verified stable during measurement. The [earlier checkpoint](records-protocol6-measurements-2026-09-08.md) and its original figures remain unchanged.

## Contract correction

The previous P6 grammar admitted `audience:"private", publish:true`; the domain correctly refused that combination. The generated grammar now requires `publish:false` for a private draft. An explicit resident ID or `public` supplies a publication audience. A named recipient does not make the text public, and commission visibility remains independent of its publication audience.

Drafts citing private references can remain private or target their author. Existing drafts expose only destinations permitted by all their source grants for sharing, scheduling and commissioning. A redundant share or second pending publication is not offered. The domain retains its original validation, ownership, clock, payment and consent rules. No reference grant, document content or protocol 1–5 contract was changed.

P6 instructions distinguish accessible exact text in `records.drafts` from a speaker claiming that they sent, attached or read something. Omission counts remain explicit. An inaccessible private draft is not supplied to another resident, and no document is manufactured from a claim in dialogue. These instructions do not establish better model obedience or truthful prose.

## Actual admission reservations

Groq figures are the runtime reservation for the complete SYSTEM, USER and JSON Schema, plus provisional framing and the unchanged 1,024-token output maximum. Cloudflare figures use the actual GPT-OSS120B payload and the existing conservative UTF-8 maximum. These are maxima for admission, not measured provider consumption.

| Synthetic context | P4 Groq maximum | P6 Groq maximum | P6 Cloudflare neuron maximum | P6 USER bytes |
| --- | ---: | ---: | ---: | ---: |
| Initial 25, maximum | 5,121 | 5,966 | 703 | varies |
| B reads an exact shared draft | 5,088 | 6,337 | 748 | 2,813 |
| A receives a publication commission | 5,276 | 7,051 | 828 | 3,735 |
| A reviews an accepted commission | 3,771 | 5,561 | 659 | 4,135 |
| A has three full 600-byte revisions and two incoming commissions | 5,259 | 26,519 | 909 | 6,320 |

The last context contains 25,365 authored UTF-8 bytes across SYSTEM, USER and schema. It exceeds the tokenizer's 24,000-byte guard, so the production estimator deliberately falls back to its full byte allowance. Separately counting the three components offline gives 6,544 ordinary tokens, or 7,696 with provisional framing and output; this diagnostic figure does **not** replace the runtime's 26,519 reservation. Even that smaller diagnostic figure exceeds Groq's 6,000-token admission limit.

All 25 initial synthetic jobs fit Groq before feedback, with only 34 tokens of headroom at the maximum. Three of the four document scenarios do not fit. Retry feedback and changing context are counted again before reservation, so initial eligibility does not promise later eligibility. The existing independent candidate search and Cloudflare quotas remain authoritative. No text or obligation was truncated to obtain these figures, and no provider limit was increased.

The separate [scheduler regression fixture](../../workers/habitat-runtime/test/cognition-candidate-search.test.ts) also needed a genuinely smaller candidate after P6. Removing D's loan while preserving a real established purpose still gave a 6,022-token reply; changing the authored purpose to shorter ordinary phrases did not create useful headroom. The final fixture gives A 23 explicitly proposed and accepted loans, while K has a prior canonical purpose and no loans. K's reply reserves 5,987 tokens, with only 13 tokens of margin. Its later conversation-expiry context reserves 6,039 and therefore needs Cloudflare, where its maximum is 711 neurons. That expiry test supplies a synthetic 740-neuron remaining allowance under the unchanged 8,000 cap; A and C cannot use that allowance before expiry makes K eligible. All 12 scheduling tests pass, including bounded SQL reads, untouched state/quota while waiting, clock crossings during tokenization, and changed-control cancellation. These contexts are synthetic tests, not claims about current production capacity.

## Verification and limits

- 38 focused records tests passed, including 13 adapter tests. Fifteen targeted Worker protocol/schema tests, Worker TypeScript and changed-file ESLint passed. These counts are not additions to the overall release suite.
- Eight actual generated schemas were checked with native XGrammar 0.2.3: 19 valid outputs accepted and 41 invalid outputs rejected. Cases include private drafts with publication requested, private reference audiences, bound share/schedule destinations, commission visibility, fabricated IDs/hashes and the original independent draft/share/commission/accept sequence.
- The same synthetic variants were compared with the actual domain adapter. Invalid operations change neither the common response nor records; valid recipient publication remains available.
- No model request, model server, production read or inference was used. Local grammar membership does not prove compatibility with a hosted grammar implementation, useful dialogue, genuine understanding, or improved semantic quality after the wording change.

Artifact SHA256: `5287888221403a200335d46bd9fe0e9870644e7bdaba4e2047ec622d893f3856`.

Source manifest SHA256: `91ad03199dce4034cd26768a3c524467077b918029bae562141d08265da0d6aa`.
