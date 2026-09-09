# V7 local reasoning comparison

Status at preparation: **not executed**. The harness and its three offline tests are ready. This directory contains no measured result until the operator runs the two authorized requests. Synthetic test envelopes are never saved as research responses.

The comparison reconstructs two exact before-response states from the preserved V7 local ledger and its 62-file source bundle: B's first reply (`index: 0`, sequence 25), followed by L's first turn (`index: 11`, sequence 11). Both archived baseline responses reproduce `deal_requires_open_message`. This is a baseline observation, not a target response injected into the new requests.

Messages, dynamic protocol 3 schema, identity directory, temperature and seed remain byte-for-byte equivalent to each V7 request. Only `chat_template_kwargs.enable_thinking` changes to `true`, and `max_tokens` increases from 1024 to 4096. The 4096 limit includes reasoning and the final answer. This is **not equivalent to the cloud's 1024 output budget** and cannot establish whether a cloud request would succeed.

The server must already be listening on `127.0.0.1:8018`, using the existing Qwen3.6-35B-A3B-4bit model. The harness neither starts servers nor downloads weights. It checks the saved V7 model metadata and original file size/inode/timestamps; weight SHA256 values are inherited from the previous full hash, rather than rehashed for this comparison. Original server-source hashes are checked again.

Run from the Villa-Treny root, one request at a time:

```sh
node scripts/benchmark-society-v7-local-reasoning-probe.mjs
node scripts/benchmark-society-v7-local-reasoning-probe.mjs --run --out /Users/alejandrotreny/Documents/ChatGPT/Villa-Treny/docs/research/model-society-v7-local-reasoning-probe-2026-09-08 --server-pid 14483 --max-new-calls 1
```

Review the first result, then repeat the same run command for the second case. The total cap is two distinct attempt IDs. Each request has a 120-second timeout, with concurrency one. A reservation is durable before HTTP; the raw response is durable before isolated application. Reserved, failed and timeout IDs are never retried. A crash after receiving a response can recover its local validation without another request.

Replay needs no server or PID and makes no HTTP requests:

```sh
node scripts/benchmark-society-v7-local-reasoning-probe.mjs --run --out /Users/alejandrotreny/Documents/ChatGPT/Villa-Treny/docs/research/model-society-v7-local-reasoning-probe-2026-09-08 --max-new-calls 0
node --test scripts/benchmark-society-v7-local-reasoning-probe.test.mjs
```

The ledger retains request provenance, raw response, Warning header, reasoning content, token usage, latency and sampled process CPU/RSS. A schema fallback warning remains visible even if the complete saved dynamic grammar and `applyCapabilityChoice` accept the response. Valid effects apply only to a cloned frozen core and are checked for idempotence. No physical watch, production mutation, cloud request or economic payment occurs merely because a model describes one.

Human review must assess whether B responds to the actual preceding message, whether L negotiates only attainable work, and whether either response invents capabilities or facts. Domain acceptance alone is not semantic success. Two isolated cases cannot demonstrate sustained adaptation or autonomy across 25 residents. The local model has no provider API fee, but uses hardware, memory and elapsed time and is unavailable when the Mac sleeps.
