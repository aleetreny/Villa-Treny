# Fixed local P7/P8 consent-to-effect diagnostic

**Status: completed.** Six real local replies applied; neither protocol created an agreement or caused Y to perform the offered work. The [final mechanical review](attention-chain-mechanical-review-2026-09-09.md) and [separate semantic review](release-2026-09-09/attention-chain-independent-semantic-review.json) retain the negative result. The owned local server has been stopped.

The [evaluation plan](attention-causal-evaluation-plan-2026-09-09.md) is implemented in `scripts/benchmark-society-attention-chain-local.mjs`. The [preparation receipt](release-2026-09-09/attention-chain-offline-preparation.json) contains its immutable policy, source binding and initial request hashes. It records preparation and synthetic validation only. The subsequent real run is documented separately from those synthetic validation fixtures.

The source is the complete revision322 backup with SHA256 `832c560405d05fd67a21fcdb3196c5953475c17b3ae6871f7c04810283514779`. Preparation used the strict recovery verifier and Society4 reader. The exact backup bytes, source bundle, first prepared requests, model provenance and initially empty ledger were saved outside Git before any HTTP. Existing model hashes were checked against their recorded file identity, sizes and timestamps; metadata/tokenizer and server-source hashes were verified. The local server restart did not require changing that provenance.

The fixed sequence is P7/Y, P8/Y, P8/T, P7/T, one native physical watch in each arm and a zero-inference control, then P7/Y and P8/Y. The control retains W's pre-existing publication. Both protocols use separate evolving clones, actual private preparations, their own original contract, and independently produced responses. No synthetic response or expected outcome is available to the live dispatcher.

Limits are six calls total, one at a time, 1024 output tokens, 120 seconds per request and 65,536 bytes for the complete serialized request. The byte ceiling is not a tokenizer or server-context guarantee. Seeds are paired by opportunity; temperature is0.3 and thinking is disabled. A transport failure, invalid response or unresolved reservation is never retried. A preparation failure aborts as an incomplete run before another HTTP request. Rejecting or postponing the offer is legitimate.

Seven Node test groups pass, including genuine P7/P8 acceptance followed by native work and settlement; real rejection; unsupported completion speech without an agreement; preservation of W's publication in the control; the crash windows before dispatch and before application; read-only replay; altered clocks/jobs/raw responses; wrong-model rejection; full-request overflow; and public usage projection. The authored responses are clearly labelled in `scripts/fixtures/attention-chain-synthetic.json`. These tests demonstrate harness mechanics, not agent autonomy. An independent reviewer also ran all seven tests successfully. ESLint passes for both new script files.

The private directory is:

```text
/Users/alejandrotreny/Documents/ChatGPT/habitat-extraction-backups/attention-audit-20260909/attention-chain-paired-20260909
```

With the repository as working directory and Node24+ on PATH, the following command replays only saved results, creates no reservation and needs no server:

```sh
node scripts/benchmark-society-attention-chain-local.mjs --run --private-out /Users/alejandrotreny/Documents/ChatGPT/habitat-extraction-backups/attention-audit-20260909/attention-chain-paired-20260909 --max-new-calls 0
```

The completed live run used the following explicit invocation; it is recorded for reproducibility, not as authorization to run another experiment. Its server PID must identify the owned oMLX process listening exclusively on127.0.0.1:8018. There are no credentials, remote endpoints, model downloads or server-start operations in the harness. Reuse the same directory to preserve all spent reservations. Do not prepare a second directory to repeat a failed request or obtain a preferred answer.

```sh
node scripts/benchmark-society-attention-chain-local.mjs --run --private-out /Users/alejandrotreny/Documents/ChatGPT/habitat-extraction-backups/attention-audit-20260909/attention-chain-paired-20260909 --server-pid 10637 --max-new-calls 6
```

PID10637 was stopped after these six calls, with exit143 and port8018 free; it is not a reusable server identity for future runs. The live command remains bound to the source files and model provenance frozen at preparation. A mismatch fails closed.

This is one local Qwen trajectory per protocol, focused on voluntary work at0cells. T and Y are already a legal pair in P7. It does not isolate channel capacity, estimate population-level social quality, validate production scheduling/fairness, or establish the behavior of a Cloudflare or Groq model. An accepted obligation, fulfilled work, incremental production and accurate recognition are separate outcomes. The source's older gift or W's already-pending publication cannot count as a new consequence of these decisions.
