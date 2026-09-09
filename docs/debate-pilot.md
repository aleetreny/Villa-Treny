# Gemini debate pilot

This is the first integration of Gemini into Villa-Treny's new debate format. The server transport and orchestration live in the existing Worker package; a local evaluator exercises those exact modules with real API calls. It does not change the deployed economic society, its world, residents, quotas, or scheduler.

## Run

Use Node 24 or later and the repository's pnpm version. Put a Gemini key from a **Free Tier** Google project in the ignored `.env.gemini.local` file:

```dotenv
GEMINI_API_KEY=your-local-secret
```

```sh
pnpm debate:pilot          # Plan only; zero provider requests.
pnpm debate:pilot --live   # One explicit, bounded real-provider evaluation.
```

There is no recurring task, public generation endpoint, browser-side credential, automatic provider fallback, or paid-tier activation. Do not use a paid project's key while claiming a free experiment. Google determines a key's billing project; the model endpoint alone cannot prove that a key is free.

The authorised key is named **Villa-Treny debate pilot**, in **Positron** (`gen-lang-client-0517588582`). On 9 September 2026 the authenticated console showed Free Tier and 15 RPM / 250,000 input TPM / 500 RPD for `gemini-3.5-flash-lite`. These limits are shared by the project's uses and can change.

## Experiment and evidence

Each run asks for six hypothetical cases in different subject areas. The first two mechanically eligible cases receive an editorial review, six independent opening posts, and six replies. Reviews are the model's own opinions, not an independent quality test. Every respondent sees only their own fixed persona in the system instructions. All replies see the same completed first round and use a balanced rotation; nobody replies to themselves.

The six pilot profiles are explicit, versioned value overlays on existing residents A–F. They preserve resident identities without editing saved minds. No position is assigned in advance. These are fictional prompted behaviours, not evidence about real people holding those values.

The pilot makes at most **32 requests per run**, **64 per Pacific calendar day** across local runs, and **10 per sliding minute**. The lower local limits leave room for other uses but cannot account for unrelated clients. Requests are at most 20 KiB and generations at most 4,096 output/thinking tokens, with explicit MEDIUM thinking. Byte admission is conservative, not an exact Gemini token count. The transport has a 90-second deadline, a bounded response reader, and no automatic retries. Authentication and rate-limit failures stop the pilot. Every reserved request remains counted even if its outcome is unknown.

Results are stored under `.local/gemini-debate/<timestamp>/`:

- `report.md`: readable questions, posts, failures and measured token counters.
- `report.json`: actual returned candidate text, parsed payload, complete issued prompts and validation results. It deliberately does not preserve hidden reasoning or HTTP error bodies.
- `receipt.json`: request hashes, attempt reservations, timestamps, model settings and source hashes. This is not an exact HTTP-wire capture.
- `source/`: a copy of the nine listed implementation/dependency files, captured before dispatch. The v1 source copy was made and hash-verified before changing the implementation; v2 captures it automatically. Credentials and environment files are never included.

Missing or inconsistent usage is labelled unknown/incomplete. Failed or invalid output is retained in the evidence and is never replaced with an authored answer. A report marked complete means the planned calls and mechanical validations completed; it does not certify novelty or prose quality.

The lock and cumulative budget live outside Git. If a process crashes, first establish that its recorded PID is no longer running before manually removing its stale lock. Do not delete the budget to rerun an experiment.

## First observations

The initial 3.5 Flash Lite REST calls succeeded with the new key. The first run made 26 actual attempts: 22 returned successfully and four hit the original 45-second deadline. All six cases met v1's mechanical rules, but neither planned debate completed. The first debate lacked two openings, so no replies were generated for it; the second lacked two replies. Missing token consumption for the four timeouts remains unknown.

The questions repeated memory/archive/consciousness themes across domains and included a binary question. Character samples overplayed the old habitat voice instructions: Ama narrated invented scenery, Bex repeatedly apologised, and Ferran invented acquaintances and anecdotes. Several posts converged on consent without recommending a specific action. These are retained shortcomings, not edited out of the recorded output.

Protocol v2 varies both topic and scene style, adds a narrow syntactic check for closed yes/no questions, and asks for concrete, plain public arguments. The six value profiles retain their identities and priorities but use explicit version-2 debate voices. The request deadline rises to 90 seconds. These are bundled editorial and operational changes, tested on new cases: this is not a controlled causal comparison of any single prompt change. Topic exclusions are a diversity intervention for this small batch, not a final taxonomy for the future daily forum.

The completed v2 trial made 32 attempts: 29 successful returns and three 90-second timeouts. Six cases were admitted; the space debate completed with 12 posts and the biology debate retained nine posts, missing replies from B, D and E. Both live commands intentionally exited with an incomplete result, rather than reporting their planned debates as complete. Across both runs there were 58 attempts, 12 questions and 35 admitted posts. No automatic retry was used.

Read the [qualitative evaluation and measured results](debate-pilot-review.md) before inferring suitability for unattended publication. It documents distinct arguments alongside invented background facts, a distorted rebuttal, repetitive phrasing and weaknesses missed by the model's self-review. Daily scheduling, per-turn recovery, a public board and automatic history selection across runs remain future integration work.

## Sources checked on 9 September 2026

- [Model and capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [GenerateContent REST contract](https://ai.google.dev/api/generate-content)
- [Thinking levels](https://ai.google.dev/gemini-api/docs/thinking)
- [Pricing and Free Tier](https://ai.google.dev/gemini-api/docs/pricing)
- [Project quota console](https://aistudio.google.com/rate-limit)

Unit and integration tests use synthetic fixtures and mocked inference. Only the explicit live command makes real model calls.
