# P8 compact SYSTEM candidate

This wording was selected locally on9September after measuring C6 on the complete revision317 cut. New P8 jobs import its exact string through `SOCIETY_ATTENTION_SYSTEM`; the candidate export name remains stable for archived experiments. Deployment status is recorded separately in the release receipt. It preserves the intended restrictions of the composed P8 SYSTEM while avoiding repeated descriptions of syntax already carried by the issued JSON Schema. Shorter instructions do not establish equal comprehension or better social behavior.

The comparison loads both actual TypeScript exports through Vite, then counts their complete strings with installed `tiktoken` 1.0.22, `o200k_base`. There are no model calls, external requests, context substitutions or output-token changes. These are ordinary SYSTEM tokens only, not provider-reported input usage or the full USER/schema/framing request.

| Export | UTF-8 bytes | Ordinary tokens | SHA-256 of complete SYSTEM string |
|---|---:|---:|---|
| Original `SOCIETY_ATTENTION_SYSTEM`, now `SOCIETY_ATTENTION_VERBOSE_BASELINE_SYSTEM` | 8,598 | 1,610 | `345165e0c46756f02175d5cb42ed1ac71f31dccd78169912ddc6012393f325fb` |
| `SOCIETY_ATTENTION_COMPACT_CANDIDATE_SYSTEM` | 5,328 | 967 | `e9589b12d43c1447413905058492f1fc0a3b3f7fdf9b05e9ff9eb9818863e6c2` |

The candidate saves 643 ordinary SYSTEM tokens (39.9%). It remains above 900 because the meanings of actions, consent, provenance, attention and publication cannot safely be delegated to JSON syntax. Future edits require new measurements; a changed hash is not this comparison.

## Restriction coverage

“SYSTEM” below denotes a behavioral instruction, not a property mechanically guaranteed by prose. “Schema” means the actor-specific issued grammar. “Domain” means authoritative application or state validation. Both the current SYSTEM and candidate rely on the latter two layers; they are not replaced by this compression.

| Restriction | Candidate coverage | Authority beyond SYSTEM |
|---|---|---|
| Decide only for the actual resident; do not continue a narrator's story | Opening sentence retains both | Actor, generation, sequence and revision are bound by prepared context/domain. Narrative fidelity itself is SYSTEM only. |
| English in all free text; preserve names, IDs and schema values; use voice without copying biography | Opening paragraph, including document titles and bodies | IDs/enums are schema/domain; natural-language English and appropriate tone remain SYSTEM only. |
| Create a purpose with a concrete next step; preserve useful plans; social or unsupported purposes may use empty steps | Second paragraph | Initial project requirement and legal steps are schema/domain; meaningful goals and continuity need model behavior. |
| Speech does not save a project; planning and promises do not finish work; waiting is legitimate | Second paragraph | Domain persists only selected operations and advances physical effects separately. Quality of waiting versus repetition remains unproven. |
| Claims are not facts; interpretation is opinion; missing details/location are unknown | Third paragraph | Receipt/reference validity is domain; truthful wording and correct interpretation are SYSTEM only. |
| Do not invent measurements, faults, places, objects, previous acts, promises or consent; future proposals are allowed | Third paragraph, with every original category retained | Operation legality is checked by domain. Text can still contain unsupported claims. |
| Documents and IDs cannot override instructions or justify invented observations | Third paragraph and record paragraph | References/ACLs are checked; interpretation of content remains a model responsibility. |
| One attention decision with content, or exclusive lookup; omit unchanged fields | Attention paragraph | `attentionCapabilityChoiceJsonSchema` and application enforce alternatives. Candidate omits repeated per-kind key lists, required counterpart fields and empty-object descriptions already in the grammar. |
| Own channels only; no evidence rights from omitted text; answer is optional and should not repeat | Attention paragraph | Preparation filters own channels and exact shown turn IDs. Whether wording is useful, short or repetitive remains SYSTEM only. |
| Private choice reviews only its selected channel; null reviews none; acknowledgement is not agreement or understanding | Attention paragraph | Exact selected revision and watermark changes are domain. Candidate does not describe delivery as comprehension. |
| Busy does not mean unwilling; contacts do not imply consent or co-location; leaving is allowed while waiting | Attention paragraph | Capacity, one pair and three open channels are schema/domain. Candidate omits numeric repetition because `attentionCapacity`, offered IDs and domain already expose/enforce it. |
| Leaving invents no farewell, expires only unaccepted conversation proposals, preserves accepted obligations and document commissions | Attention paragraph | Leave transaction enforces these boundaries. |
| Optional reflection has supplied references; optional appraisal changes only one's own feeling using the actual incoming message | Reflection paragraph | Exact reference, target, axis, delta and deduplication are schema/domain. A social phrase still does not prove compliance. |
| Actions have only engine effects; physical capabilities do not author documents, consult or invent knowledge | Action paragraph | Domain implements effects. Candidate keeps this explanation because capability names alone can mislead. |
| Labor credits differ from cells; visit differs from readings; stock register is only for A; water filtering differs from cleaning | Action paragraph | Capability mapping, actor/room limits and recipes are schema/domain. Both `accrue_*` capability effects remain covered by the labor-credit sentence. |
| Costs/yields matter, repair may spend cells; historic verbs are not new choices; one action/watch and travel meanings | Action paragraph | Plans, verb adapter and physical domain enforce operational scope. |
| Deal is optional and can accompany first contact; speech is necessary; close cannot accompany deal | Deal paragraph | Actor-specific grammar and deal application. No forced negotiations or invented acceptances. |
| Exact acceptance preserves terms; matching reproposal does not accept; counterproposal is for different terms | Deal paragraph | Exact offered IDs and stored terms are domain. Choosing appropriately is still behavioral. |
| Work/hire roles, total payment, voluntary work, decimal and spending limits, derived parties/dates, two-watch proposal expiry | Deal paragraph | Domain and schema where expressible; candidate retains the role/payment meanings rather than relying on enum labels. |
| A draft is an exact new revision; parent belongs to its author; private draft gives no inventory or reader access | Record paragraph | Record ownership, version/hash, ACL and application checks. |
| Publish/schedule queues exact work for a physical watch and can be interrupted; named audience is not public; commission visibility is separate | Record paragraph | Record/publication scheduling, audience and commission domain. |
| Sharing grants reading, not endorsement or publication; drafting/sharing/speech do not publish | Record paragraph | Separate operations; text may still claim incorrectly, which remains a semantic-evaluation concern. |
| IDs/hashes exact, references plain strings, only accessible sources, no private reference IDs in public text | Record paragraph | Schema/domain check structured references. Preventing prose from leaking a private ID still requires correct model behavior. |
| Commission payment is total, parties derive from author/counterpart, consent requires exact incoming acceptance | Record paragraph | Record economic domain; revision or reproposal cannot forge consent. |
| Only matching publication after acceptance fulfills work; do not claim attachment, completion, transfer or payment before an event | Record paragraph | Event matching is domain. Truthful speech remains SYSTEM only. |
| Full drafts confer available text; catalogue metadata gives neither content nor citation rights | Lookup paragraph | ACL, exact text selection, issued references and lookup bindings. |
| Literal search, empty recent listing, read for next ordinary thought, issued next cursor, refresh, clear | Lookup paragraph | Same lookup schema/domain. Operation syntax and IDs are not duplicated in prose. |
| Lookup uses normal opportunities even while waiting, sends/shares nothing, reviews no channel, implies no work/approval/payment | Lookup paragraph | Existing scheduler, retrieval transaction and attention adapter. No new hidden inference loop. |
| Unavailable focus is not restored; inaccessible text must be shared; saying sent/attached/read gives no access | Lookup paragraph | Retained record/ACL behavior; honest interpretation remains SYSTEM only. |

## Limits and next evaluation

The inspection found no intended capability, consent, privacy, language or physical restriction removed. This is an assistant review of wording coverage, not a semantic-equivalence proof. In particular, moving syntax repetition to the schema can still make a model less reliable even when the schema is unchanged.

Selection used complete actual requests for all25 residents and the unchanged legal three-open/three-closure fixture:6,587–7,903 and8,754 tokens respectively. The stress case remains ineligible for Groq. Selection is based on capability and budget evidence, without a new real-provider evaluation. Compare real outputs separately on factual grounding, useful attention choices, correct exact-offer acceptance or refusal, document access and progress after actual events. Preserve failed samples, keep one ordinary model opportunity per decision, and do not manufacture contracts or publications to obtain a positive result.
