# Grounded choices without an extra reasoning loop

Research/design checkpoint: 8 September 2026. This note proposes an implementation and a comparison; neither has been run. It adds five focused primary works to the questions raised by the existing [47-source inventory](source-ledger.json), rather than repeating that survey. Code was inspected read-only. No model request, server start, production change or new resource allocation occurred.

**Recommendation:** first make the existing P6 action/evidence interface causally explicit in a compact, server-generated view. Bind the actor's current operation, its prerequisites, its pending or observed result, and the evidence for that status together. Keep the actual P6 operations, independent consent and one-call cadence. Do not add another broad instruction paragraph or an unbounded ReAct loop. A new action-first wire contract is a separate hypothesis, with separate compatibility and quota costs.

This is a proposal for better selection, not a claim that a factual table guarantees truthful speech. The eight-response failure already shows that a model can ignore available facts.

## What the local evidence does and does not establish

The [preserved comparison](model-progress-local-2026-09-08/domain-and-grammar-review.md) used four actual open conversations, with the same USER, schema, seed, local Qwen model and 1,024-token output cap within each pair. The larger progress SYSTEM produced no demonstrated improvement: eight completed responses, six applied, two rejected, zero closures, documents, agreements or payments. No physical watch ran. Reported usage was 24,469 local tokens; the candidate added 177 prompt tokens per case. These are local results, not a comparison of the production cloud models.

| Case | Observed mismatch | Consequence for this design |
| --- | --- | --- |
| BK | Both outputs thanked Kes for sending material, although Bex had no readable document by the other author. Each separately proposed a 1.5-cell gift. | Distinguish an utterance about delivery from an accessible revision. The gift is a choice, not delivery evidence. |
| CN | Both private draft candidates had 25 title bytes plus 600 body bytes; schema passed but the combined 600-byte domain bound rejected them. | This was a transport/domain constraint gap, not evidence that better planning failed. The later 504-character body marker is a separate correction. |
| IO | Both outputs claimed to start growing, but only proposed one zero-price work unit; neither created a pending personal step. | Display “offer awaiting acceptance” separately from “own action queued” and “action executed.” |
| GQ | Both claimed depleted materials and requested two cells, while the public stock was 26 materials; the existing pending step remained unchanged. | More stock data alone is not the missing capability. Money is not a material purchase, and preserving a step does not execute it. |

These facts come from the [allowlisted semantic replay](p6-progress-comparison-semantic-proof-2026-09-08.json), not private prompts or draft text. All six deals were explicit model output. The served grammar permitted omission of the deal and permitted a closing message without a deal; the exact schemas passed 24 native diagnostic membership checks. Thus compulsory negotiation is ruled out for these schemas. A probabilistic preference induced by their representation is not ruled out.

Two earlier tests prevent an easy but unsupported prescription. [Reordering optional object properties](model-society-v7-deal-order-local-2026-09-08/review.md) changed none of three paired output contents. [P5's ordered decision format](model-society-ordered-choice-local-2026-09-08/review.md) did produce exact-ID acceptance in three selected negotiation states, including one clearer alignment between speech and decision. It changed format and instructions together; all agreements cost zero, none was executed in that comparison, and factual overclaims remained. Neither result establishes that placing an action field first creates useful agency generally.

## Five primary contributions that change the implementation question

The following are selective readings of methods, relevant comparisons and limitations. Dates are first submissions; version links identify the text reviewed. Application to Villa Treny is our inference, not a result reported by these authors.

**1. SayCan — Michael Ahn and colleagues, 4 April 2022.** *Do As I Can, Not As I Say: Grounding Language in Robotic Affordances.* Its skill selection combines language relevance with a learned estimate of whether the robot can execute that skill from the current state. Table 2 reports 84% planning success across 101 mock-kitchen tasks versus 67% without value-function grounding; execution is separately 74%. This is stronger evidence than a tool description alone, but a trained robot skill library and language-option scoring are substantial machinery. We should borrow the separation of relevance and feasibility, not claim its gains transfer to social decisions or import a paid scoring call per option. [Paper, method and Table 2](https://arxiv.org/html/2204.01691v2), [authors' project](https://say-can.github.io/).

**2. ReAct — Shunyu Yao, Jeffrey Zhao, Dian Yu, Nan Du, Izhak Shafran, Karthik Narasimhan and Yuan Cao, 6 October 2022.** *Synergizing Reasoning and Acting in Language Models.* Actions obtain external observations that condition subsequent decisions. The paper also reports a limitation directly relevant here: repetitive thoughts/actions remain a failure pattern. Its HotpotQA analysis finds fewer hallucination failures but more reasoning failures than its chain-of-thought comparison; ReAct slightly trails that comparison on exact-match performance there. External feedback helps grounding, not all reasoning. Villa can deliver a real receipt at the next scheduled opportunity. Copying a multi-call thought/action/observation loop into every three-minute opportunity would add inference and cannot be described as the current budget-neutral architecture. [Paper, §§2–3 and Table 2](https://arxiv.org/html/2210.03629v3).

**3. ReWOO — Binfeng Xu, Zhiyuan Peng, Bowen Lei, Subhabrata Mukherjee, Yuchen Liu and Dongkuan Xu, 23 May 2023.** *Decoupling Reasoning from Observations for Efficient Augmented Language Models.* A planner emits dependent tool requests, workers populate evidence variables, and a solver uses the results. Table 2 reports 9,795.1 versus 1,986.2 tokens for ReAct/ReWOO on its HotpotQA setup; its accuracy measure rises 40.8→42.4, while exact match falls 32.2→30.4. The authors explicitly limit advance planning when the environment is insufficiently known. This supports avoiding repeated full contexts, not a promise of fivefold savings in Villa. A resident cannot precompute another person's consent; the next reply remains a genuine observation boundary. [Paper, §§2–4 and Table 2](https://arxiv.org/html/2305.18323v1).

**4. LLM-Modulo — Subbarao Kambhampati, Karthik Valmeekam, Lin Guan, Mudit Verma, Kaya Stechly, Siddhant Bhambri, Lucas Saldyt and Anil Murthy, 2 February 2024.** *LLMs Can't Plan, But Can Help Planning in LLM-Modulo Frameworks.* This is a position/framework paper: candidate generation interacts with external critics, and any soundness guarantee comes from the relevant verifier. It is not an experiment demonstrating social autonomy or a universal result about every model. The useful distinction is concrete: a verifier can prove that a transfer conserved cells or a plan executed, but cannot prove that an unconstrained personal wish was fulfilled. Our proposal reuses the existing engine as that restricted authority; it does not add a model that judges its own narrative true. [Paper, §3](https://arxiv.org/html/2402.01817v3).

**5. τ-bench — Shunyu Yao, Noah Shinn, Pedram Razavi and Karthik Narasimhan, 17 June 2024.** *A Benchmark for Tool-Agent-User Interaction in Real-World Domains.* It evaluates resulting database state and required communicated outputs, and measures repeated-run consistency rather than success after enough tries. Crucially, the authors acknowledge that a correct final state can still violate a confirmation policy. Its tasks deliberately have a unique expected outcome; Villa's independent residents do not. Borrow separate state-transition and consent audits, not a reward for making all people agree or a single “correct plot.” No small selected sample supports a reliability estimate. [Paper, §3](https://arxiv.org/html/2406.12045v1).

## What P6 already supplies

The relevant implementation is not just prose. [Turn preparation](../../src/lib/habitat/society/turn.ts) supplies own wants, project steps, stock, selected work requirements/yields, exact offers, debts and observations. [Choice decoding](../../src/lib/habitat/society/choice.ts) binds parties and terms; [record preparation/application](../../src/lib/habitat/society/record-choice.ts) binds accessible revisions. [Physical observation](../../src/lib/habitat/society/physical.ts) only finishes steps from trusted engine outcomes and only advances work settlement from matching recorded events. Speech cannot pay wages or publish a document.

The missing distinction is not another synonym for a physical verb. Information about an intended result is distributed across a project, an offer, a work example, a transcript and selected memories. A reader must mentally join those objects and preserve their different time and evidence semantics. That is a plausible source of errors, not a proven explanation of the eight outputs. GQ also demonstrates a possible model limitation even when the prerequisite itself is already visible.

## Proposed first implementation: a causal view of existing operations

Add one versioned prepared-context projection, provisionally `effectView:1`, to newly prepared P6 jobs. This is deterministic data assembly, not a new thinker, another narrative summary or an action chosen on the resident's behalf. Save the exact projection in the existing immutable prepared job. Old jobs replay their original preparation.

Each entry joins an existing object or executable operation with:

- `sourceIds`: exact supplied project-step, offer, agreement, draft, publication or physical-event identifiers;
- `phase`: claim, proposed, accepted, queued, observed, refused or interrupted, derived from the authoritative object that supports it;
- `operation`: the existing P6 path/capability, with exact target IDs where already known;
- `changesNow`: the narrow cognitive effect, such as creating an offer, granting access or queuing a step;
- `changesAtWatch`: the possible later physical effect, with its prerequisites and existing slot/urgency rules;
- `knownStatusAt`: the captured revision/watch; missing or omitted evidence stays explicitly unknown.

Do not infer these links by asking another LLM to interpret a promise. Build them from identifiers, operation kinds and existing state. Start with all of the actor's pending steps/accepted obligations and the active exchange's exact objects; add at most two relevant existing work examples. Preserve omission counts and the full underlying operation language. The table is not a whitelist of social purposes or a ranked reward function. Parameters for a new gift or negotiation remain the resident's choice, subject to the existing validator.

The concrete joins needed by the observed cases are small:

| Subject | What the joined view can truthfully say | What it must not infer |
| --- | --- | --- |
| BK's document discussion | Which shown revisions B can access, their authors and grants; a transcript's delivery statement is a claim. | “Kes has no document anywhere,” “B read it,” or the contents of an inaccessible draft. |
| IO's work choice | Own queued grow step, if one exists; a proposed work agreement instead awaits the other party's acceptance. Growing later changes stock only after execution. | That willingness created a personal plan, reserved communal stock, or performed grow immediately. |
| GQ's repair | The exact existing step and status, relevant current stock and own execution prerequisites. Asking for cells changes none of the material stock. | That a material purchase capability exists, that a queued step has run, or that another resident will pay. |
| CN's authored text | A draft is an authored revision; sharing grants access; publication consumes a physical slot. | Clinical verification, consultation, reading, endorsement or compulsory policy. |

A transcript or authored draft never receives the `observed` phase merely because it describes an event. An observation about receiving a statement proves reception of that statement, not its asserted event. For an object omitted from the displayed window, distinguish “readable but not shown” from “no known readable revision.” Do not expose counterpart balances, private intentions, hidden memory IDs or secret-dependent feasibility. Acceptance still revalidates what a proposer could not inspect.

### The feedback path is essential

After the model's **existing** P6 response applies, retain its actual effect identity and return the corresponding state/receipt on the actor's next eligible turn. An unchanged pending step keeps the same identity. An offer that was never accepted remains proposed. A failed or interrupted physical action returns its engine status. Reuse existing events/memory instead of manufacturing a success sentence or duplicating the world's state.

There is no second call hidden inside this design. The same response can contain an intention and speech, but that speech cannot have observed its own future execution. Keep observer operation status separate from authored speech. Open speech may remain fictional or mistaken; no deterministic matcher can certify all of its meaning.

This first implementation changes **context linkage and retrieval**, not P6's decoder, schema language, world effects or consent. A small static legend can replace duplicated descriptions if measurement warrants it; do not simultaneously deploy the rejected broad SYSTEM candidate. Consequently, a comparison can isolate this data/interface change. It may fail if the model simply does not use the joined data.

## Alternatives and distinct hypotheses

| Hypothesis | Discriminating intervention | What would count against it |
| --- | --- | --- |
| H1: state and consequence are visible but difficult to join | The proposed joined view, with unchanged model, SYSTEM and response language | Continued IO execution claims without a step, or GQ depletion claims despite the linked facts |
| H2: generating dialogue first biases the executable choice | A separately versioned action-first contract; compare against the same joined view | No gain beyond H1, or only more compulsory-looking deals rather than relevant decisions |
| H3: missing post-action feedback sustains a loop | Protect a real receipt/status for the next scheduled turn and compare only states where such a receipt exists | Repeating an already-resolved request despite receiving its exact result |
| H4: the model cannot reliably relate its goal to these effects | Persisting errors after feasible state/effect distinctions are made explicit | Improvement from H1 would weaken this account, but one success would not exclude other model limitations |

H2 is not permission to reinterpret saved P5 or P6 jobs. If pursued, use an explicit new contract/transport version, retain no-operation/refusal/counterproposal, and prove mapping to canonical operations. Mere JSON property order does not ensure generation order. P5's tuple has limited positive local evidence and unresolved provider diagnostic history, so it is not the default next production change.

A full tool-call → engine-result → generated speech cycle would more directly condition speech on execution. It normally needs two model responses, or defers speech to a later opportunity; asynchronous waiting also changes conversation scheduling. That is a materially larger experiment. Another person's decision can never be filled in by a tool simulation. A model-written self-critique or longer hidden reasoning is likewise not an independent factual verifier.

## Cost constraints before implementation becomes inference

The current [verified free configuration](groq-dual-free-account-readback-2026-09-08.json) provides separate Groq OSS120B and OSS20B limits of 8,000 tokens/minute and 200,000 tokens/day per model, plus the existing Workers AI 8,000-neuron runtime allowance. Those are admission constraints, not a common fungible account or guaranteed population throughput. Twenty-five six-hour reviews suggest roughly 100 daily opportunities before conversation demand; three-minute cadence is a spacing floor, not 480 affordable successful decisions.

For scale, [Q81](release-2026-09-08/first-groq120-live-receipt.json) consumed 6,036 actual Groq tokens. A hypothetical 100 equal-cost responses would consume 603,600 tokens, more than the two 200,000-token allowances combined; it is not a forecast of how requests distribute across providers. Doubling calls for tool-result narration is therefore not harmless. Invalid generations still consume quota, and conservative reservations can prevent admission before the nominal balance reaches zero.

The proposal adds no LLM call, generated reflection pass or search over scored candidates. Its target is a token-neutral reorganization: replace repeated state/recipe descriptions with joined entries where possible. This is an unmeasured target, not a claimed saving. Preserve essential obligations, privacy and evidence; do not drop a difficult case to achieve it. If the actual complete input grows, report the exact delta and any lost admission separately from behavioral results.

Before inference, measure all 25 preparations and the fixed active-dialogue cases with the real [Groq estimator](../../workers/habitat-runtime/src/providers/groq-token-estimate.ts) and Workers AI reservation mapper. Count complete SYSTEM, USER and schema, the provisional framing allowance and the unchanged 1,024 output maximum. The tokenizer's [32,000-byte total / 24,000-byte component guard](groq-tokenizer-bound-2026-09-08.md) is not an 8,000-token admission guarantee. Retain full fallback, per-model reservations, settled failed usage, unknown charges and lease checks. No quota increase is part of this design.

## Predeclared comparison and acceptance criteria

First finish offline verification. The new projection must be pure and bounded; retain exact operations, recipients, consent and histories; distinguish private/not-shown/absent data; preserve current pending steps; and survive stale revisions, failed actions and duplicate application. It must not mark completion from speech or infer consent. Test the actual supplied grammar, local decoder and domain separately. Existing CN historical responses remain rejected in their original replay; a current-marker fixture tests the independent size correction.

Then a useful bounded first comparison is the **same four BK/CN/IO/GQ pre-states**, two variants per state, with a predeclared alternating order and no planted continuation. Both sides must use the same current size marker and current baseline SYSTEM; label the changed baseline rather than comparing new CN results directly with the old size failure. Vary only the prepared causal view. Freeze complete private payloads, sources, before-states and sampling before the first request. Retain the 1,024 cap, raw results before application, eight-request ceiling, unknown-outcome policy and zero-HTTP replay. This note does not run that comparison.

Report each case, including refusal, waiting or a decision to preserve a useful step. Do not score acceptance, gifts, document count or closure as inherently better. A truthful social answer can make progress without a transaction; a new contract can be irrelevant. The primary review asks whether the selected operation and the speech correctly distinguish **claim, proposal, pending effect and observed consequence**. Secondary counts are applied/rejected outputs, project/step retention, real access grants, new offers, independent acceptance, executed work and conserved payments. Zero-priced work is not payment.

Any later physical test must be fixed in advance and clearly an isolated forecast from each unchanged after-state. Compare the intended step/event IDs with the one actual engine action, its urgency interruptions and stock/ledger delta; routine activity alone is not evidence the model's proposal worked. A social goal with no physical step is not a failed plan. Do not infer broad goal completion from `steps_finished`.

A first pass merits expansion only if it reduces the specific causal misstatements without a permission/conservation regression, without forcing deals, and within measured free admission. Four matched pairs cannot establish a population success rate or model ranking. If the joined view fails, preserve that result and examine H2/H4 separately rather than lengthening the prompt until one selected agreement appears.
