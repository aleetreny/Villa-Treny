# Local Qwen probe — explicit identity variant

Two additional requests on 8 September 2026, after the [exact-context baseline](../model-society-local-probe-2026-09-08/review.md). The existing local model/server was reused. No cloud requests, physical watches or production mutations occurred.

| Actor | Local validation | Prompt / output tokens | Wall latency | Schema warning |
|---|---|---|---|---|
| B, Bex Ferreira | `applied` | 1,287 / 237 | 5.908 s | None |
| C, Cato Lindqvist | `applied` | 1,331 / 153 | 2.601 s | None |

Both HTTP responses were 200 with normal completion and complete reported usage. All requests were sequential and bounded to 768 output tokens and 120 seconds. The warm server's own generation timings were 5.89 and 2.59 seconds.

## Exact experimental difference

SYSTEM, temperature, seed, schema and reconstructed V6 state are identical to the baseline. Only USER is prefixed with this protocol, using **full names exactly as stored in `RESIDENTS.name`**, not an invented or shortened name:

```text
You are Bex Ferreira (B). Speak and choose in the first person as Bex Ferreira.
Available recipients: [only the current message.to.enum IDs, with their exact full names]
Current information:
[the unchanged original USER JSON]
```

The ledger stores the actual prefix and recipient list, not these illustrative placeholders. C receives the corresponding Cato Lindqvist identity. The directory adds identity labels for already offered recipients, not roles, private knowledge, locations, new participants or revised economic terms. Full names are a material detail for any future comparison; a first-name-only prefix is a different variant.

Attempt IDs use `local-identity-probe-v1`, and this output directory is separate from the baseline. The source jobs are retained unchanged, alongside the modified outgoing payload. Neither original request was resubmitted.

## Qualitative findings

- **B correctly identifies both sides:** the message to C begins “Hi Cato, it's Bex.” Its goal refers to consulting Cato about the cold bed, which is consistent with the supplied contact duty. However, its steps are `go` to Infirmary and then `work` there. Work does not perform the intended consultation. The message also asserts Cato is currently in Infirmary; B's supplied contact entry gives Cato's duty, not a current location. That assertion is an inference presented as known information.
- **C correctly addresses Noor (N), but the grounding error persists:** it plans to draft waking criteria through `work` at `infirmary`. That action does not create a written document. The stated private purpose matches its supplied personal concern; it still needs an attainable next step rather than an unrelated physical action.
- Both messages are openings, not fabricated replies to an existing conversation. No consent or payment was invented. Local application created pending projects and conversations; both balance-change lists were empty. No planned physical step was executed.

The explicit prefix did not solve the demonstrated action/goal mismatch. Baseline local responses already retained speaker/recipient identity, so these two additional samples cannot establish that the prefix improved local role consistency. The comparison is small, sequential, and not a statistical ranking.

The [ledger](ledger.json), [machine report](report.json) and [offline verification](offline-verification.json) retain raw evidence. The offline tests check that removing only the recorded prefix restores the byte-identical baseline payload and that every named recipient belongs to the offered enum. Source, receipt and application replay passed with zero HTTP calls. Memory/process observations and the still-local server's PID/session are recorded with the [baseline server evidence](../model-society-local-probe-2026-09-08/local-server-evidence.json).

User review and production integration remain pending.
