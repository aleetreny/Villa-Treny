# Production protocol: two isolated decisions

Date: 2026-09-08. This is a manual review of the unchanged outputs in `ledger.json` and `report.json`, not a replacement for either record.

The two authorized calls used the actual `prepareSocietyJob` and `workersAIInput` production path with the dynamic JSON schema supplied directly to Workers AI. Each actor started from a separate GENESIS fixture. There was no production mutation, physical watch, reply call, automatic retry or output repair.

## Measured result

| Actor | Provider/domain result | Input/output tokens | Accounted neurons | Latency |
| --- | --- | --- | --- | --- |
| A | Applied | 791 / 130 | 8 | 2,194 ms |
| B | Applied | 734 / 200 | 10 | 1,890 ms |

The provider reported 17.109161376953125 neurons in total. The ledger conservatively accounts for 18 after rounding each call upward. Both reservations were durable before fetch (57 and 56 neurons); the maximum authorized total was 150. The two calls are complete and must not be repeated under these IDs.

Both responses used real recipient and evidence IDs, persisted an active purpose, opened a conversation with the other resident as `nextSpeaker`, and left money unchanged. Neither invented a physical verb, accepted a nonexistent offer, abandoned a nonexistent project, fabricated another speaker's words, or claimed that a purpose was complete. Neither created an offer or agreement. Both selected a social purpose with zero physical steps, which the protocol explicitly permits.

## Content review

- **A is coherent but modest.** Ama privately keeps the wish to write and asks Ulla how to begin. Ulla is an actual known schoolmate in the supplied shared history. This is a plausible first contact towards that wish; it is not evidence that writing happened, that Ulla agreed to help, or that a physical plan will follow.
- **B has an unsupported conversational premise.** Bex's first message says, “I don't know what you're referring to,” and asks what she should be consulted about. The supplied context explicitly had `conversation: null`. There was no incoming message to clarify. The stated purpose matches Bex's want and the recipient Ama has the real Records duty, but the opening reads as a response to a message that does not exist. Domain acceptance does not catch this semantic defect.
- **Evidence is valid by ID, not necessarily explanatory.** Both reflections repeat `world:100:1` three times. This is one available world reference, not three independent observations. The reflection prose mainly restates each actor's own want. It does not demonstrate useful evidence synthesis or memory retrieval.

## What this establishes and what it does not

The new protocol is accepted by the live provider and removes the structural failures seen in these two initial decisions. That is the full demonstrated result. Two independent initial calls do not establish sustained autonomy, plan execution, reciprocal negotiation, consent, work settlement, memory continuity or emergent social quality. The initial grammar intentionally exposes no offer operation; a real subsequent reply is needed to test negotiation.

Before a larger quality claim, evaluate connected turns and the actual physical observation loop. Preserve the semantic failure above in that evaluation instead of counting `applied` as a complete quality score. No further live calls were made for this review.
