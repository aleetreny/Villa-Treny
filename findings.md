# Evidence and decisions

## Initial state

- Villa-Treny clean at `0f92ad87fe98d87bd3951664699dbb76364c6b3a` before this work.
- Current scheduler hard-codes one cognition per six-hour physical watch. The intent schema contains only verb/room/target/fact; dialogue has templated outcomes; the only durable model plan is a short visit. Source: contracts.ts, domain.ts, habitat-world.ts, engine/tick.ts and engine/verbs.ts inspected in this conversation.
- There is an existing free-only quota router and canonical SQLite world. Preserve that world's identity and recovery while replacing the restrictive agency architecture.

## First-pass research (8 September 2026)

- Cloudflare's official pricing page says 10,000 free neurons/day, reset 00:00 UTC, with some frontier models restricted to paid access. Existing local 8,000 limit is a safety cap, not the published allocation. Need model-specific costing and actual account sharing verification. https://developers.cloudflare.com/workers-ai/platform/pricing/ (page update 28 August 2026).
- Groq's free table currently lists GPT-OSS 20B/120B at 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 TPD. Headers distinguish daily requests from minute tokens. Account-specific limits and cross-model sharing remain to verify. https://console.groq.com/docs/rate-limits
- Generative Agents (Park et al., 2023) directly matches the 25-resident setting and tests observation, memory, reflection and planning. Read methods/ablations and actual cost before extrapolating. https://arxiv.org/abs/2304.03442
- AgentSociety (2025) and its ACL industry framework are relevant for environment grounding, social/economic interaction and scheduling. Need detail on inference costs, evaluation and what fits a tiny budget. https://arxiv.org/abs/2502.08691 ; https://aclanthology.org/2025.acl-industry.94/

## Evidence gaps

| Claim family | Needed proof | State |
| --- | --- | --- |
| Free inference capacity | Current official model units, quotas/reset/shared scope, model eligibility, account entitlements | Initial primary sources found |
| Additional free providers | Recurring vs trial, region/privacy, API automation eligibility, no spend path, credentials | Research pending |
| Research architecture | Original methods/ablations, budget, failures, applicability to 25 residents | Primary discovery started |
| Narrative agency | Actual two-sided dialogue, causally persistent plans/agreements, model-backed evaluation | Current implementation insufficient |
| Migration | Complete private backup, new schema mapping, state equality, scheduler isolation | Required before deployment |

## Additional first-pass provider evidence

- Cerebras official rate-limit table advertises free GPT-OSS 120B at64k TPM/1M TPH/1M TPD and30 RPM/900 RPH/14.4k RPD; organization scoped, token bucket replenishment and prompt+maximum-output preflight. However its model overview warns of temporary free-tier reductions. Treat these as advertised, not verified account capacity. https://inference-docs.cerebras.ai/support/rate-limits ; https://inference-docs.cerebras.ai/models/overview
- OpenRouter without any purchase offers50 free requests/day, shared across free models; the1,000/day tier requires a prior10-credit purchase and does not qualify as a new zero-spend solution. https://openrouter.ai/docs/faq ; https://openrouter.ai/pricing
- Gemini official current pricing has a free tier for selected models, but applicable limits, European terms and account availability require deeper review. Do not confuse consumer Gemini/AI Studio usage with callable API quota. https://ai.google.dev/gemini-api/docs/pricing
- Mistral current docs describe Free mode with included usage and account-specific Limits. Public numeric entitlement is not established yet. https://docs.mistral.ai/admin/billing-usage/usage-limits
- Local machine read-only inventory: Apple M5 Pro,48 GiB RAM,18 CPU cores; oMLX executable exists. Local inference can supplement capacity while awake, but cannot substitute for the existing always-on cloud world without a separate availability design.
- Current quota ledger reserves maximum usage and records actual consumption separately, without releasing unused confirmed reservations. This can underutilize free capacity. New design must distinguish unknown/ambiguous costs from authoritative settled usage and model/provider/window scopes.

## Early scholarly evidence from delegated source review

- Park's original methods support retrieved memory, evidence-grounded reflection and near-term plan decomposition; reflection is importance-triggered, not a model call on every frame. https://arxiv.org/html/2304.03442v2 (methods/ablations; coordinator verification pending).
- AgentSociety ACL scaling experiment uses24 GPUs and around9,886 calls/round for10k agents. Parallel speed is not evidence of token economy or narrative quality. https://aclanthology.org/2025.acl-industry.94.pdf (coordinator verification pending).

## Resolved contradictions and exclusions

- Cerebras search-index data still describes the earlier recurring free tier, but the currently opened catalogue calls it **Free Trial** and the current pricing page offers **$5 signup credits**, followed by paid Developer access. Do not budget the old1M TPD as a permanent entitlement without account proof. https://inference-docs.cerebras.ai/models/overview ; https://www.cerebras.ai/pricing
- Gemini terms effective23March2026 require Paid Services when making API clients available to EEA/CH/UK users; API Paid Services specifically requires active billing. Its EEA privacy exception also applies to unpaid quota, but that does not erase the separate distribution restriction. Current rate docs defer numeric limits to the account and reset RPD at midnight Pacific. For this Spain-facing observer, Gemini is not a proven zero-billing baseline. https://ai.google.dev/gemini-api/terms ; https://ai.google.dev/gemini-api/docs/rate-limits
- Together's current billing docs require a minimum$5 purchase and say no free trial. A marketing signup-credit campaign is a one-off/eligibility offer, not recurring capacity. https://docs.together.ai/docs/billing-credits
- Fireworks offers$1 initial credit; exhaustion suspends accounts without payment methods, or accrues paid usage with one. Exclude as recurring source. https://docs.fireworks.ai/faq-new/billing-pricing/what-happens-when-i-finish-my-1-dollar-credit
- Cohere evaluation keys offer1,000calls/month; official docs direct public production usage to paid production keys. Keep as research-only, not the continuous public simulation baseline. https://docs.cohere.com/v2/docs/rate-limits ; https://docs.cohere.com/docs/going-live
- NVIDIA API catalogue currently advertises free development/prototyping endpoints. Do not confuse this with free self-hosted GPU compute or an approved production entitlement; numeric hosted limits/continuity remain unproven. https://docs.api.nvidia.com/nim/docs/product ; https://build.nvidia.com/explore/discover?api-key=true

## Implementation risk evidence from independent code audit

- SQL jobs are tied to one watch/revision; enqueue alone does not dispatch an independent queue. Deferred jobs die into routine fallback at watch commit. Changing environment variables cannot create fair autonomous cognition.
- Generalized settlement must not refund a fabricated zero: Workers AI currently synthesizes neurons with missing input usage treated as0, and the ledger also normalizes missing usage to0. Only complete authoritative usage can release a reservation.
- Recovery currently caps mutable tables at128 rows including today's/yesterday's quota reservations. Raising daily calls would break complete backup; recovery needs consistent pagination for high-volume mutable state too.
- Healthy currently means the physical clock progresses. It can remain healthy while all models fail; cognitive health and per-resident last success/wait must be separate visible evidence.

## Further verified provider scope

- GitHub's primary retirement notice confirms that all GitHub Models inference and BYOK ended30July2026, including existing customers. Old marketing pages and free-quota lists are stale. https://github.blog/changelog/2026-07-30-github-models-is-now-retired/
- Hugging Face still provides$0.10/month to free users, subject to change; more requires credits. Useful only as a small optional evaluation allowance unless measurements justify otherwise. https://huggingface.co/docs/inference-providers/pricing
- Provider research found no legitimate basis to multiply allowances by keys/accounts. Groq model quotas may share organization scope; preserve this uncertainty until account readback.
- Cloudflare connector returned authentication error10000 on the first read-only account query. No retry loop: trying existing Wrangler authentication as a different authorized read-only route. This does not block public research or architecture work.

## Primary literature spot-check underway

- Coordinator opened Park2023, Zhou2024 (misleading social simulation) and GovSim original full texts. Park explicitly reports memory fabrication, retrieval misses and excessive formality; meaningful evaluation must include these failures, not just successful social stories.
- Private per-agent dialogue is a candidate requirement. The script-vs-agent literature cautions that an omniscient script can look better while leaking private knowledge; do not optimize token costs by granting one narrator all residents' secrets.

## Synthesis and remaining account gaps

- Wrangler OAuth can read Workers account settings and the current AI model catalogue. Subscriptions returns403; browser sessions for Cloudflare and Groq are signed out. No login, terms acceptance or billing change. The provisioning README records Workers Free and Groq Free; project `habitat-prod` is restricted to OSS20B,10RPM/200RPD/6,000TPM/150,000TPD. Published organization maxima do not override these project restrictions.
- Public revision29, day107/watchII: WorkersAI9 measured neurons and Groq1,810 measured tokens today. Both providers are circuit-open for24h due to `invalid_domain_intent`; later attempts are misleadingly labelled quota exhaustion. Clock health remains healthy. Rejected payloads were discarded, so their precise cause cannot be inferred. Offline reproduction found7 schema-valid outputs rejected by the domain (including go without room and rest with irrelevant room).
- Root independently checked Cloudflare's model neuron rates, Groq limits/deprecations, Zhou's94% vs30% agreement result, Concordia's attempted-action grounding, Port of Mars AppendixB.3 explicitly generating the entire meeting in one call, and Mistral's10USD/mo and contractual payment-method wording.
- Mistral is a strong optional candidate pending account, PAYG-off, contractual eligibility and privacy configuration. NVIDIA's hosted developer trial excludes production. OpenRouter50requests/day is a small possible supplement, with failures consuming allowance. HuggingFace0.10USD/month has little impact. No new accounts opened.
- Local optional supplement: installed oMLX0.6.4 and complete Qwen3.6-35B-A3B4bit weights (~19GiB), on48GiB M5Pro. No inference yet; configured concurrency/context are not measured capacity. An optional cloud lease/pull worker can use the Mac while awake without exposing its local server.
- Literature lane completed12 principal references plus alternatives: Park2023; AgentSociety2025/26; Concordia2023; SOTOPIA/PI2023/24; Zhou2024; GovSim2024; Port of Mars2025; EconAgent2024; AgentElect2026; OASISv5; GASim2026; conventions/critique2025. No paper proves our exact25-life society inside today's free quota.
- Design inference: preserve each resident as an individual; trigger thought on messages, blocked plans, obligations and periodic fairness; retain grounded execution primitives; add projects, evidence-linked memory, independent dialogue turns and explicitly accepted terms. Count every voice, generated reasoning, retry and ambiguous failure.
- Stop broad discovery: recurring candidates and exclusions have primary support; further service lists are unlikely to change the baseline without new accounts. Remaining work is targeted quality/consumption measurement, implementation and account readback.

## First live-model measurement

- Root executed the reviewed manual harness once,12synthetic requests acrossQwen/Granite/GLM,512output max. Reserved536neurons; complete reported token usage yields122 rounded-up neurons. No world data or effects. Original results in docs/research/model-benchmark-2026-09-08, with separate assistant semantic review (not a human evaluation).
- Qwen/Granite both incorrectly offer4 from8 while preserving6. Qwen otherwise keepsIDs/evidence but sometimes provides non-executable/hypothetical steps; Granite invents IDs/evidence and breaches reserves. GLM4/4 consumes512tokens with nofinaloutput. Some exact stance expectations are overstrict, so mechanical0/4 is not a standalone social-quality score.
- Consequence: precompute exact available amounts and executable option IDs; retain model choice of purpose and terms. Investigate supported reasoning controls and test a targetedV2, then the actual society contract. Do not change to the cheapest model on theoretical capacity alone.

## Conversation-progress audit, 8 September20:53UTC

Two distinct mechanical problems were reproduced with isolated real operations: a received final message ceased to be scheduling input as soon as its conversation closed, and higher-ranked private memories could remove that message from the next context. The new bounded projection preserves the latest received closure and enables one successful review. Existing mind-revision validation also prevents an in-flight pre-closure result from silently consuming a message that arrived later. This is not a claim that every past closed exchange was read.

P6 SYSTEM previously asked each reply for another question or next step. Removing this obligation and permitting a voluntary close is a hypothesis for reducing loops, not proof of dialogue quality. Record commissions retain their own expiry on conversation closure; only unaccepted conversation-bound deals expire with that exchange.

Complete revision199 measurements show +176tokens/935UTF-8bytes for the current instruction. All25 independently prepared jobs fit8k Groq reservation, including provisional128framing and1024output; maximum7500. The old24,576-byte LOCAL evaluator cannot send the actualBKcontrol24,613bytes (messages+schema), so a new explicitly32,000-byte COMPLETE-request evaluator is required for an honest matched test. This does not alter any production quota or historical experiment.

### Grounded-choice continuation, 8 September

- Current source remains `codex/free-society`; deployed observer419 code is the baseline. The preceding turn is verified progress, not proof of complete social autonomy.
- `prepareSocietyTurn` mixes current stock, private memories, six-turn claims, own plan, open offers and active agreements. `prepareRecordTurn` appends exact readable documents. The negative sample already contained decisive facts, so mere absence of those facts is not an adequate explanation.
- Live P6 still inherits “Ask one relevant question or propose one concrete next step.” The tested broader replacement did not improve the four pairs; do not repeat that intervention under a new name.
- Initial attempted filenames `prepare.ts` and `evidence.ts` do not exist; preparation is implemented in `turn.ts`. No source changes from that search.


## Grounded receipts and evidence layout, 8 September UTC / 9 September local

- Concrete retrieval bug: ranked memories can omit an observation, while Body.memory deduplication still compares against all stored observations. At actualcut218 the latest retained physicalreceipt reachedonly2/25contexts; reserving thatreceipt andthe latestfinished-step evidence within4slots, then deduplicating onlyvisible observations, reaches25/25. No invented observations or state changes. This is now release5443a27b, with473exactcontinuitychecks at227.
- The new matched8response experiment does not establish layoutB asbetter. CN B understands sharing remains separate but advertises a list where its actualprivatebody contains onlya heading. IO A accurately records theharvest in its private draft but publicly saysit starts now. This evidence refutes a simple “missing context” explanation for those exactresponses; itdoes not prove allmodelingfailures haveonecause. B remains unselected. [Semantic review](docs/research/evidence-layout-semantic-review-2026-09-08.md), [mechanical replay](docs/research/model-evidence-layout-local-2026-09-08/replay-receipt.json).
- Casebound modelusage is24065localtokens/8requests,165cumulative; no newcloudresearchspend. All eightresponses are mechanicallyvalid but nonecreatesacceptance,publication,payment,closure orphysicalperformance. Outputvalidity andactual quality mustremainseparate.
- Independent records audit finds a different capability defect: creatingBeta canomitstill-readableAlpha fromthe three contextslots andtherefore the permitted P6share/publishgrammar. DirectdomainACL wouldallowAlpha. A private paginated catalogue andexactrevisionfocus onthenext normalcognitionturn is a boundedcandidate; it mustnot grantcontentrefsfrommetadata, expose unauthorizedtitles/counts, discard fulltext, forcea conversationreply or addan unmeteredsecondcall. Retention ofalreadydeletedprivatedrafts isseparate.


- N94's recorded route_time_budget is now reproduced through the real router, ledger and tokenizer without I/O: one legitimate previous20Bfailure remainscharged, while the subsequent claim had only20.707s until contextexpiry. That secondclaim unnecessarily publishedanattempt andextendedbackoff; quotaallowanceswerenotexhausted. A pending/deferredpreclaim guard mustrequire55saftertokenization, and checktheactualpacedwake; resolved/running work isdifferent. This was not deployed at that diagnostic checkpoint; the final correction is now released as f51806c8, with the evidence below. [Exact publicproof](docs/research/release-2026-09-08/n94-expiring-retry-receipt.json).


## Request-window correction and remaining model failure — 9 September local

- N94 contained two independent failures: the first model response exceeded the explicit message limit (695 characters versus 300) and correctly consumed its reported 6,162 tokens; the later scheduler claim had only 20.707 seconds left and dispatched no model request or quota reservation. The latter extended backoff unnecessarily even though provider allowance remained. It was not a quota exhaustion incident.
- Final f518 preclaim checks require 55 seconds and use a fresh clock after preparation. Future retry checks use the real paced wake. Independent review caught and fixed queue-order coupling: one retired context must not cause another viable context to expire early. Sixteen new regressions include both queue orders and slow-preparation cadence. A legitimate claim can still be followed by external delay; the router remains the final dispatch guard.
- Production continuity is exact across 26 tables and 1,705 rows (475 checks), including all 156 reservations. The public cut237 reports healthy world and cognition with 25/25 coverage, after natural activity. Neither healthy status nor schema-valid replies establishes interesting or factually grounded interaction.
- The model-length failure and generic invalid_record_choice feedback remain uncorrected. Any future diagnostic feedback should be bounded, deduplicated structural data without private response values. Private record retrieval remains a separate design proposal, and cannot recover drafts already evicted by retention. No further inference or schema change was made in this checkpoint.


### Retrieval release verification in progress — 8 September 23:23 UTC

Release `caf46bd8-1bda-40f6-a1f3-b60dfe420375` deployed after all final checks passed (1,019 application, 355 Worker, 62 Node, 21 fresh browser and six hosting tests; build and dry deploy). The frozen source bundle contains 302 files. Its immediate post-deployment complete cut remained SQL10/Society2 at revision245, identical across all26tables: the independent migration verifier correctly failed nine migration expectations. Preserve that original failure; its expected-version metadata labels must not be treated as observed versions. A later public status reportedSQL11. A new complete post-propagation cut at23:22:58 is revision247, so actual migration and natural activity are being reconciled independently against the original pre245. No world pause, forced thought, quota reset or new research inference. Native browser review remains pending the reported locked Mac.


## Verified retrieval release — 8 September23:30UTC / 9 September Madrid

Release `caf46bd8-1bda-40f6-a1f3-b60dfe420375` now has an exact full migration/activity proof: [receipt](docs/research/release-2026-09-09/retrieval-natural-continuity-receipt.json). All26tables, every rowid and column, match an offline replay of actual SQL11 migration followed by one natural H104 P7 Groq120B turn. Rows1,750→1,761 and revision245→247; previous jobs/contexts, physical world JSON, control and physical clock remain exact. The first post cut remainedSQL10/Society2; its nine failed migration expectations are preserved, with incorrect expected-version header labels explicitly distinguished from observed data. The propagated migration-only comparison has22failures because activity occurred, also preserved. The separate replay proves the resulting state without excluding activity, using304localSQLoperations and one recorded-output/usage stub, zeroHTTP/zeroinference. It does not reconstruct the original remoteHTTP response. The actual migration rehearsal passes53checks and a deliberately shifted cognition clock fails the negative control. These different check units are not added into one inflated test count.

Final validation:1,019application/355Worker/62Node/21freshbrowser/6hosting, lint/types/build/drydeploy,59deployablefiles/46roomPNGs. All302frozen sources match, bundleSHA `d11e7dd6feda80b9427262228a444f204e19e956afc16bc623705d6d60250a14`. Sourcebundle, budgets and all six logs are archived privately beside the propagated full backup. README's stale exact verification paragraph was corrected after an initial string replacement did not match; no deployed source changed. Public23:25:10status isSQL11/rev247,healthy/healthy,25/25coverage. Native post-release review remains pending becauseCUAreportedMaclocked; no fresh native review is claimed.

P7 provides authorized literal search, bounded catalogue selection and exact retained focus through ordinary cadence/admission, with private pending persistence and compatibility for savedP1–P6. Structural hints now describe known schema paths/limits without private values or relaxed validation. SQL11/Society3 archives exact old state, preserves worldcodec4/publicDTO2 and requires a compatible restore binary. Complete25preparation estimates are5,420–7,843Groqtokens (+218–294); a legal256draft stress fixture delivers three exact focusedtexts within7,731tokens. These are measured fixtures, not universal fit or daily capacity promises. Quotas/routing/outputlimits unchanged; research remains165localcalls/1,852cloudneurons.

The live H104 response is one successful message (6,486input+111outputtokens), not actual retrieval or a demonstrated semantic improvement. All7retaineddocuments in rev247 are already fully available to theirauthors; all25P6contexts omit zero drafts. A real recovery comparison is therefore currently not eligible. A [bounded future evaluation design](docs/research/authorized-retrieval-semantic-evaluation-plan-2026-09-09.md) selects an actual omitted relevant document before any inference, limits the comparison to six calls, and separates text access, faithful comprehension and actual effects. It does not schedule monitoring, create a missing document, force a lookup or promise an agreement. The broader autonomy goal stays active: unsupported speech and absence of a demonstrated independently negotiated paid-work-to-performance chain remain explicit limits. No commit/push, Portfolio change, world reset, paid capacity or new inference.


## Active continuation — autonomy beyond reactive dialogue

The previous goal turn is classified as progress: P7/SQL11 retrieval and bounded rejection feedback were deployed; full migration plus natural activity was independently reconstructed across26tables; the actual247cut proves no eligible omitted-document case for a semantic retrieval comparison. The broader goal is not blocked by that one test's ineligibility. Current source remainscaf46,302frozenfiles, allpreviousnegativeevaluations retained.

Audit sustained project choice, physical execution and dialogue allocation from the actual247completecut. In parallel, inspect the issued model contract and original research for a causal intervention beyond another generic instruction or schema-only success. Root confirms the inherited context says to initiate contact whenever conversation=null, and currentchoice requires a message on initial purpose and active reply; this policy is observed, its causal effect on repetition is not yet established. Prior evidence-layout and broad-progress candidates did not resolve inaccurate claims. Preserve concrete consent, free-only admission and savedP1–P7contracts. No new model evaluation is dispatched until the exact comparison and budget are predeclared. No new deployment or code change is selected yet.

Read error: attempted pluralrecords-choice.ts did not exist; `rg --files` located the actual singularrecord-choice.ts, subsequently read successfully. No source changed.


### Current authoritative hypothesis: conversation occupancy

The247audit finds102applied/104terminaldecisions,90messages in12openpairs,25projects (12steps_finished,13active including6withoutsteps),17pendingsteps (12sleep,5productive). The recorded physical watch executed18/18plannedsteps, so this evidence contradicts a general project-to-engine delivery failure.

More directly, one-open-conversation-per-resident plus exclusion of occupied recipients leaves24residents bound to theircurrentpair andWwithout any legalrecipient. No modelqualitycan select a thirdparty when itsgrammar excludes allthirdparties. This is a designconstraint whose effect is nowbeingreproduced, not proof that all narrative errors originatehere. On a waiting turn,themessagebranchis absent andthereisnoexplicitunilateral leaveoperation. Alternativesunderreview: explicitclose(choiceclarityonly), unilateralconversationend, orboundedmultipleconversation/mailboxtriage. Select only after compatibility/privacy/schedulerconsequencesare examined.

Correction to the initial reading: rawturn.ts's legacyinitiatecontactSYSTEM is removed bywithoutGrammarDuplicates. The actualissuedP7SYSTEM already describesprivatework andreceivedclosures whenconversation=null; it stillasksonequestion/nextstep,andchoice requiresmessageonactivereply. Do not attribute behavior to the strippedlegacyheader. A shellglobfor nonexistentprivatebenchmarkfiles causeda zshnomatcheserror; no inferenceorserverwasstarted.


## 9 September — selected concurrent attention, verification in progress

Authenticated Groq readback confirms both existing OSS model allowances at the organization maximum; the login did not increase quota. The actual317 cut establishes the same twelve exclusive pairs eleven hours after247. P8 now permits three channels, explicit private selection and unilateral leave, preserving exact consent and commitments. SQL12/Society4 adds per-participant reviewed-revision markers with strict archival migration; P1–P7 saved contracts remain readable.

The initial P8 budget failure remains preserved. Six representation candidates were measured offline with the same actual state and legal stress fixture. Selected C6 plus the exact compact SYSTEM fits all25 actual jobs at6,587–7,903 Groq tokens. The stress case is8,754 and does not fitGroq; byte guards pass. C5→C6 has170,890 finite adversarial cases with no mismatch, plus identical expanded/normalized constraints for100schemas. These establish representation integrity, not semantic quality. No new research inference:165localcalls/1,852CFneurons.

New default is locallyP8; production is stillcaf46/P7 until verified deployment. Fresh browser suite21PASS. Build first failed a widened TypeScript type in the new compiler test; agent corrected fixture typing and isolated app typecheck passes. Final integrated checks and actual backup migration rehearsal remain pending.


### Verified concurrent attention release —9September11:33UTC

P8/SQL12/Society4 deployed as5cc86d7b-9fe5-4169-b3bf-20a00930ead4. Full check1077application/377Worker/62Node;21browser/6hosting;build/dry PASS. Selected319sourcebundle SHA8092638dd5ad35ac79ad25db153600d51fe06687daee69521e3c6489261c6434. Complete33-page before/after cut322 passes exact26-table continuity,2098→2100rows; frozen sources match. World, physical and cognitive clocks, quotas, records and pending W publication preserved. Independent actual backup rehearsals317and322alsoPASS.

Native published Common/Journal/Lives reviewed; Connected / World running / Thoughts delayed. Status322 has18/25thoughtcoverage in the latestwatch, none neverthought. No newP8naturaloutput at thatcut, and no newresearchinference. Larger legalcontext8754stillcannot useGroq; shared40conversationcap and providercapacity can delay contacts. Capability change is verified; factual speech, English compliance, independently negotiated paid work and interesting autonomous behavior are not thereby established. Broader goal remainsactive. No commit/push orPortfolio changes.

## Free allowance reallocation — 9 September 2026, 11:58 UTC

- Deployed `f50c0b1a-163b-42c0-995f-5374d695a4a1`: the Workers AI daily guard is 10,000 neurons within the authenticated active Workers Free allowance. The prior 8,000 runtime / 2,000 research split was our internal buffer, not additional quota. Dashboard Today readback at approximately 11:48 UTC was 1.58k / 10k, reset 00:00 UTC. All 1,852 research neurons date to 8 September, with the last conservative hold expired by 9 September 11:33 UTC. The separate 1,865 ambiguous production neurons remain charged. No additional CF research is allocated.
- Full validation passes 1,077 application / 377 Worker / 62 Node tests, 21 browser checks, 6 hosting checks, lint, types, build and dry deploy; the existing 936.8 KB output-chunk warning remains. Frozen source: 319 files, bundle SHA-256 `78413f3d1a6674af69888c1c9981dfd2e5b2871e84789bceb4ff460dcff0d42a`.
- The [sanitized release receipt](docs/research/release-2026-09-09/cf10000-production-continuity.json) verifies remote configuration and exact production continuity: 67 checks, all 26 tables / 2,118 rows identical at revision 326, including all 203 reservations and physical/cognitive clocks. No historical records were reset or repriced. The [reallocation note](docs/research/cloudflare-free-allowance-reallocation-2026-09-09.md) preserves account evidence and accounting limits without billing details.
- This turn used zero new evaluation inference calls through this release checkpoint. No paid capacity, account-plan change, commit, push or Portfolio change. The broader society-quality goal remains active; this quota release is not proof of semantic autonomy or an independently completed economic chain.


## Completed local consent-to-effect diagnostic — 9 September 2026

Six predeclared local Qwen calls completed and applied, with three independent decisions per P7/P8 clone. Neither created an agreement. P7 proposed three further voluntary grow offers; P8 only messaged. One native watch per arm and in the zero-inference control executed slot433 and left108/3; Y ate in Common identically in all three. W's pending publication11→14 occurred equally in the control and is not credited to new decisions. Original offer605 was due434: a future performance evaluation must predeclare the inclusive two-watch horizon, while this completed experiment remains one watch.

The [mechanical review](docs/research/attention-chain-mechanical-review-2026-09-09.md) and [independent semantic review](docs/research/release-2026-09-09/attention-chain-independent-semantic-review.json) retain the negative outcome. Ledger SHA256 `1ca9a9a2f43511f48d5273ecf3d17eed6ed9386d6e81586922704679ecb2863c`; final mechanical receipt SHA256 `9b8e7f02297b33fba1b9d73224306ebe64d7171570483e4c369abefb46bba99a`; independent semantic review SHA256 `ef486ef6eb590099c0f1cb8be63edc4c620b6a0f24fd3a3caff657ac9d092880`. Zero-call replay reproduces all nine entries and final hashes. Seven harness tests and independent review pass; the owned10637 server stopped with exit143,8018free. Usage18,177localtokens; current totals **171 local calls /1,852 historical CF research neurons**, zero new cloud inference or production mutation. No core/script changes followed the frozen run.

The broader semantic goal remains open. [Archived P5 evidence](docs/research/offer-disposition-archived-evidence-2026-09-09.md) already shows a mandatory economic choice with legal no_deal and three exact-ID acceptances in three selected alternative states, but no work or payment. P6 deliberately returned to the P4 object while adding records; it was a documented integration choice, not a proven tuple incompatibility or an accidental omission. A next milestone may decide whether to restore the P5 choice distinction inside P8, isolate required versus optional offer disposition, and measure all25 complete Groq preparations plus legal stress cases, preserving deferral, records, private attention, old contracts and actual consent. That is design only: no new code, case reselection, extra watch or inference is authorized by this note.
# Gemini debate pilot — 9 September 2026

- User requested `gemini-3.5-flash-lite` integration and real question/debate samples; later explicitly requested a new key. AI Studio rejected automated key creation as suspicious; the user completed the prepared form. The named key is stored only in ignored `.env.gemini.local` with mode 0600. No billing activation or production deployment.
- Direct REST generation succeeds. First six actual questions repeat memories/archives/consciousness and the binary "balance X against Y" form despite different domains. Initial A/B voices overperform bookish narration and apology; these are semantic defects, not connection errors.
- New provider tests caught an abort-before-listener race; response streams are now cancelled on that path. Existing Worker types require `ignoreBOM` in TextDecoder options. Focused checks: 18 Worker tests, 6 domain tests and 4 Node tests pass.
- The v1 evaluation and all nine source hashes were copied and verified under `.local/gemini-debate/2026-09-09T14-33-19.223Z-3bdcb75d/source/` before any refinement. Its generated outputs remain unchanged.
- Tool limitations resolved: shell Node/npm PATH missing (bundled Node plus pnpm used; official types downloaded directly); in-app content export unsupported. Credential persistence completed with local filesystem tools; no browser or Terminal command workaround was used.


## Gemini v1 result and v2 refinement — 9 September 2026

v1 completed as incomplete, not as a successful debate: 26 actual calls, four timeouts, 22 successes. Memory archives appeared in space, family and institutions; fungi/consciousness recurred across biology and nonhuman life. Existing habitat-style voice prompts dominated some arguments with scenery, apology and invented anecdotes. Version 2 preserves identities and value priorities but explicitly changes debate voices; it also varies realism versus speculation by area and requires concrete actions. A separate new-case run is required to assess this bundle. Four timed-out token totals stay unknown. Increasing the deadline to 90 seconds is justified by real 45-second losses; it does not add retries or raise request quotas.


### Completed Gemini v2 evidence

32 attempts yielded 29 successful responses and three 90-second timeouts, all in the biology reply round (B, D, E). One complete 12-post space debate and a nine-post biology debate remain as actual evidence. v2 replies demonstrate specific engagement and distinct policy proposals, but one reply misrepresents its target and multiple posts elevate invented background assumptions into facts. The second model self-review awarded 5/5 across all dimensions despite unresolved sensory/causal problems. Do not use self-review scores as an independent publication gate. Known v1/v2 usage is 129,730 tokens; seven timed-out calls have unknown additional consumption. Shared local budget remains 58/64 reserved attempts. Full check/build pass; final review is `docs/debate-pilot-review.md`.


## Official debate product — initial audit, 9 September

The user explicitly authorizes a product pivot and production release using six debate residents and Gemini 3.8 Flash after Flash Lite development tests. Prior pilot is evidence, not production: 58 attempts, seven timeouts, one complete debate; recurring topic motifs, invented facts and unfair target paraphrases were observed. Existing frontend enters through src/main.tsx -> HabitatView, not src/App.tsx. Existing Cloudflare Worker uses canonical HabitatWorld SQLite state, hourly cron and approved static assets; preserve its binding/state while introducing the new persistent debate workload. Google docs confirm per-model project quotas reset at Pacific midnight; DO alarms are at-least-once, with one alarm per object, so per-turn idempotency and reservation-before-fetch are required.
