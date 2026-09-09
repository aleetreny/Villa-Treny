# Local Qwen probe — exact V6 B/C contexts

Executed on 8 September 2026 on the existing Apple M5 Pro, 48 GiB machine. This is a two-response feasibility and grounding probe, not evidence of sustained autonomous cognition.

| Actor | HTTP | Local validation | Prompt / output tokens | Wall latency | Schema warning |
|---|---|---|---|---|---|
| B, Bex Ferreira | 200 | `applied` | 1,107 / 167 | 16.016 s | None |
| C, Cato Lindqvist | 200 | `applied` | 1,161 / 165 | 3.011 s | None |

B includes cold model loading: the server reported 7.65 seconds for loading and 5.74 seconds for its generation timing. C used the already loaded model and reported 2.97 seconds. These different timings are retained verbatim, not treated as equivalent measures. Both responses stopped normally below the 768-token output cap. Provider usage is measured by oMLX; its prompt-token accounting is not necessarily comparable to another provider's schema framing.

## Qualitative findings

- **B retained the correct speaker/recipient identity.** The message sent to K addresses Kes. However, the project “Check water levels in the well” uses `inspect` at `well`. Inspection is a walkthrough/logging action, not a water-level measurement. It does not establish that the stated inventory objective can be completed by that step.
- **C retained its own purpose and sent a relevant opening to N.** The project is to draft patient-waking criteria, but its only physical step is `work` at `infirmary`. The defined engine action does not write a document. The message claims a draft is starting, while no document artifact or written criteria were created by this probe.
- Both proposals are structurally and economically admissible. This does **not** mean their physical steps accomplish their prose goals. No consent, payment, work execution or physical watch occurred. The isolated applications created pending projects and opening conversations; balance changes were empty in both cases.

The [identity-prefix comparison](../model-society-local-identity-probe-2026-09-08/review.md) tested two additional responses without changing SYSTEM, schema or source state. It did not resolve the goal/action mismatch.

## Isolation and provenance

The [ledger](ledger.json) retains the exact V6 source job, outgoing request, raw HTTP response, selected response headers, reported usage, sampled CPU/RSS, local receipt, resulting project/conversation and source/result hashes. Each attempt ID was persisted before HTTP; its full response was persisted before applying effects to a cloned in-memory core. Reserved, completed and ambiguous attempt IDs cannot be resubmitted. No production state, clock or cloud provider was contacted.

The server used existing oMLX **0.6.4** and the existing `Qwen3.6-35B-A3B-4bit` folder. Before dispatch, the probe computed SHA-256 for all four weight shards, primary config, weight index, tokenizer files and chat template. Weight files total 20,402,204,271 bytes. It also recorded hashes of four installed oMLX source entrypoints. Additional model JSON files were recorded after the requests in [server evidence](local-server-evidence.json), explicitly identified as supplementary provenance rather than a pre-dispatch check. No model download, installation or quantization was performed.

The model directory is `/Users/alejandrotreny/.omlx/models/mlx-community/Qwen3.6-35B-A3B-4bit`. The separate server was launched with:

```sh
/Users/alejandrotreny/.omlx/bin/omlx serve \
  --base-path /tmp/villa-omlx-probe \
  --model-dir /Users/alejandrotreny/.omlx/models/mlx-community/Qwen3.6-35B-A3B-4bit \
  --host 127.0.0.1 --port 8018 \
  --max-concurrent-requests 1 --memory-guard safe \
  --no-cache --no-hf-cache --log-level info
```

At the end of the four local requests, PID **14483**, tool session **79292**, was healthy and listening only on **127.0.0.1:8018**. It was left running for the separately authorized local follow-up work. The previously running oMLX process was not changed. This local process is optional capacity while the Mac is awake; it is not a substitute for cloud continuity.

## Actual memory and verification

After the two baseline requests, `vmmap -summary 14483` reported a **20.3G physical footprint**, **21.6G process-lifetime peak** and **19.4G graphics residency**. After all four requests it reported **20.4G**, a **21.9G peak**, and **19.4G graphics residency**. These are the tool's original units. They are stronger evidence than `ps` RSS, which omits most Metal allocations. The sampled CPU maximum was 796.3% during the cold request; it is an observation of a multithreaded process, not a throughput or concurrency guarantee. There was no sustained-load or thermal benchmark.

[Offline verification](offline-verification.json) reconstructed both original contexts and replayed the actual receipts with zero HTTP calls, unchanged source states and unchanged ledgers. The scripts' offline tests cover source hashes, exact messages/schema, timeout non-retry, reservation-before-dispatch, receipt-before-effects, no mutation, duplicate application rejection and tampering. The frozen V6 helper verifies every archived source against the original ledger, validates installed Vite/Zod versions and removes its temporary source overlay after use. The real inference harness remains bound to its original source hashes and must not silently adopt later core changes.

Official capability references: [oMLX 0.6.4](https://github.com/jundot/omlx/tree/v0.6.4), [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B), [existing MLX conversion](https://huggingface.co/mlx-community/Qwen3.6-35B-A3B-4bit). `enable_thinking:false` and strict JSON-schema output were requested. oMLX can emit a `Warning` header when schema compilation falls back to instruction-only handling; no such header occurred in these requests. Domain validation still remained mandatory.

User review and any decision about production integration remain pending. These four samples establish local feasibility and expose remaining semantic errors; they do not establish broad model superiority, reliable tool grounding or long-term society behavior.
