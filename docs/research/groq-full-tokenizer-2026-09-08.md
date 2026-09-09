# Full authored-prompt accounting for Groq GPT-OSS

Research and local validation: 8 September 2026. No model requests, production reads, deployment or credentials were used for this investigation. Package downloads and documentation reads used public sources. V4–V6 ledgers were read without modification; their residents are isolated fictional fixtures.

## Decision and limits

Use the pinned `tiktoken@1.0.22` **lite WASM** binding with only `o200k_base` ranks. Count SYSTEM, USER and the exact serialized response schema separately as ordinary text. Add the existing **128-token framing allowance** and reserve the configured maximum output separately. This supports a different system message without a hard-coded static token count.

These are exact **authored-component** counts, not the provider's complete prompt. Groq may format messages and structured output differently. The 128 allowance is provisional, not a proven upper bound. Do not present component count plus 128 as exact server usage; reconcile actual provider usage and retain conservative reservations when usage is unavailable. This implementation makes no change to provider limits, billing eligibility, daily caps or output limits. The historical 625-token static evidence remains intact.

Unknown models, combined authored text above 24,000 UTF-8 bytes or tokenizer failure fall back to the full UTF-8 byte allowance plus 128 (and the two joined separators). Nothing is truncated. Tokenization runs only upon reaching the keyed Groq fallback, with a control check after the asynchronous initialization and immediately before quota reservation/dispatch.

The module contains no per-resident or per-request cache. One immutable encoder is initialized per isolate on demand. Concurrent callers share its initialization promise; initialization failure is cached until isolate replacement rather than retried on every alarm. Counting does not perform I/O. Public observer/status reads do not initialize inference accounting.

## Provenance

`tiktoken` and the alias `@dqbd/tiktoken` are **third-party JavaScript/WASM bindings**, not OpenAI-maintained npm packages. Both published 1.0.22 on 9 August 2025; their lite WASM bytes are identical. The maintainer documents manually importing a compiled WASM module and using `lite/init` on Workers. Its old 1 MB limit example is outdated; use current Cloudflare limits instead. [Maintainer source and Workers example](https://github.com/dqbd/tiktoken#cloudflare-workers).

OpenAI's GPT-OSS tokenizer builds `o200k_harmony` with the same merge ranks and pattern as `o200k_base`, adding special delimiters. Ordinary text encoding ignores those delimiters. Thus the authored strings use base ranks without turning literal `<|start|>system` or similar user content into privileged tokens. This accounting choice does not itself prevent semantic prompt injection. [GPT-OSS tokenizer](https://github.com/openai/gpt-oss/blob/main/gpt_oss/tokenizer.py), [official encoding definitions](https://github.com/openai/tiktoken/blob/main/tiktoken_ext/openai_public.py), [ordinary encoding semantics](https://github.com/openai/tiktoken/blob/main/tiktoken/core.py).

The npm ranks reconstructed into the official 199,998-row format have SHA256:

```
446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d
```

Their regex exactly matched official Python `tiktoken==0.14.0`. All token IDs matched for 103 distinct saved components/adversarial texts and 500 additional deterministic Unicode vectors. Cases included accents, combining characters, several scripts, emoji sequences, literal Harmony delimiters, null/newline characters, recent Unicode scripts and lone UTF-16 surrogates. Fixed official-ID fixtures are retained in `workers/habitat-runtime/test/fixtures/groq-tokenizer.json`; invalid surrogate strings are constructed from code units inside tests to keep the test transport valid JSON.

## Local comparison

Measured in fresh Node 24.19.0 processes on the development Mac. Values are individual local observations, not Cloudflare production guarantees. JS and WASM agreed with Python on all 103 corpus cases. Neither package was installed in the repository until WASM implementation was approved.

| Measurement | lite WASM 1.0.22 | js-tiktoken 1.0.21 |
|---|---:|---:|
| Encoder initialization, including local module/rank loading |69ms|222ms|
| Additional JS heap at initialization |6.9MiB|120.5MiB|
| Additional JS heap retained after corpus and GC |2.9MiB|68.8MiB|
| WASM linear memory |26.94MiB|—|
| Maximum normal corpus component encode |1.44ms|8.05ms|
| Artificial 24 KB single regex piece |99ms|20,470ms|

Do not interpret process RSS as Worker isolate heap: it also includes the Node runtime and native overhead. The JS version's actual heap peak alone leaves almost no room within Workers' 128 MB limit, and its pathological long-piece cost approaches the DO CPU limit. It is not recommended here. The maintainer provides a JS lite build, but lite packaging does not remove its rank-map construction cost. [JS implementation](https://github.com/dqbd/tiktoken/tree/main/js).

An isolated Miniflare/workerd test loaded the same WASM as a compiled module, with outbound requests blocked. Before its first count, a GET reported no initialized encoder and zero instantiated WASM bytes. All103 resulting token-ID arrays matched Python. V8 heap after GC was 5.41 MB before counting and 6.92 MB after; linear memory was28,246,016bytes. The minimal bundled JS+ranks was2,332,396bytes and WASM 1,073,364 bytes. Runtime readiness took 70 ms locally; the first request counting all 103 cases took 283 ms, and a warm three-component request 4.50 ms. Those host wall times include local runtime/IPC work and are **not** deployment startup CPU measurements.

Current Cloudflare documentation gives 64 MiB uncompressed script size, no compressed-size limit, 128 MB combined JS/WASM memory, and 1 second to execute global scope. Ordinary Workers Free HTTP has 10 ms CPU; Durable Object invocations, including alarms, default to 30 seconds. Lazy initialization therefore belongs in cognition inside the DO, not a public Worker GET. Imported WASM must be a precompiled module; runtime compilation from downloaded bytes is unsupported. [Worker limits, updated 5 September 2026](https://developers.cloudflare.com/workers/platform/limits/), [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [WASM support](https://developers.cloudflare.com/workers/runtime-apis/webassembly/).

The isolated measurement does not establish peak memory for the entire production simulation, recovery exports or concurrent requests. The full bundle and runtime tests must still pass before deployment; retain the 24 KB input bound and a single reusable encoder.

## Capacity recovered in saved fixtures

For the seven saved V6 jobs available at measurement time, complete authored components contained 1,782–2,699 tokens. With the provisional 128 input margin and a hypothetical 1,536-token output reservation, totals were 3,446–4,363: all seven fit 6,000. Static SYSTEM count plus remaining UTF-8 bytes and the same output size rejected all seven. This is a comparison against saved inputs, not a request to increase output or a guarantee about future contexts or provider-side framing.

For V6 B, the component counts were 625 + 441 + 716 = 1,782; for C 625 + 491 + 712 = 1,828. Privacy, available actions and schema contents were unchanged by token counting. No prompts were shortened to obtain those figures.

## Reproduction

The temporary isolated benchmark is `/tmp/villa-tokenizer-feasibility/`: `bench.mjs` compares Node implementations, `workerd-bench.mjs` bundles and runs with outbound access blocked, `unicode-check.mjs` checks the additional Unicode vectors, and JSON results retain token IDs. Python read only the reviewed cached ranks with hash verification; it did not download a model or call inference.

The permanent Worker tests cover fixed token IDs, literal special tokens, UTF-8 bounds, lazy/concurrent initialization, cached failures, byte fallback, public GET behavior and a pause occurring during token counting. Wrangler dry-run verifies that the dependency becomes a compiled WASM module without changing Worker or Durable Object identities.

Implementation validation: 66 targeted Worker tests (tokenizer, router, quota and Groq) and ESLint passed. Wrangler dry-run produced 4,233.98 KiB uncompressed while retaining the existing Worker, Durable Object class, binding and habitat ID. No deployment was performed.
