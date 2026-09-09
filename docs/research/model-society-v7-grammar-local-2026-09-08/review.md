# V7 local: conditional deal grammar, complete 37-call run

The local run completed **37 requests, and all 37 decisions applied**. None emitted a deal. It therefore removes the eight observed malformed-deal failures from this new run, but demonstrates **no offer, accepted agreement or negotiated payment**. Dialogue survives more often; invented observations and poorly connected plans remain. In one consequential case, a false inspection claim now reaches its counterpart and increases that counterpart's trust.

This is an assistant-authored semantic review of all 37 responses against their supplied context and recorded consequences. It is not a human panel, expert evaluation or model ranking. The original [ledger](ledger.json) and [machine report](report.json), including the generated `humanReview: pending` label, remain unchanged. [Analysis metrics](analysis-metrics.json) and [zero-request replay verification](offline-verification.json) are separate evidence.

## Scope, provenance and execution

The existing [V7 harness](../../../scripts/benchmark-society-runtime-v7-local.mjs) ran without modification against the current 62-source snapshot: 25 distinct first opportunities, eight replies selected from actual open conversations, one offline physical watch and four subsequent reviews. It used isolated GENESIS, not any production world or recovery backup. No response was injected or repaired. The source snapshot and full jobs were durable before dispatch; original HTTP responses were durable before application. Duplicate response and physical-observation application checks ran throughout.

The model was the existing local `Qwen3.6-35B-A3B-4bit`, served by oMLX 0.6.4 on a separate loopback process. Sampling, SYSTEM, identity prefix, 1,024-token output cap, `enable_thinking:false`, strict schema request, timeout and concurrency were unchanged. The four weight hashes are inherited from the earlier full measurement; this run checked their size and filesystem metadata, while metadata and server-source hashes were checked afresh. It did not rehash the weight bytes or download a model.

Compared with original V7, the captured source differs in five files: the conditional grammar, the already-present `steps_finished` context label, the already-present treatment of saved legacy action names, the SQL schema version and package test commands. Those differences are enumerated in [execution evidence](execution-evidence.json). The last two do not make the fixture use production SQL. No additional instruction or sampling edit was made for this run. Later contexts naturally differ once an earlier response or application changes; this is not a set of 37 independent paired quality comparisons.

**The captured scheduler predates the subsequently proposed quota-sharing change.** This fixture deliberately schedules its 25 first turns and later slots; it does not test production provider allocation, leases, clock alarms or a daily quota guarantee.

Requests ran sequentially from **13:54:42 to 13:56:32 UTC on 8 September 2026**. Total reported local usage was **55,385 input and 5,036 output tokens**. Every response stopped normally, reported complete usage and had no schema-fallback Warning header. Input reports ranged from 1,277 to 1,727 tokens, output from 89 to 226. Full authored prompt/schema payloads ranged from 9,216 to 17,069 UTF-8 bytes. Local provider accounting is not interchangeable with Workers AI or Groq accounting.

Request latency ranged from 2.024 to 13.072 seconds; the first included cold model loading. Summed request latency was 107.587 seconds. The highest sampled process RSS was 8,842,960 KiB, which is not a complete Metal/unified-memory measurement or a guaranteed peak. The [server log](local-server.log) and execution evidence retain the process details. Only our PID 26381 was stopped afterward; the user's existing server on port 8000 was untouched. No cloud request occurred: external research accounting stayed **1,852 / 2,000 neurons**.

The final ledger SHA256 is `1cfd4fb0e79e04bee8f25f6c6a19378065090cd09fbd31e6ccf93fcc0c6f6031`. The raw source-bundle SHA256 is `32677a0ad85965fe5d6d6c8bd093bdd6a0093565e0c5efe889b1d4be7b87adac`. Two zero-inference replays reproduced final state hash `91f8b0dac7c2f9c99932022c1c6836a5fa19de7c5f9ebca2bd341ef2a316a800`; the second measured relationship changes around each individual application.

## Recorded outcomes

| Check | This run | Original local V7 |
| --- | --- | --- |
| Applied first opportunities | 25 / 25 | 22 / 25 |
| Applied additional replies | 8 / 8 | 3 / 8 |
| Applied post-watch reviews | 4 / 4 | 4 / 4 |
| Total applied decisions | 37 / 37 | 29 / 37 |
| Persisted messages | 36 | 26 |
| Conversations containing both voices | 12 / 12 | 9 / 12 |
| Emitted deals | 0 | 8, all rejected |
| Persisted offers / agreements / negotiated payments | 0 / 0 / 0 | 0 / 0 / 0 |
| Planned physical steps executed | 6 | 6 |

The source grammar still offers deals in an active conversation. This model selected the no-deal alternative every time. That observation does not show that it can generate a complete valid deal under the new grammar, nor that the grammar permanently suppresses negotiation. The authoritative parser still rejects malformed terms; nothing was autofilled to turn a weak proposal into an obligation.

There were 24 actual incoming-message opportunities with distinct incoming references, including 12 within residents' first scheduled opportunity. All eight extra replies used the actual preceding speaker. Y had no available interlocutor and used a private reflection. The opening-contact schedule is supplied by the fixture: this is not evidence that all 25 independently chose to initiate contact at the same moment.

## All 25 first opportunities

Every initial decision below applied. “Applied” establishes storage and valid interpretation, not that the stated purpose is true or achieved.

| Resident | Reading against supplied context and actual effects |
| --- | --- |
| A — Ama | Discloses her wish to write to schoolmate Ulla. The school connection is supplied; a school library is an embellishment. Her only step goes to Records, where she already is; it does not create fiction. |
| B — Bex | Keeps both identities correct and checks on Cato, but invents that he is resting. Initiating a consultation also reverses her desire to be consulted. No physical step is preferable to unrelated labor here. |
| C — Cato | Asks Bex to draft waking criteria, connected to his own want. It redirects the wellbeing question but requests a concrete next contribution without pretending labor writes a document. |
| D — Dima | Requests hull data from Gita. His reason about Halim burying an earlier structural report is explicitly present in his own shared history; it is not a hallucination. |
| E — Edda | Opens a plausible allocation/roster discussion with Halim. It is specific to their duties, although the purpose derives more from work than her personal want. |
| F — Ferran | Uses his supplied messaging history with Mara, but invents specific old notes and their retention. His voice is recognizable; the private rationale remains in third person. |
| G — Gita | Claims that an inspection is complete and no structural anomalies exist. No inspection event or finding is supplied. Unlike original V7, no invalid deal blocks this false assertion: it becomes a real received message. |
| H — Halim | Responds to Edda about a roster meeting. Asking when to discuss it advances scheduling, not a verified conclusion that the roster is fair. |
| I — Iris | Plans a mechanically real repair. Calling maintenance 90 “low” is unsupported, and the repair raises maintenance rather than reactor output. Her later resource effect is real despite that faulty diagnosis. |
| J — Juno | Requests repair assistance from Lior, matching her wish to deserve the key. Her room and cells are supplied; materials are communal. She creates neither a repair step nor an enforceable joint task. |
| K — Kes | Asks Iris to listen, connected to the stated personal want. The request is ordinary dialogue; no playback, transfer of a recording or listening outcome occurs. |
| L — Lior | Answers Juno's actual request and offers help in words. The goal of being owed is retained privately, but there is no offer, price, obligation or repair step. |
| M — Mara | Responds to Ferran and suggests discussing their shared history. Her claim to keep every old note is not supplied evidence. Her appraisal responds to his actual wording. |
| N — Noor | Wants to check on doctor Cato but speaks to Osvald and queues going to her current Infirmary, then sleeping. Neither step examines or supports Cato. |
| O — Osvald | Selects real manual filtering at the Well and answers Noor. His knowledge explicitly supports hand filtering if pumps fail, but quiet pumps and “critical” maintenance 90 are not established observations. |
| P — Pilar | Invites Quim toward her genuine teaching wish. Warm oven/flour readiness and Quim's expected departure are unverified additions. “Hijo” comes from her supplied voice, rather than being an accidental identity/language switch. |
| Q — Quim | Directly accepts Pilar's invitation conversationally and says he is coming. With no travel step, this does not move him to the kitchen. |
| R — Reva | Opens an inventory review with Tomás, matching her duty. Neither the dialogue nor an empty plan performs an inventory reconciliation. |
| S — Sten | Offers Xan help or quiet, connected to his wish to be needed and their supplied swimming history. The dry-site description is an unsupported physical detail. |
| T — Tomás | Answers Reva's actual request and confirms availability. The review becomes a two-sided discussion, but there is no audit action, count or paid work commitment. |
| U — Ulla | Encourages Ama to share. Asking what she has already written upgrades a wish into an assumption that a text exists. |
| V — Vero | Plans a real garden yield. Produce does not keep the reactor running as her explanation says. Her “planting now” claim precedes the physical action; the later harvest is recorded separately. |
| W — Wen | Answers Vero with a terse, identifiable voice. “The grid is stable” is a claim without a supplied inspection. Repeating his private wish is not yet saying the difficult thing itself. |
| X — Xan | Answers Sten by preferring quiet and queues real digging. His back-since-Tuesday phrase copies a voice example; it is not an observed injury. The water/material effect later occurs. |
| Y — Yara | Cites a real digging skill but supplies no digging step. Her reflection confuses cells with the water cost, and her rationale invents a reactor threshold. Later digging is the routine policy, not her empty model plan. |

No self-as-recipient identity inversion was observed. Several private rationales still describe the actor in third person, and several messages copy voice examples or invent physical circumstances. Correct routing is a narrower result than grounded characterization.

## Eight extra replies and four subsequent reviews

The eight additional replies all persisted:

- **B → C:** asks for specific waking conditions, advancing the actual requested drafting task. She adds a positive trust appraisal, while still assuming Cato had been resting.
- **D → G:** repeats his original request word for word despite receiving Gita's answer. His trust increases because of the claimed nominal report. This is neither a new inspection nor verification of her statement.
- **E → H:** proposes finalizing roster alignment and meeting in Common, her actual current room. This moves scheduling forward, but no roster is revised.
- **I → K:** says she has the recording and asks Kes to play it. No transfer or playback evidence supports possession. No unrelated repair deal is attached now.
- **J → L:** suggests dividing repair roles. This is an actual reply to volunteered help, but neither party creates a repair plan or formal agreement; the watch later gives them routine actions.
- **F → M:** proposes a meal to compare notes. The proposal is connected to their discussion, but no meal or meeting occurs through that utterance.
- **N → O:** claims Cato is resting and requires monitoring. Her own context identifies Cato as a fellow doctor, not an observed patient. The claim has no supporting clinical event.
- **P → Q:** asks Quim to bring his hands. Her appraisal says he already came, although he only promised to come and there has been no physical watch. This confuses intent with evidence.

The four later review opportunities also persisted. **R** proposes starting the inventory discussion with produce, but still creates no count or audit. **A** now claims to have a draft and dry ink even though her only recorded step was a visit to her existing room; the corrected `steps_finished` label does not prevent invented completion. **V** refers to the recent harvest and asks Wen to cook, then lowers her trust in him by one point after reading his terse answer. **C** supplies a new fictional waking threshold and asks Bex to draft and return the list. No supplied rule validates that threshold; this review is not a medical assessment, and no document or implemented protocol results from the conversation.

All four retain their prior purposes. They do not add or revise physical plans. The fixture demonstrates persistent purpose and some directed conversation progress; it does not demonstrate completed writing, repair collaboration, a lesson, an inventory reconciliation or a waking policy.

## Appraisals and physical consequences

The second offline replay measured **15 directed appraisal changes**, each exactly one point of the actor's own trust and no reciprocal or unrelated axis change: G→D, L→J, M→F, B→C, D→G, E→H, I→K, J→L, F→M, N→O, P→Q, R→T, A→U and C→B increased; V→W decreased. [Analysis metrics](analysis-metrics.json) retain each incoming reference, requested interpretation and before/after value.

These valid references do not make every interpretation warranted. Pilar treats a promise as an arrival. Dima trusts an unsupported report. Several others call a single request or assurance proof of reliability. Vero's negative reading is a subjective response to actual wording, not evidence of sabotage or inability. This run contains a negative change, but offers no statistical demonstration of nuanced social dynamics.

The watch produced 25 successful outcomes, exactly one per resident. Only six carry model plan-step IDs:

| Resident | Recorded planned consequence |
| --- | --- |
| X | Digging: +4 materials, −1 communal water. |
| I | Repair: +8 maintenance, −1 material, −2 of Iris's cells. Reactor output remains unchanged. |
| V | Growing: +16 produce, −2 water. |
| O | Filtering: +24 water. |
| A | Go to Records, the room Ama already occupies. |
| N | Go to the Infirmary, the room Noor already occupies. Her sleep step remains pending. |

The other **19 outcomes are routine policy actions**, including Ferran and Yara digging. Those two add eight materials and use two water independently of their empty cognitive plans. Final stock is produce 76, meals 100, water 269 and materials 27. Maintenance is 98. Currency conserves **315 initial −2 burned =313 held**, with zero minted, leaked, treasury transfer or negotiated payment. Earned work credits are not wages paid during this watch.

All 25 residents now have persisted purposes; 19 have no physical steps and remain active. Five internal projects are marked `completed` because their listed steps finished; the public/context label is `steps_finished`. That is not five verified goals achieved. Ama has not written anything through a physical operation, Iris has not changed reactor output, and the broader motives behind genuine resource work remain unassessed.

The defensible improvement is fewer wasted responses and more retained dialogue under a stricter executable grammar. Economic cooperation and truthful interpretation remain open problems. Removing an incidental parser rejection can also let an invented assertion circulate, as Gita and Dima demonstrate. Further evaluation must measure grounded claims, meaningful steps and actual counterpart acceptance instead of treating 37 valid JSON decisions as 37 successful autonomous lives.
