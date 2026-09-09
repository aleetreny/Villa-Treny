# Bounded full tokenization for larger P6 contexts

Implementation and offline measurement: 8 September 2026. No model requests, production changes, package downloads or deployment. The [measurement artifact](groq-tokenizer-bound-2026-09-08.json) retains Node and isolated workerd results. The original [tokenizer investigation](groq-full-tokenizer-2026-09-08.md) and [P6 release measurement](records-protocol6-release-measurements-2026-09-08.md) remain historical checkpoints.

The tokenizer now admits at most **32,000 UTF-8 bytes in total**, **24,000 UTF-8 bytes in each component**, and three components. SYSTEM, USER and serialized schema remain separate, complete inputs. A violation returns the existing full-byte fallback before initializing or invoking the encoder; no prefix is substituted for the prompt. Lazy initialization, the pinned encoder, provisional framing, output maximum and quota policy are unchanged by this patch.

The earlier 24 KB combined guard was our local protection against costly BPE inputs, not a tokenizer or provider requirement. Increasing only the combined allowance lets a larger normal context fit while preserving the largest individual component previously admitted. A single 32 KB component remains outside the new limit.

## Exact P6 regression and quota boundary

The frozen synthetic stress case contains three full document revisions and two incoming commissions. Its job SHA256 matches the earlier measurement:

`481d7bc616327adc8894196bb2bb2f1053b369f2467e987162fdae8947305770`

| Component | UTF-8 bytes | Ordinary tokens |
| --- | ---: | ---: |
| SYSTEM | 6,524 | 1,233 |
| USER | 6,320 | 1,721 |
| Serialized schema | 12,521 | 3,590 |
| Total | 25,365 | 6,544 |

The full count reserves **7,696 tokens**, including the unchanged provisional 128-token framing allowance and 1,024-token maximum output. The old byte fallback reserved 26,519. Under the independently [verified 8,000-token account limit](groq-free-account-readback-2026-09-08.json), the new reservation has 304 tokens of headroom, before any other active reservations. This is admission capacity, not measured provider consumption or a proven bound on provider-added framing.

The regression uses the real SQLite quota ledger. It admits that complete P6 job and preserves its prompt and schema. A second synthetic case adds an ordinary schema description to reach exactly 32,000 bytes. Its reservation is **8,644 tokens**: tokenization succeeds, but the ledger rejects it for request size without creating a reservation. Being tokenizable does not imply quota eligibility.

## Local measurements

The installed `tiktoken@1.0.22` lite WASM and ordinary `o200k_base` ranks are unchanged. All token-ID hashes in the final workerd run matched the Node result. Workerd used an in-memory observation hook for WASM memory; the final guard itself was the actual source implementation. Outbound requests were blocked and their count stayed zero.

| Input | Node median encode time | Final workerd host wall time |
| --- | ---: | ---: |
| Exact 25,365-byte P6 job | 2.715 ms | 4.60–4.89 ms warm |
| Same schema, USER padded to the 6,500-byte target | 2.671 ms | 4.38–4.45 ms |
| Normal components totaling 32,000 bytes | 3.085 ms | 4.36–5.13 ms |
| Artificial single ASCII BPE piece, 24,000 bytes | 103.465 ms | 161.35–163.22 ms |
| Artificial pieces of 24,000 plus 8,000 bytes | not separately measured | 181.03–182.60 ms |

The first P6 workerd request, including lazy initialization, took 74.71 ms. Instantiated WASM memory was zero before the first count, then **28,246,016 bytes (26.94 MiB)** throughout the measured cases. The isolated JS bundle was 2,333,127 bytes and compiled WASM was 1,073,364 bytes. These are an isolated benchmark bundle, not the complete runtime deployment size.

For comparison, allowing one artificial 32 KB piece cost 283.71–284.39 ms in the earlier local workerd experiment. The implemented per-component guard rejects it. Twenty-five such unbounded individual pieces took 4.582 seconds of Node process CPU in the comparison experiment; they are not admissible under the final guard.

Host timings include local runtime overhead and are not Cloudflare billed CPU. Node process RSS includes the Node runtime and must not be treated as Worker isolate memory. These observations establish neither a worst case for all Unicode nor the full DO's peak memory while holding world and recovery data. The retained component bound and full fallback remain necessary.

## Scope of the input limits

There is no declared finite maximum for the complete generic job: the contract limits SYSTEM and USER separately to 24,000 UTF-16 units, but does not put a global byte bound on serialized JSON Schema. Those two strings alone can occupy 144,000 UTF-8 bytes; with an empty schema the 144,002-byte example is rejected before encoder initialization under both the old and new guards. It was not sent to the encoder.

The P6 USER target of 6,500 bytes is an overflow flag, not a hard rejection ceiling: essential obligations may be retained beyond it. No schema, obligation, reference or prompt was shortened by this implementation.

## Verification

- Fourteen existing and extended Worker tokenizer tests pass, including the exact frozen P6 job and real SQL admission/rejection.
- Bounds cover 24 KB per component, exactly 32 KB combined, a single extra byte, multi-byte text, four components, lazy/concurrent initialization and complete fallback without mutation.
- Worker TypeScript and changed-file ESLint pass.
- Isolated workerd accepts all five in-bound measured cases, matches token IDs and rejects oversized single/multiple components; zero outbound requests.

Implementation: [tokenizer](../../workers/habitat-runtime/src/providers/groq-tokenizer.ts), [estimator](../../workers/habitat-runtime/src/providers/groq-token-estimate.ts), [regression tests](../../workers/habitat-runtime/test/groq-tokenizer.test.ts), [frozen synthetic fixture](../../workers/habitat-runtime/test/fixtures/groq-p6-tokenizer.json). The audit's temporary executable scripts remain in `/tmp/villa-tokenizer-bound-20260908`; permanent regression coverage and measured results are linked above.
