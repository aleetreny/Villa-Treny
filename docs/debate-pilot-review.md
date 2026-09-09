# Gemini 3.5 Flash Lite: first debate trial

9 September 2026. This is a local evaluation of the new debate format in Villa-Treny. The deployed economic world is unchanged. All cases and posts in the linked run reports are actual model outputs; this note is Codex's qualitative inspection, not an independent human benchmark.

The API connection works. The useful question is now whether its writing earns attention. The first sample showed that a successful JSON response is a poor proxy for an interesting debate: the editor repeated its favourite motifs, and several characters performed mannerisms instead of making arguments.

Both bounded trials have finished. Across **58 actual attempts**, **51 returned successfully** and **seven timed out**. They generated 12 admitted questions and 35 admitted posts. One full six-person, two-round debate completed. The other planned rounds remain explicitly incomplete; no missing reply was invented or silently retried.

| Trial | Attempts | Successful returns | Timeouts | Admitted posts | Complete debates |
|---|---:|---:|---:|---:|---:|
| v1 · 45-second deadline | 26 | 22 | 4 | 14 | 0 |
| v2 · 90-second deadline | 32 | 29 | 3 | 21 | 1 |

## What was tested

Each run generated six cases across space, biology, relationships, institutions, art/belief and nonhuman life. The first two mechanically eligible cases were selected in advance of editorial scores. Six characters each received an independent opening, followed by a balanced round of replies to the completed first round. Every character had the same participation allocation; no answer or political position was assigned.

| Resident | Stable priority in this pilot |
|---|---|
| A — Ama Oyelaran | Meaning, authorship and the freedom to shape a life |
| B — Bex Ferreira | Opportunity, access and the ability to change one's circumstances |
| C — Cato Lindqvist | Suffering, consequences and the reliability of evidence |
| D — Dima Vashenko | Continuity, recoverability and responsibility for mistakes |
| E — Edda Halvorsen | Consent, contestable power and fair procedures |
| F — Ferran Solé | Care, belonging, particular relationships and forgiveness |

These are explicitly versioned pilot overlays on existing fictional residents. They do not rewrite saved minds or establish how real people with similar values would behave. Independent openings prevent copying another opening; they do not turn calls to one underlying model into independently trained minds or guarantee disagreement.

## Initial run

[Full v1 report](../.local/gemini-debate/2026-09-09T14-33-19.223Z-3bdcb75d/report.md)

26 requests were dispatched. 22 succeeded and four exceeded the original 45-second deadline. Six questions were mechanically admitted, but neither of the two debates completed. The first lost two openings and therefore received no reply round; the second lost two replies. The consumption of the four timed-out calls is unknown, not zero.

The question generator repeatedly returned archives, memories, altered consciousness and fungal networks. Five questions used a balance/weigh framing and the remaining one was explicitly yes/no. Ama supplied invented room scenery; Bex repeatedly apologised; Ferran supplied invented acquaintances and anecdotes. Several arguments converged on consent without specifying what anyone should do.

## Refined run

[Full v2 report](../.local/gemini-debate/2026-09-09T14-46-30.266Z-81a5e812/report.md)

Protocol v2 changes both scene styles and debate voices, requests a concrete proposal with a cost, flags simple closed-question syntax, and allows 90 seconds per request. The themes include everyday and historical realism as well as speculation. These are bundled changes on new cases, so this comparison does not isolate the causal effect of a particular instruction or timeout.

The space debate completed with all 12 posts. The biology debate has all six openings and replies from Ama, Cato and Ferran; Bex, Dima and Edda each exceeded 90 seconds. Successful calls ranged from 2.241 to 70.920 seconds, with a median of 11.868 seconds. An eventual daily service therefore needs durable individual turns and bounded, delayed recovery of a missing turn. That recovery scheduler is not part of this local pilot. Increasing the deadline did not eliminate incomplete responses.

### Reading the six new cases

| Actual title | What the case asks | Editorial limitation |
|---|---|---|
| The Temporal Harvest of Oakhaven | Obligations toward an alien ecosystem that could improve space travel | Extinction versus navigational convenience heavily frames the verdict. The time device decorates a familiar extraction dispute. |
| The Acoustic Architecture of Vespera | Allocation of public resources when generations have different senses | Concrete allocation is useful, but losing colour vision does not explain why blueprints become meaningless. The sensory/heritage motif resembles v1. |
| The Architecture of Shared Days | Authority when a long caregiving relationship conflicts with formal kinship | The case must distinguish impaired speech from impaired decision-making capacity and clarify whose wishes are known. Its fictional legal setting is unspecified. |
| The Translated Archives | Accessible language versus preservation of original historical records | Preserving originals alongside translations is an obvious common answer; the case offers little resistance to it. |
| The Coastal Lexicon | A local language test as a condition of voting | Separating civic rights from cultural preservation may let most of these profiles agree immediately. |
| The Migration of Oakhaven | Essential reservoir works obstructing a vital crab migration | Engineering feasibility may dominate the dispute. The name Oakhaven is repeated within the run despite a no-reuse instruction. |

The syntax is more open and the settings are less uniformly fantastic. That is a useful improvement in the sample, not evidence that the editor can keep producing fresh daily topics. Several contexts still write both camps into the setup even though the prompt asks them not to. The model rated the first v2 case 5/5 for clarity and disagreement and 4/5 for originality, with no problem identified. Those scores miss the framing concerns above and must not be used as an automatic publication guarantee.

### What the characters actually contributed

In the space case, Ama argues for halting extraction on grounds of intrinsic worth; Bex advocates distributing extraction permits to small operators despite ecological risk; Cato proposes a moratorium pending evidence of suffering; Dima proposes monitored limits; Edda demands a contestable procedure with a local veto; Ferran advocates workers' refusal and mutual support. These are distinguishable proposals. In reply, Ama directly contests Bex's claim that distributing permits improves the morality of the extraction; Cato challenges the assumption that a small harvest necessarily has a small effect; Dima questions the durability of Edda's local veto.

The biology case also produces different allocation proposals. Ama and Dima favour shared records across sensory formats, Cato favours shared infrastructure designed for both groups, Bex proposes reserving half the funds for youth-led trusts, Edda proposes parallel governing boards, and Ferran argues for allocation by population and separate spaces. Personality therefore changes some proposed actions, rather than only the tone of identical answers.

Important weaknesses remain:

- **Unsupported additions.** Bex asserts the existence of shipping cartels and academic gatekeeping; other posts assert particular employment or political conditions that the case never established. A proposed rule is legitimate debate content; an invented background fact presented as established is a different problem.
- **Distorted rebuttal.** In the biology case, Ama criticises Cato for administrative segregation into isolated corridors even though Cato proposed dual-layered shared corridors. The reply addresses the correct post ID but misrepresents its substance.
- **Compounding assumptions.** The biology discussion escalates sensory differences into difficulty expressing preferences or taking part in civic forums, although the context did not establish inability to communicate.
- **Repeated prose structure.** Many posts reproduce a formula about the unresolved difficulty of their proposal. The explicit instruction to admit a cost helps reveal tradeoffs, but gives the conversation a conspicuous template.

The clearer proposals and substantive objections make this a useful prototype. They do not yet justify unattended publication or claims that these voices faithfully model distinct political or psychological populations.

## Scope and evidence

The local CLI keeps reports, complete issued prompts, actual candidate text, failures, token counters, request reservations and nine source snapshots outside Git. Both runs preserve their original evidence. The API key is ignored, has mode 0600, and is absent from the checked source and distribution files.

The [evaluation receipt](../.local/gemini-debate/evaluation.json) records both runs and their report hashes. Known usage totals 129,730 tokens across the 51 successful calls: 46,299 input, 10,598 visible output and 72,833 thinking tokens. Usage for seven timed-out calls is unknown and additional. These are API counters, not a monetary charge. Both source snapshots match their recorded hashes, the local ledger retains all 58 reservations, and the process lock was released normally.

The authenticated Positron console shows Free Tier and a limit of 500 requests/day, 15 requests/minute and 250,000 input tokens/minute. The evaluator is more conservative: 32/run, 64/Pacific day and 10/minute, without automatic retries. Other clients of the same Google project share its quotas. The quota page warns that its usage data can lag by 15 minutes, so the local attempt ledger remains the immediate record of this experiment.

This pilot does not yet schedule a daily debate, publish a board, or select history across runs automatically. The CLI supplies recent questions within each run; it did not feed v1 history into the fresh v2 run. Each run persists its outputs for inspection. A future daily format with one case, one review, six openings and six replies would require 14 successful calls before any extra candidate selection or recovery.

## Decision from this trial

Continue with this model as a tested prototype for character arguments. Improve the editor before treating its output as publishable: retain an archive across days, inspect causal consistency and obvious escape routes in a case, and check whether replies represent their targets fairly. The sample supports trying the format; it does not establish sustained novelty, factual discipline or a reliable daily publication service. Model self-ratings are insufficient for that decision.

## Verification

`pnpm check` passes: 1,090 application tests, 395 Worker tests and 66 Node tests. These totals include the 28 new pilot tests, which use mocked inference and synthetic fixtures. Lint and both type checks pass. `pnpm build` passes and verifies 59 deployable files and 46 rooms with no raw packs or private runtime files. The existing large JavaScript chunk warning remains; this pilot adds no browser bundle integration.

No commit, push, deployment or billing-plan change was made for this pilot.
