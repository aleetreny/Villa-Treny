# Exact-offer acceptance audit — 8 September 2026

No protocol defect was found that explains the repeated proposals in the three public synthetic [final-dialogue responses](model-society-final-dialogue-local-2026-09-08/review.md). Each incoming offer and its exact terms were present in USER `openOffers`; its ID was also present in the supplied evidence and the schema's `deal.kind: accept/reject` option. Worker/payer roles were consistent.

| Stored response | Incoming offer | Actual model outcome | Separate counterfactual audit |
| --- | --- | --- | --- |
| J, sequence 44 | `offer:70`, due 401 | New offer 75, due 402 | Explicit acceptance passes; exact terms preserved |
| L, sequence 45 | `offer:75`, due 402 | New offer 79, due 401 | Explicit acceptance passes; exact terms preserved |
| J, sequence 46 | `offer:79`, due 401 | New identical offer 83, due 401 | Explicit acceptance passes; exact terms preserved |

All three actual responses remain proposals: **zero agreements or payments**. The first two change a deadline. The last repeats identical terms despite its prose saying it accepts. The engine correctly does not infer consent from that prose.

The [machine-readable evidence](accept-flow-offline-audit-2026-09-08.json) binds the ledger, scene and archived source bundle, and hashes all three jobs, schemas, request payloads and raw responses. Each recorded response reproduces its saved application hash. Independent clones substitute an explicit `deal: {kind: "accept", offerId: …}`; all three pass the saved JSON Schema and canonical application, create an agreement with unchanged terms, and replay without another effect. **These substituted acceptances are test inputs, not model outcomes.**

Native XGrammar 0.2.3 accepts all three counterfactual acceptance strings and all three originals under their exact stored schemas; it rejects three invented offer IDs. This checks grammar membership without loading a tokenizer or model. Application code matches the archived bundle; later instruction/producer wording and package scripts do not regenerate or replace the saved inputs used here.

No HTTP, inference, production data, private prompt text, ledger writes or core edits are involved. This narrow result does not establish reliable model obedience or successful negotiation across the population. No automatic acceptance or interpretation of prose is recommended.
