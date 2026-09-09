# Matched alternative-model comparison: plan only

Checked 8 September 2026. No inference was run to prepare this plan. The [manual script](../../scripts/benchmark-society-alternatives.mjs) is offline by default; the parent operator must separately authorize any real calls. It does not change the production model or V4's frozen inputs/results.

## Provider formats

The exact existing model IDs are `@cf/zai-org/glm-4.7-flash` and `@cf/google/gemma-4-26b-a4b-it`. Their official API schema trees publish `max_completion_tokens`, `chat_template_kwargs.enable_thinking` (default true), and a `response_format.json_schema` wrapper with `name`, `schema` and optional boolean `strict`. Both output chat-completion envelopes. Sources: [GLM API](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/), [Gemma API](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/).

The candidate payloads use `enable_thinking: false`, a 768-token completion cap and `strict: false` with the exact optional-field society schema. Cloudflare also demonstrates disabling Gemma thinking in its [Workers binding guide](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/). Neither model page establishes a separate thinking-token allowance. Their generic `reasoning_effort` field is not treated as a proven model-specific substitute. Unexpected output/reasoning remains in the saved response and counts towards usage.

This is a documented request shape, not a guarantee that the current nested schema is enforced or that a decision is coherent. V2 used `strict: true` with its simpler schema; this comparison deliberately requests best-effort structure for the unchanged optional society schema. Do not silently switch modes, repair JSON, add hints or repeat a failed ID during the comparison.

## Matched cases and payloads

Use these exact records from the [V4 ledger](model-society-v4-2026-09-08/ledger.json):

- **B initial opening:** `isolated-society-runtime-v4:mind:B:0:1:g:0`. There is no conversation. The Qwen baseline repeats a stock phrase from Bex's voice, without a concrete purpose. Assess whether a candidate initiates a meaningful contact towards Bex's own want instead of answering an imagined request.
- **G's response to D:** `isolated-society-runtime-v4:mind:G:1:6:g:0`. Although the harness stage is named `initial`, this resident already has Dima's real incoming message. Qwen's proposal used G as both worker and payer and was rejected. Assess an actual response to D, distinct negotiated parties if terms are proposed, and alignment between words and executable terms. An offer is optional; a grounded clarification or refusal can be a good response.

For each model, the script reconstructs the exact V4 prefix with `runFixture(..., { maxNewCalls: 0 })`, verifies that the stored job is reproduced byte-for-byte, and keeps the original `turn`. Both models receive identical system/user content, schema, temperature and seed for each case. Only the documented model wrapper and thinking control differ from Qwen. Qwen's trailing `/no_think` is not copied to these providers. Each candidate is applied to a fresh clone of its own pre-decision state, so one alternative cannot influence another.

```js
{
  messages: [
    { role: 'system', content: sourceJob.job.prompt.system },
    { role: 'user', content: sourceJob.job.prompt.user }
  ],
  temperature: sourceJob.payload.temperature,
  seed: sourceJob.payload.seed,
  stream: false,
  max_completion_tokens: 768,
  chat_template_kwargs: { enable_thinking: false },
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'society_turn',
      schema: sourceJob.job.outputContract.jsonSchema,
      strict: false
    }
  }
}
```

The same body applies to both model IDs. Comparing both models on both cases requires at most four calls; putting a different model on each of two different cases would confound model and case.

## Cost, persistence and checks

Published rates are 5,500 input / 36,400 output neurons per million tokens for GLM, and 9,091 / 27,273 for Gemma. [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

| Case | Complete messages/schema bytes | GLM maximum reservation | Gemma maximum reservation |
| --- | --- | --- | --- |
| B | 5,087 | 68 neurons | 86 neurons |
| G | 7,042 | 78 neurons | 104 neurons |

Reservations include those UTF-8 bytes, another 2,048 template-token units and 768 output tokens, then round upward per call. Total worst-case reservation is **336 neurons**, within the separate **400-neuron local cap**. This conservative estimate is not a tokenizer guarantee or additional account allowance. Previous trials and production still consume the same account capacity.

Each reservation is persisted before fetch and the original response before core application. Complete authoritative token usage can release unused reservation; failed, partial or unknown usage retains it. Same-directory resume skips every already reserved ID, including unknown outcomes. A hash binds reference ledger, sources, script, model rates, policy and all payloads. Source changes or inconsistent replay fail closed. The default invocation performs no API calls or output writes and does not read credentials. Live invocations default to at most one new call; `--max-new-calls 0` replays an existing comparison ledger without reading credentials.

The offline self-test covers exact prefix reconstruction, equal candidate inputs, reserve-before-dispatch, separate cloned application, rejected self-party work, staged continuation, duplicate/crash replay, unknown outcome retention, raw-response/payload tampering and credential gates. A Node test forbids every network request. These checks establish experiment mechanics, not model quality.

Results, exact usage and semantic review: **pending**. No production alarm, physical watch, long-term plan or emergence claim is part of this matched comparison.
