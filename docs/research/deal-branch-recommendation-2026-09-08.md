# Deal grammar: compiler evidence and the smallest correction

The smallest justified change is **protocol4 only: an omitted `message.close` leaves the conversation open**, exactly as the canonical core already behaves. A model must still emit a real `deal` and a message to the eligible counterpart. `close:true` with a deal remains invalid. Acceptance is a separate authored `accept` containing the actual offer ID. No field is filled in, no verbal promise becomes a deal, and no omission is treated as acceptance.

This correction is implemented locally after authorization. Later [six-response](model-society-open-message-local-2026-09-08/review.md) and [single-continuation](model-society-exact-accept-local-2026-09-08/review.md) reports preserve the actual proposals, zero acceptances and material experimental limitations; they do not demonstrate negotiated autonomy. Protocol1 retains its canonical behavior. Protocol2/3 keep their explicit-false boundary, including outstanding jobs. Historical source bundles and outputs remain unchanged.

## What is observed, and what is only an explanation

The three earlier 37-response batches contain111 outputs,106 messages, **zero explicit `close` fields**, and respectively8/0/0 emitted deals. The original eight failed the choice boundary's extra requirement for explicit false. These are exact counts, not an economic-preference survey. All conditional runs' saved messages remain valid under the proposed protocol4 grammar.

The subsequent [six-sample ordering comparison](model-society-v7-deal-order-local-2026-09-08/review.md) found byte-identical content within all three pairs. Moving the deal property earlier did not help. Offline inspection now establishes that XGrammar **did produce different EBNF** for those schemas: ordering was not simply normalized away before conversion. It does not establish why the model still chose the no-deal path.

Installed oMLX0.6.4 passes the schema to XGrammar and uses its matcher to mask invalid tokens. The installed compiler is XGrammar0.2.3; its `any_order` default is false. In the A grammar, omitting `close` while finishing `message` eliminates the deal branch. In the reordered B grammar, emitting `message` before a deal can already eliminate that branch. These are language restrictions verified by conversion/matching, not measured probabilities or an explanation of every semantic failure.

The [offline compiler audit](deal-branch-compiler-audit-2026-09-08.json) preserves source hashes for installed server and compiler files. Its Python script uses ASCII `accept_string` matching, without loading model weights or making HTTP requests. It checks the grammar's accepted strings and prefixes; it does not reproduce Qwen token probabilities or actual token masks. The compiler cache was disabled for this audit.

| Prefix / completion | Current explicit-false grammar | Protocol4 canonical omission |
| --- | --- | --- |
| Finish message without close, then start a deal | Rejected | Allowed |
| Finish message with false, then start a deal | Allowed | Allowed |
| Finish message with false, finish response without deal | Allowed | Allowed |
| Finish message with true, then emit a deal object | Rejected | Rejected |

The actual implementation changes the full deal branch's message schema from required `to,text,close` to required `to,text`, retaining optional `close:{const:false}`. The no-deal branch still allows ordinary optional boolean closure. Complete branches and shared definitions preserve unknown-key validation; the literal recipient directory remains accessible to the scheduler. The choice decoder enables omission only through an explicit protocol4 option. Canonical application already closes a conversation only when `message.close` is truthy or the turn cap is reached.

## Alternatives examined offline

**Require `close:boolean` on every emitted message, without a default.** This compiles and prevents the particular omission decision. A false value leaves both a later deal and ordinary discussion possible; true closes normally. It does not itself add consent. However, it makes36/37 previously legal messages invalid, forces a new field choice for every message, and retains an unnecessary stricter wire convention than canonical behavior. There is no measured generation benefit. It is not the minimal correction.

**Require a nullable deal, keeping the full conditional branches.** This also compiles. A null value explicitly selects no deal; an object still requires an open message. It adds a new no-op representation and would need a versioned, validated null-removal adapter before the current decoder. It does not prove that the model will choose an object over null. Removing the condition to make a flat nullable schema accepts `close:true` together with a non-null deal, as demonstrated by both Zod and XGrammar; that would reintroduce avoidable domain failures. The flatter version is rejected as a recommendation.

None of these alternatives makes a statement true, turns repair into fabrication, or proves willingness to cooperate.

## Counterfactual cost on the same37 saved protocol4 contexts

The [Node audit](deal-branch-offline-audit-2026-09-08.mjs) and [results](deal-branch-offline-audit-2026-09-08.json) use the actual37 saved protocol4 contexts, unchanged USER/SYSTEM and a schema-only transformation. Cached official tiktoken0.14.0 counts ordinary `o200k_harmony` authored tokens. Each request includes128 framing allowance plus1,024 output reservation. These are conservative authored-component reservations, not observed provider bills. The later explanatory SYSTEM sentence is outside this schema-only table.

| Variant | Total reserved tokens | Per request | Schema delta per request | Saved outputs accepted unchanged |
| --- | ---: | ---: | ---: | ---: |
| Current grammar |183,276|3,294–5,367|0|37/37|
| Require close everywhere |183,420|3,294–5,371|0…+4|1/37|
| Canonical omission, protocol4 |183,204|3,294–5,365|−2…0|37/37|
| Required nullable deal with condition |184,008|3,294–5,387|0…+21|1/37|
| Flat nullable deal, unsafe conflict admitted |176,028|3,294–5,166|−220…0|1/37|

There are36 deal-capable contexts and one without an eligible recipient. All individual reservations fit6,000 in this bounded sample; all totals exceed150,000 if treated as one day of unrefunded Groq requests. Request fit is not whole-day capacity. Future transcripts and debt lists may cost more. Compiler conversion/matcher runs were roughly45–58ms for the five test schemas on this machine, with compiled grammar strings about142–162KB; these are neither model latency estimates nor general performance claims.

## Functional contracts versus the user's autonomy goal

The existing opening-proposal tests genuinely exercise exact roles and dates, refusal, counterproposals, independent counterpart acceptance, resource revalidation, idempotent loan transfer, accepted work, a recorded physical action and conserved payment. The new omission tests compare omitted/false results directly, verify words alone transfer nothing, reject explicit closure and fabricated authority, and preserve legacy versions. **77 society tests pass** at this checkpoint. These tests use explicitly supplied synthetic decisions and favorable fixture resources. They establish that the mechanism works when given valid decisions; they are not agent-generated consent or an emergent economy.

A limited release can honestly describe persistent lives, executable contracts and known semantic limitations if that is the agreed acceptance bar. These tests alone cannot satisfy a stronger claim that the model independently chooses coherent economic goals and negotiates them reliably. That requires observed model-generated proposals and separate counterpart decisions, followed by actual consequences, with contradictory or irrelevant claims reported rather than concealed. The bounded local follow-ups linked above produced proposals but no agreements, including after the final role/acceptance clarification. They do not replace the separate synthetic contract evidence with a model-generated success.

No inference was used for this audit, no cloud budget changed, and no historic output was repaired. Research accounting remains1,852 Cloudflare neurons.
