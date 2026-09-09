# Fixed-system token accounting experiment

This is an offline accounting experiment, not a production change or a Groq inference benchmark. It preserves the existing 128-token framing allowance, the variable-content UTF-8 byte estimate, the output maximum and the rolling quota ledger.

The [frozen candidate](society-prompt-candidate-2026-09-08.txt), decoded as UTF-8 and trimmed exactly as the grounded benchmark does, is **2,194 bytes and 419 ordinary `o200k_harmony` tokens**. Replacing only this known component's byte allowance recovers **1,775 reserved tokens** without a characters-to-tokens ratio.

| Item | Verified value |
| --- | --- |
| Source file bytes, including final newline | 2,195 |
| Source file SHA256 | `6a1d5b408195258830a5caeab377fd6a5f9ca0af93a44dfcc3783207425c8590` |
| Trimmed message SHA256 | `fc8a6fbf1b75e51789399686e3840c1f8e0f3d98e58af212192fc22a6e590e85` |
| OpenAI package | `tiktoken==0.14.0` |
| Ordinary token count | 419 |
| Official rank-file SHA256 | `446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d` |
| Rank-file bytes | 3,613,922 |
| macOS ARM64 CPython 3.12 wheel SHA256 | `d6cebe67765569df3dafac8474e4eccf5c19d24140492567a5e58a11445732a4` |

The [OpenAI GPT-OSS implementation](https://github.com/openai/gpt-oss/blob/main/gpt_oss/tokenizer.py) explicitly builds `o200k_harmony` from the `o200k_base` merge ranks and pattern, adding Harmony special tokens. The [official tiktoken definition](https://github.com/openai/tiktoken/blob/main/tiktoken_ext/openai_public.py) publishes the rank URL and SHA256. This run verifies that encoding and decoding preserve the candidate exactly and that its ordinary tokens are identical under both encodings. The count applies only to this exact text and the GPT-OSS tokenizer; it must not be reused for Qwen, Gemma or GLM.

## Capacity comparison

For each context, this experiment applies the same candidate intervention as `benchmark-society-grounded-turns.mjs`: separate fixed system message, JSON-only user context, and `project` required in the schema when `ownProject` is null. All context and serialized schema bytes remain charged, plus the two existing separators and the unchanged 128 allowance. No context, observation, agreement or schema field is discarded to pass the limit.

| Inputs | Output maximum | Full-byte candidate fits 6,000 | Fixed-component candidate fits 6,000 | Fixed-component total range |
| --- | --- | --- | --- | --- |
| 25 independent initial jobs from the same fresh GENESIS | 768 | 0/25 | **25/25** | 5,111–5,702 |
| Same fresh jobs | 1,536 | 0/25 | **2/25** | 5,879–6,470 |
| 25 saved V4 initial jobs, with prior residents' actual conversations and agreements accumulated | 768 | 0/25 | **13/25** | 5,142–7,187 |
| Same saved serial jobs | 1,536 | 0/25 | **1/25** | 5,910–7,955 |

These are individual reservation sizes assuming the full minute allowance is available. They do not authorize 25 requests in one minute or prove that Groq will accept the requests. Previous reservations, RPM, daily quotas and breakers still apply. Saved serial jobs are read from the existing V4 ledger; this experiment does not replay or invent new model responses.

## Narrow draft and feedback boundary

The [research helper](static-system-token-audit.mjs) contains a small component estimator draft, not imported by production:

1. Check the exact provider model and the SHA256 of the complete fixed message before using 419.
2. For the existing controlled feedback suffix, require an unchanged fixed prefix and the exact separator ` Previous attempt was refused: `. Charge every suffix byte. Any different static prefix, model or unrecognized suffix falls back to the complete UTF-8 byte count.
3. Keep user context and schema at their byte allowance, keep 128 framing and the existing maximum output, then ask the unchanged ledger to reserve the result.

The suffix handling is specific to this frozen text. Its final regex pieces are ` execution`, ` or`, ` payment`, `.`. The final period is a complete punctuation piece. The controlled suffix starts with an ASCII space followed by `Previous`, so the published tokenizer pattern does not extend that period or any preceding piece into the suffix. Thus the fixed piece sequence stays intact, and the remaining suffix can retain its byte bound. This is not a generic claim that arbitrary BPE strings have additive token counts.

Six local checks exercise real error-like codes, long Unicode content and literal Harmony-looking strings. All preserve the fixed pre-token pieces and the first 419 token IDs, and combined ordinary tokens stay below `419 + suffixBytes`. The helper also checks full-byte fallback for a changed static sentence, a different model and an unrecognized suffix. If this controlled boundary is changed, the safe fallback is full bytes until it is checked again. A simpler implementation can optimize only an exact full-message match and leave all retries at bytes.

## Reproduction and scope

The temporary environment is outside the repository. No core dependency, lockfile, prompt, provider or production state was changed. The inference count is zero. The [JSON evidence](static-system-token-audit-2026-09-08.json) records all token IDs, suffix checks, per-resident totals, the original V4 file hash and the exact local source manifest used for fresh jobs.

To reproduce, prepare a temporary Python environment with `tiktoken==0.14.0` and `regex==2026.9.3`, and cache the official `o200k_harmony` ranks using `tiktoken.get_encoding`. The package installation and initial rank download use public package/source endpoints; neither calls a model. Then run:

```sh
node docs/research/static-system-token-audit.mjs \
  --python /tmp/villa-token-audit/venv/bin/python \
  --cache /tmp/villa-token-audit/cache \
  > /tmp/reproduced-static-system-token-audit.json
```

The helper itself blocks Python socket creation and Node `fetch`, requires the pinned tokenizer versions and verified cached rank hash, and only prints its report. Its fresh-job section is bound to the current source hashes; later core changes may legitimately change those totals. A changed candidate fails instead of silently reusing 419.

**Remaining uncertainty:** 419 is an exact count of the authored fixed text, not the complete server-side input. Groq's message and schema framing is not established by this experiment. The previous 128 allowance is retained, not newly proven. The existing conservative limit remains the fallback whenever the recognized component is unavailable. No runtime tokenizer, extra remote service or paid capacity is needed for this particular optimization.
