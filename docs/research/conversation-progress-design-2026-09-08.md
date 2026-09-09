# Conversation progress without a second thinking call

The smallest useful change is **evidence-based working memory for the current exchange, followed by an explicit choice to answer, act, decline or finish**. It should use the existing single resident call and existing executable operations. Do not start with a second model judging progress, a scripted plot, mandatory agreements or a reward for producing more artifacts.

This is a design proposal against the 8 September 2026 P6/SQL10 implementation, not an implemented correction or a tested improvement. It revisits five primary papers selected from the existing 47-source research ledger. The reported twelve-pair loop is the operational problem to explain; the code inspection below identifies plausible mechanisms, not a measured causal attribution.

## What the focused literature supports

| Primary work | Demonstrated result or explicit method | Implication for this design; limits |
| --- | --- | --- |
| **Generative Agents**, Park et al., UIST 2023, §§4.1–4.3, 6–7 and appendix A [1] | Relevant memories, reflections and plans condition future behavior. The authors explicitly describe repeated lunches when choosing only a plausible immediate action. Their component ablations concern believability; the end-to-end demonstration has 25 agents over two simulated days. Reflection can cite prior evidence, and planning decomposes the near future rather than every future moment. Retrieval failures and fabricated memory details remain. | Retain the last decision and its observed outcome, rather than repeatedly reconstructing an intention from the latest sentence. This is our adaptation, not a paper-tested cure for Villa. Do not import its multiple planning/reflection calls or proposed joint dialogue batching: the latter would violate separate voices here. |
| **Concordia**, Vezhnevets et al., December 2023, §§2.1–2.2 [2] | Components build compact working context; attempted actions are distinct from environment-resolved events. Grounded variables can use ordinary code, and invalid attempts can return observations. The framework permits component updates at different cadences instead of requiring every observation to cause an action. | Derive a compact outcome component from the existing authoritative engine and access rules. Do not add an omniscient LLM game master or treat narrated action as execution. The paper describes an architecture and examples, not a controlled measurement that this particular component prevents repetition or fits a free quota. |
| **SOTOPIA**, Zhou et al., ICLR 2024, §§2–4 [3] | Separate actors have private goals and can speak, act, remain silent or leave. Evaluation distinguishes goal achievement, believability, knowledge, secrecy, relationships, norms and material benefit. Some model pairs fail to answer or move an exchange forward; a weaker partner can also impede a stronger one. Static benchmark ability does not guarantee interactive performance. | Ending or refusing an exchange can be sensible progress. Count responding to the actual question and avoiding fabricated evidence separately from economic effects. Villa's engine can verify execution; it cannot automatically certify the quality of every social resolution. The paper's model results do not rank the currently deployed OSS models. |
| **SOTOPIA-π**, Wang et al., ACL 2024, §§3–5 and evaluation limitations [4] | Behavior cloning and self-reinforcement use filtered interaction data. The authors report social-goal gains but also show that model evaluators can overestimate specifically trained agents compared with human judgments. | Do not let the same actor declare itself successful, or use an extra LLM score as authority to mint progress, trust or payment. Use mechanical evidence plus a separate review rubric. This work studies training, not a prompt-only fix; no training or extra judging call is proposed here. |
| **Port of Mars**, Slumbers, Leibo and Janssen, June 2025, §3 and appendix B [5] | The authors report inconsistent play with either indiscriminate full histories or insufficient history, and retain round summaries plus persistent plans. Trade proposal and acceptance are separate stages. However, their planning-meeting dialogue is generated for all participants in one call. | Preserve a resident's concrete purpose and recent consequences rather than enlarging the transcript indefinitely. The consistency observation supports this choice but is not a quantified Villa ablation. Do not import the joint meeting generator, automatic communal agreement or the study's imposed goals. |

None of these five papers establishes that more messages imply a healthier society, or that detecting a repetitive string licenses the system to accept an offer. Their results support continuity, grounded consequences and multidimensional evaluation; the exact intervention below is an engineering inference.

## The local failure is more specific than missing memory

The implementation already retrieves memories by importance, relevance to the project/latest message and recency. It includes the existing project, incoming offers and obligations. Simply adding “memory” again would duplicate functioning machinery. However, four inspected choices can sustain an exchange even when nothing useful is changing:

1. `prepareSocietyTurn` initially includes six recent turns, then removes older transcript entries until only one remains if context is large. The actor can lose its own most recent request while retaining the counterpart's latest request. A count of omitted turns does not recover that missing decision. [Turn preparation](../../src/lib/habitat/society/turn.ts).
2. A person can occupy only one open conversation, which lasts up to 24 hours or 16 turns unless explicitly closed. The schema requires a message for an active reply. Thus an empty social plan plus an open exchange is not a true silent waiting state; the next scheduled review can still become another message to that partner. [Types](../../src/lib/habitat/society/types.ts), [choice schema](../../src/lib/habitat/society/choice.ts), [turn application](../../src/lib/habitat/society/turn.ts).
3. Instructions say to ask one relevant question or propose a concrete next step. They already forbid repeating previous sentences, but do not equally foreground a complete answer, a grounded refusal or finishing the episode. A sequence of locally relevant questions can comply with that preference while making no progress. [Instructions](../../src/lib/habitat/society/instructions.ts).
4. The scheduler alternates eligible replies and overdue/observed-event reviews. New speech advances successful-review timestamps, even when it adds no executable state. This preserves fairness by person, but successful parsing is not proof of progress within a pair. [Scheduler](../../workers/habitat-runtime/src/society-scheduler.ts).

The public [P6 local review](records-protocol6-local-review-2026-09-08.md) supplies concrete counterexamples. In BK, statements about attached and reviewed logs did not create a readable artifact. In AU, A created a private draft, while U legitimately received no access; U's later claim of a separate log was still only speech. All six AU/BK requests had empty accessible draft lists with zero omitted drafts. This was not accidental hiding of an existing readable document. The newer instructions already distinguish a claim of attachment from document access; their effect on loop length remains unmeasured.

Conversely, the [Quim→Gita gift receipt](release-2026-09-08/quim-gita-gift-acceptance-receipt.json) records a real independent acceptance and conserved transfer. An intervention must not mark every conversation unsuccessful merely because it contains no paid work. The [U80 private draft](release-2026-09-08/u80-natural-retry-success-receipt.json) and [Q81 public question](release-2026-09-08/first-groq120-live-receipt.json) are also different outcomes: one changed authored state, the other did not perform the repair it discussed.

## Proposed first implementation

### 1. Pin the exchange and its consequences

Add a pure context projection, tentatively `conversationProgress(state, world, actor, now)`. It uses no model, network request or embedding service. It supplies:

- The exact last incoming turn and the actor's exact last turn, each with its existing ID. Reuse the transcript fields rather than duplicating their text. If either is absent, say so; never manufacture an earlier question.
- The actor's current pending step and its last available physical outcome, including failure or urgency interruption. A queued repair must say that its physical slot has not run; a visit or routine stock note must retain its actual effect.
- Current incoming terms and existing commitment status through the already-authorized offer/record views. A new offer ID with identical parties and terms is not acceptance. Any changed amount or deadline remains a genuine term difference, even when the prose sounds similar.
- Readable document IDs, exact hashes and grants, with existing omission counts. The author can see an unshared own draft and its audience. Another person sees only their authorized list; an empty list must never reveal that the counterpart owns a private draft.
- A compact list of newly observable events since the actor's previous turn, such as an actual share, refusal, failed step, payment or publication. When evidence has been evicted, label the interval incomplete; do not assert that nothing happened.

Reserve both recent voices and the current blocking outcome before older general memories in the existing compaction order. Keep current obligations and required evidence intact. This changes retrieval priority, not the truth of memories. The proposal targets at most **512 additional UTF-8 bytes of metadata**, excluding the already-existing turn texts; this is a design bound, not a measured final provider cost. Do not clip an exact quotation or a draft to meet it. Record omissions and let the existing full-request admission guard decide whether the complete job fits.

Initially derive this view from existing records; no new canonical state or migration is necessary. Stable event IDs, author ownership and byte-preserving source references remain authoritative. Do not label a transcript claim “resolved” merely because a lexical heuristic recognized “sent,” “done,” “yes” or “thanks.”

### 2. Ask for a decision appropriate to the actual stage

Replace the broad question-or-proposal preference for newly prepared jobs with concise stage guidance. Candidate wording, not yet a production prompt:

> Answer the latest message using the exchange and recorded outcomes. If you already asked for this and nothing relevant changed, do not repeat the request. You may provide the answer, perform an available operation you choose, explain what is missing, decline, or finish the exchange. If waiting on a queued action or an unavailable capability, name that limit instead of claiming completion. A meaningful social answer need not create a deal, document or physical task.

Use the existing fields. If the actor chooses to provide a draft it owns, the real `share` operation must accompany the decision; speech alone grants nothing. If it chooses a repair or publication, the existing plan/slot rules apply. If it has answered and wishes to leave, it can use existing `message.close:true`. Closing ends the conversation and expires still-open unaccepted offers under current rules; it is not acceptance, debt forgiveness or satisfaction of an active agreement. Do not suggest closing as a shortcut around an incoming offer's separate decision.

This leaves genuine uncertainty, negotiation, rejection, friendship and private writing available. It does not require a physical task to justify a social purpose. It also does not create a manuscript, medicine, measurement or object that the engine lacks.

### 3. Instrument before adding an automatic scheduler penalty

Add offline/telemetry classification of exchanges, not a live model critic. Distinguish (a) an authoritative domain change; (b) speech or an explicitly authored interpretation; and (c) an observed physical result. A new claim, appraisal, project replacement or fresh offer ID must not automatically reset a “progress” counter. Deduplicate identical content hashes and compare exact economic terms, not just IDs.

A normalized repeat detector can flag review candidates using the actor's earlier turns, repeated offered reference IDs and unchanged visible dependencies. Its labels must say “possible repeat” or “no recorded consequence in the retained window.” Paraphrase detection is imperfect, and a repeated question can be justified after misunderstanding or a failed transmission. **Do not reject a valid turn, reduce money/trust, force closure, or deny the next speaker based on this heuristic.**

Do not add an automatic cooldown in the first patch. The active-reply requirement and single-conversation occupancy make a naive cooldown capable of trapping a person, hiding a valid refusal, or letting an offer expire before its counterpart can answer. If the context-only intervention leaves persistent loops, the next separate design would be an explicit actor-chosen pause/private-review operation with bounded wake conditions. That requires a versioned contract and careful expiry/occupancy semantics; it must not silently reinterpret pending P6 jobs. This is a known limitation of the smaller first implementation, not an already-solved scheduling feature.

## Case-specific expected behavior

These are evaluation criteria, not injected dialogue or required model outputs.

| Existing case | What useful progress could look like | What must not count |
| --- | --- | --- |
| **B/K logs** | The actual author creates/shares a chosen exact revision; the reader discusses the received text. Alternatively a person identifies the missing artifact or declines. | Saying attached/reviewed while the authorized draft list is empty; rewarding a new appraisal as proof of delivery. |
| **A/U writing** | The author notices an own private draft and chooses whether to share it, keep it private, revise it or end the exchange. The other person can acknowledge absent access without learning private existence. | Automatic sharing; inventing paper/ink inventory, a material loan or the other person's private draft. |
| **N/C medical criteria** | An attributed proposal is drafted or debated, a concrete unknown is acknowledged, or the discussion ends without a conclusion. | Treating authored criteria as a verified diagnosis or mandatory medical rule; inventing measurements to make the conversation advance. |
| **Q/G repair** | A completed answer relates to an actual recorded outcome or pending slot; a plan/offer is chosen only if relevant. | A question becoming a repair, a second physical action in the same watch, or inferring consent from polite acknowledgment. |

## Quota and implementation scope

There is still one independently sampled voice per scheduled opportunity. No extra reflection, planner, summarizer, reranker or judge call is introduced. Pure projection examines bounded conversation/history data; normal provider accounting, immutable requests, rejection diagnostics and old-envelope replay remain unchanged. The scope is a pure projection module, preparation/compaction changes, a short instruction replacement for new jobs, and tests. Existing actions, records/economy permissions, physical clock, UI and sprites do not need redesign.

The deployed limits remain 8,000 Cloudflare runtime neurons per UTC day and separate Groq allowances of 200,000 tokens per rolling day/model, each with its own 8,000-token minute and request ceilings. They are not a pooled 400,000-token allowance. At Q81's one observed cost of 6,036 actual tokens, 200,000 tokens would cover **33 such responses per model** in an otherwise unused window; at its 6,887-token maximum, only **29 complete reservations** fit before any settlement releases capacity. Neither arithmetic result is a daily forecast: contexts, output, failures, retained maxima, pacing and other organization usage vary. U80's 116-neuron successful call is one different input/provider, not a representative mean. [Verified model windows](release-2026-09-08/p6-refs-live-status.json), [Q81 receipt](release-2026-09-08/first-groq120-live-receipt.json).

For 25 people, one six-hour review per person already means 100 daily opportunities, before extra back-and-forth. Repetitive exchanges therefore have a material opportunity cost, but no person should be denied first coverage to make an aggregate “progress” ratio look better. Measure complete new jobs through the existing tokenizer and Cloudflare request mapper before release; the provisional Groq framing allowance remains provisional. The 512-byte metadata target does not guarantee an 8,000-token admission, and preserving the two recent voices can increase cost in contexts that previously dropped one. Show both effects rather than claiming free memory.

## Acceptance and evaluation

First require zero-inference regressions:

1. Last self/incoming turns survive ordinary compaction as a pair; overflow is explicit. Replay of an old prepared job keeps its original input and schema.
2. Private unshared drafts and reference IDs never enter another actor's view. A share exposes only the exact authorized revision.
3. A claim or repeated offer cannot become acceptance, publication, payment, completed work or a cleared debt. Identical terms with a new ID remain a proposal; genuinely changed deadlines remain visible.
4. Queued, executed, failed and urgency-interrupted steps remain distinct; pending publication consumes no second action and carries no completed effect.
5. A useful purely social response, a refusal and a chosen closing remain legal. No heuristic repetition score changes money, feelings, authority or speaker order.
6. Evicted history cannot support a false assertion of “no change.” The pure projection makes no model request and preserves existing quota/lease checks.

Then pre-register a small fixed comparison before any new inference: four exact contexts covering the table above, each with current control and the proposed context/instruction treatment. This is **eight initial responses**, no retries or search-until-agreement. If continuity is evaluated, predeclare the same maximum additional legal replies per branch; do not choose only the branch that negotiated. The general objective already covers bounded local evaluation; the remaining steps are implementation, source verification and freezing the plan, not another user permission request. No calls are part of this research note. Because two prompt components change, a favorable result supports the combined intervention, not a single causal attribution.

Report denominators per pair and per person: valid/applicable replies; whether the actual preceding question was answered; materially repeated requests; unsupported execution/access claims; chosen closures/refusals; actual artifact grants; exact offers/acceptances; and subsequently observed physical delivery/payment. Keep voluntary zero-cell work separate from paid performance. Count callbacks and settled tokens/neurons, including rejected attempts. Quota waiting is not a model failure, and a chosen “no” is not an economic failure.

A separate blinded human review of the small saved public exchanges would strengthen semantic evidence. If only assistant review is available, label it as such and retain disagreements. Schema acceptance, an LLM score, more dialogue or a lower repeat count alone cannot satisfy the goal. The practical next step is this bounded context-and-instruction patch plus the offline tests; broader institutions, additional model calls and forced economic scarcity are not justified by the evidence here.

## Primary sources

All five were revisited on 8 September 2026. Derived source summaries above are deliberately narrow; none is a measured result for Villa-Treny.

1. Joon Sung Park, Joseph C. O'Brien, Carrie J. Cai, Meredith Ringel Morris, Percy Liang and Michael S. Bernstein. **Generative Agents: Interactive Simulacra of Human Behavior.** UIST 2023; arXiv v2, 6 August 2023. [Full paper](https://arxiv.org/html/2304.03442v2), especially §§4.1–4.3, 6–7, appendix A.
2. Alexander Sasha Vezhnevets and colleagues. **Generative agent-based modeling with actions grounded in physical, social, or digital space using Concordia.** December 2023. [Full paper](https://arxiv.org/html/2312.03664v1), especially §§2.1–2.2. The recommendation uses the documented component/outcome boundary, not the paper's interpretive neuroscience argument.
3. Xuhui Zhou, Hao Zhu and colleagues. **SOTOPIA: Interactive Evaluation for Social Intelligence in Language Agents.** ICLR 2024; arXiv v2, 22 March 2024. [Full paper](https://arxiv.org/html/2310.11667v2), especially §§2–4 and interactive failure examples.
4. Ruiyi Wang, Haofei Yu, Wenxin Zhang, Zhengyang Qi, Maarten Sap, Graham Neubig, Yonatan Bisk and Hao Zhu. **SOTOPIA-π: Interactive Learning of Socially Intelligent Language Agents.** ACL 2024; arXiv v3, 25 April 2024. [Full paper](https://arxiv.org/html/2403.08715v3), especially §§3–5 and evaluator limitations.
5. Oliver Slumbers, Joel Z. Leibo and Marco A. Janssen. **Using Large Language Models to Simulate Human Behavioural Experiments: Port of Mars.** arXiv v1, 5 June 2025. [Full paper](https://arxiv.org/html/2506.05555), especially §3 and appendix B.3–B.6.
