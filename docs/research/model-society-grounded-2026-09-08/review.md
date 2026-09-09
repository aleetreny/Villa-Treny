# Grounded-turn intervention review

Reviewed 2026-09-08. The immutable [report](report.json), ledger and original responses are unchanged. This was four isolated calls against two exact V4 contexts, with no production mutation and no physical watch. It combined a stronger system instruction, a required initial project, `strict:true`, and different thinking/output settings. It is not a factorial experiment or a statistical ranking of models.

| Context | Configuration | Accounted neurons | Observed result |
| --- | --- | ---: | --- |
| G answering D | Gemma, thinking off, 768 output tokens | 17 | Rejected: `dueWatch:400` violated the minimum 401. The proposed payer and worker were both D, which would also fail domain validation. |
| G answering D | GLM, thinking on, 1536 output tokens | 63 | Output truncated at 1536 tokens; no decision applied. |
| B opening a purpose | Gemma, thinking off, 768 output tokens | 15 | Active private project stored, but its pending `note` action is not executable by B. No message or agreement was created. |
| B opening a purpose | GLM, thinking on, 1536 output tokens | 62 | Output truncated at 1536 tokens; no decision applied. |

The ledger accounts for **157 neurons**. Provider-reported fractions total approximately 154.562; each attempt is rounded up independently. All four have returned usage, so this round has no unknown-usage reservation. Cumulative external research accounting reported by the coordinator is 1,083 neurons, including retained unknown usage from earlier rounds.

Gemma's G response still asserts an unsupported lateness: “You're late, Vashenko.” The available conversation does not establish an appointment or that D missed one. It also treats an inspection request as a paid-work agreement with identical parties and an expired deadline. The local schema rejected the whole response; neither its project, speech nor offer entered the isolated state. Requesting `strict:true` did **not** prevent a numeric schema violation in this observed response, so local validation remains authoritative.

Gemma's B response connects a persistent purpose to the stated wish to be consulted. That is narrower evidence than autonomous action: the goal is generic, no consultation was initiated, and the only step was `note`. The supplied options exposed that verb, while the physical engine permits it only for A. This is an affordance and plan-validation defect in our system, not simply an invented verb by the model. The experiment did not run a physical watch; the accepted project must not be reported as completed work or a successful social process.

GLM used its complete 1536-token output allowance in both samples without a usable final decision. That configuration is unsuitable for the next bounded round. It does not establish that GLM cannot work with another budget or prompt. Gemma is the next implementation candidate because it returned bounded decisions here; these two samples do not establish reliable grounding, negotiation or superiority to Qwen.

The next implementation separates choices from mechanical bookkeeping: the model chooses transfer direction, loan direction, a work role or acceptance of an existing offer; the engine constructs participant IDs and absolute dates, and revalidates available resources and physical prerequisites. This removes a repeated source of malformed deals. It does not verify the truth of dialogue by itself. A further isolated evaluation remains necessary before claiming meaningful bilateral agency.

Provider request controls and rates were checked against the official [Gemma model reference](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/), [GLM model reference](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/) and [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). The observed failures above come from the saved local report, not the providers' capability claims.
