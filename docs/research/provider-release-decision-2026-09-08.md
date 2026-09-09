# Provider release decision — 8 September 2026

Select **Cloudflare GPT-OSS 120B as the primary for a monitored canonical release**, keeping the provisioned **Groq GPT-OSS 20B Free project** as fallback. The current [Wrangler configuration](../../workers/habitat-runtime/wrangler.jsonc) now selects `@cf/openai/gpt-oss-120b`; this note does not certify deployment. Preserve the existing world, quota ledger, 8,000-neuron runtime limit, 1,024-token output cap, three-minute cognition cadence and six-hour physical watches/review interval. No inference, credentials, account settings or configuration were changed for this review.

This is a practical choice from limited evidence, not a claim of reliable autonomy or a statistically superior model. The two matched [V7 cloud cases](model-society-v7-oss-probe-2026-09-08/review.md) improved on their local baselines: B answered the actual request without an unrelated growing contract; L proposed a mechanically relevant repair. Both applied. B still added an irrelevant drink step and ended its 300-character message mid-question. Neither case executed a physical watch or demonstrated an offer, independent acceptance, agreement or negotiated payment.

## Capacity supported by the measurements

Cloudflare currently lists 10,000 free neurons per day, resetting at 00:00 UTC. GPT-OSS 120B costs **31,818 input / 68,182 output neurons per million tokens**. The project's 8,000 runtime / 2,000 research split is our own accounting policy, not two provider allocations. [Official pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

At this checkpoint, external research accounting is **1,770 / 2,000 neurons**, leaving **230**. This includes conservative reservations for unknown outcomes. Changing the primary does not reset today's runtime spending. The split also assumes no unaccounted Workers AI consumer on the same account; research scripts and the production SQL ledger do not automatically reconcile one another.

| Exact V7 cloud case | Reported input / output | Charged neurons, rounded up | Research reservation | Latency |
| --- | ---: | ---: | ---: | ---: |
| B, reply 0 / sequence 25 | 1,588 / 470 | 83 | 251 | 11.786 s |
| L, initial 11 | 1,470 / 441 | 77 | 246 | 10.554 s |

The reservations count complete authored SYSTEM, USER and schema with cached official `o200k_harmony`, then add a 2,048-token template allowance and 1,024 output tokens. Provider-reported input is substantially smaller than that authored-component count; do not subtract the schema from future reservations or treat that difference as an established billing rule. [Original cloud ledger](model-society-v7-oss-probe-2026-09-08/ledger.json)

I also counted **all 37 actual saved V7 jobs**, including their real reply histories. These are not synthetic enlarged prompts. The current production Workers AI reservation uses full serialized request UTF-8 bytes +128 as its input allowance; Groq uses authored-component tokens +128. Both reserve the full 1,024-token output maximum.

| V7 stage | Jobs | Authored component tokens | Groq total reservation | Workers AI input allowance | Workers AI neuron reservation |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial individual turns | 25 | 2,114–3,542 | 3,266–4,694 | 9,449–14,867 | 371–543 |
| Replies | 8 | 3,632–3,792 | 4,784–4,944 | 15,244–16,095 | 555–582 |
| Reviews after one watch | 4 | 2,339–3,790 | 3,491–4,942 | 10,413–15,947 | 402–578 |

**All 37 fit the local Groq 6,000-token request guard.** Their combined reservation is 155,530 tokens, so all 37 would not fit the 150,000-token daily guard without some settlement refunds. The 37 local responses themselves reported 1,277–1,734 input and 77–226 output tokens, but those are a different model/server's measurements; they cannot price future cloud responses. [V7 ledger](model-society-v7-local-2026-09-08/ledger.json), [router](../../workers/habitat-runtime/src/providers/router.ts), [Groq counter](../../workers/habitat-runtime/src/providers/groq-token-estimate.ts)

Practical daily planning ranges:

- **Workers AI:** if the two observed 77–83-neuron costs repeat, with complete settlement and no failed attempts, approximately **90–100 responses/day** fit after preserving the 371–582-neuron reservation needed to admit the next request. This is an illustration, not a forecast. With no confirmed usage and every reservation retained, only **13–21 attempts** fit. Invalid answers still cost money-equivalent quota; retries reduce useful output.
- **Groq:** the saved reservation sizes permit **30–45 attempts per rolling day** even without refunds, subject to the provisioned 200-request cap. Complete usage could release capacity, but final protocol-3 live usage and compatibility have not been measured there. Do not apply Cloudflare's observed input counts or quality to Groq.
- **Schedule:** three-minute spacing gives at most 480 daily opportunities, not 480 completed decisions. Twenty-five people reviewed every six hours imply roughly **100 individual reviews/day before replies and retries**. Replies can also refresh an individual's review time. The fallback may cover some demand beyond the primary; it does not guarantee every resident's six-hour deadline. Ordinary physical routines continue when cognition is deferred. [Scheduler](../../workers/habitat-runtime/src/society-scheduler.ts)

## Fallback and release limits

The existing `habitat-prod` Groq project is documented as Free, provisioned with its encrypted Worker secret and only `openai/gpt-oss-20b` allowed. Its project guards are **10 requests / 6,000 tokens per rolling minute** and **200 requests / 150,000 tokens per conservative rolling 24 hours**. These are the provisioned project limits, not an assumption from a generic public tier table. [Provisioning record](../../workers/habitat-runtime/README.md#secrets), [quota implementation](../../workers/habitat-runtime/src/quota.ts), [official rate-limit documentation](https://console.groq.com/docs/rate-limits)

The Groq adapter requests low reasoning and best-effort `strict:false` for the optional society schema. The official API documents this mode, including possible schema failures. That establishes an available interface, not that our complete dynamic grammar has passed live. Keep authoritative local validation and do not advertise the fallback as verified. Moving to strict mode would require a compatible contract, not simply flipping a flag. [Groq adapter](../../workers/habitat-runtime/src/providers/groq.ts), [official structured outputs](https://console.groq.com/docs/structured-outputs)

No new blocking quota/routing defect was reproduced in this review. The existing path reserves before dispatch, settles complete usage, keeps unknown usage charged, limits actual submissions per provider/job and checks control again before fallback. Three material limits remain:

1. **Framing is not fully measured.** The Groq +128 allowance is provisional; exact authored-token counts are not exact server totals. Compare the first naturally reached fallback's reported usage against its reservation and revise the margin if it undercounts. The retained 6,000/150,000 guards are not a provider-side hard billing cap derived from known framing.
2. **Conservative primary reservations reduce availability.** A 371–582-neuron reservation can refuse a request near the daily limit even when its eventual charge might be 77–83. Keep this safeguard for this release. A future estimator change needs verified framing and unknown-usage tests, not a byte-to-token guess.
3. **Syntactic acceptance is weaker than useful agency.** The full local V7 run applied 29/37 responses but persisted no economic agreements. Referenced appraisals could still confuse a promise with completed work. The two cloud improvements do not remove those semantic risks. [Full V7 review](model-society-v7-local-2026-09-08/review.md)

Accept this as a monitored release with truthful observation: count completed versus rejected/deferred turns, coverage of all 25 people, causal replies, relevant planned actions and their later physical results. Report agreements and payments only when both consent and ledger effects exist. A project whose listed steps ended is not automatically a fulfilled purpose. Preserve all failed responses and quota charges; retain deterministic continuity when either provider is unavailable. Do not increase caps or spend the remaining research allowance to manufacture a success claim.

## Reproducibility

The capacity table was recalculated offline with `countParts` from [the existing probe utility](../../scripts/benchmark-society-oss-probe.mjs) and the [frozen V7 loader](../../scripts/benchmark-society-frozen-v7.mjs), using official tiktoken 0.14.0, ordinary `o200k_harmony` encoding, and the already cached rank file. No inference or downloads occurred. Every saved job's SYSTEM, USER and serialized schema was counted separately; the frozen provider helper constructed the 120B payload for the byte reservation. Formulas: `Groq = authored tokens +128 +1024`; `CF = ceil((payload bytes +128) ×31818/1e6 +1024 ×68182/1e6)`.

Reference ledger SHA256: `5c522aa859f7d06f157166126436f1f7f834baa32a449a67e7590f2be6e0b42b`. Source bundle SHA256: `f9073d2546197690f8fd0d5391dd2ed2826f9675e0990873f776f8dd9faf5817` (62 files; Vite 8.2.0 / Zod 4.4.3). The primary and fallback share a purpose/context contract, not identical provider internals: the Groq adapter also omits the Workers seed and temperature settings. No claim here assumes deterministic cross-provider equivalence.
