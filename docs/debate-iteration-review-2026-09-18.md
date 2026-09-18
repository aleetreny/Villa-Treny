# Iterative debate review — 18 September 2026

The owner requested several real simulations with adjustments between them. This review follows the earlier conversation-style release, `0d02042`, rather than treating its one finished sample as evidence of consistency.

## Method

Each run uses the production core and Gemini 3.5 Flash Lite. The evaluator saves the real requests, responses, source snapshots, validation failures and consumption under ignored `.local/daily-debate/`. The added editorial source is included in the frozen source manifest. Tests remain offline; these are explicitly requested manual evaluations.

The series starts with actual published cases as recent history and adds its own completed cases. Test dates select topics and speaker rotations; they are not published editions. A local wrapper restores the original evaluator history and registers cumulative external usage after every run, including failures. It checks cloud usage as well as local reservations before starting. No sample replaces a public edition.

Readability, coherent premises, distinct priorities, faithful replies and conversational progress are assessed by reading the full outputs. Request success and word counts are not quality scores.

## Observations and changes

1. **Technology, original v4: held after four requests.** The writer invented a carpenter’s square that could not be moved between jobs. The editor defended the restriction and repeatedly failed context length and exact-excerpt checks. No posts were admitted. Instructions were shortened, editorial review moved before selection, generation bounds tightened, and controlled retry guidance moved to the beginning of the system prompt as well as the user payload.
2. **Technology, first v5 iteration: twelve posts in eighteen requests.** An audio recorder that upset an aunt made five voices repeat the same answer, while Bex defended the gadget without a compelling benefit. Several replies manufactured a disagreement between people who agreed. Two long replies and one long summary needed retries. The reply schema now asks for its conversational move before prose, caps each paragraph at 240 characters and supplies first names. The private move label is never a public post field.
3. **Relationships, second iteration: twelve posts in fifteen requests.** Everyone wanted a hidden, ruinous debt disclosed. Replies acknowledged agreement and the summary correctly reported no disagreement, but the premise was too one-sided. Some replies repeated an opening or claimed that disclosure would preserve a home, which the case did not establish. More general prompting was not enough to make the initial dilemmas reliable.
4. **Nature, editorial starting points: twelve posts in fifteen requests.** A beaver wetland flooded a farmer’s field. Cato favoured wildlife; the other five favoured restoring farmland. Edda proposed that neighbours should pay if they wanted to retain the wetland and directly challenged Cato’s minimisation of the farmer’s loss. This was a concrete exchange, though several voices still exaggerated or discounted costs. The voice prompt now explicitly asks speakers to preserve the scale of the stated loss; the recap focuses on the main contrast.
5. **Space, final version: twelve posts in fifteen requests.** A one-way settlement mission conflicts with a partner’s wish to remain together on Earth. Ama, Bex and Edda favour leaving; Cato, Dima and Ferran favour staying. Both sides acknowledge a major loss. Edda challenges Dima for calling ten years of preparation a shiny prospect; Ferran challenges Edda’s description of staying as merely keeping the peace. The exchange is sharper and understandable. Repeated predictions of resentment, melodrama and a formal recap introduction remain visible.
6. **Relationships, same final version: twelve posts in fifteen requests.** A grandfather’s planned coastal move conflicts with childcare he promised so his daughter could take a job. Five favour paid care and letting him move; Dima defends the commitment. The replies address the cost of freedom and reliance on a promise. This is still imperfect: several speakers equate requesting a delay with confinement, and Cato turns losing most additional income into losing all income. The summary’s shared-ground statement restores the accurate distinction. These are observed limitations, not passing quality checks.

The final editorial library has **36 starting points across twelve subjects**. They supply credible competing wishes rather than arbitrary physical traps or a duty to defend an obviously harmful action. The model adds names and a concrete setting; the editor checks the result. Neither the starting points nor the editor assign positions to residents. Recent history helps avoid repeats, but the library is finite and does not guarantee unlimited novelty.

Protocol v5 keeps the existing characters, model, schedule and request caps. Drafts and voices receive more reasoning room, and the editor uses high reasoning. This can increase tokens per request. Earlier cases, posts and stored drafts remain readable under their original archive contracts.

## Limits

These interventions improve the starting material and shorten the exchange; they do not prove semantic accuracy or entertainment value for every future edition. Agreement is allowed. Repeated phrasing, melodrama, minimisation of a cost and unsupported predictions remain things to watch. A small series is evidence of observed behaviour, not a success-rate estimate.

## Results and verification

| Trial | Requests | Posts | Words across posts | Outcome |
| --- | ---: | ---: | ---: | --- |
| Original technology | 4 | 0 | — | Held by validation |
| Audio logger | 18 | 12 | 649 | Complete, weak premise |
| Hidden debt | 15 | 12 | 641 | Complete, obvious answer |
| Wetland | 15 | 12 | 626 | Complete, real disagreement with exaggerations |
| Settlement mission | 15 | 12 | 656 | Complete, three favour each main choice |
| Coastal cottage | 15 | 12 | 657 | Complete, five favour moving; Dima opposes |

The six trials consumed **82 actual requests** and produced **60 posts**. All calls, including failures, were registered as external usage. Together with the earlier 48 local calls, cumulative external usage reached 130; the existing fifteen cloud calls were unchanged. The last four trials needed no retries. This is an observation from the series, not a forecast failure rate.

The two final samples each display an estimated four-minute read. Their openings contain 60–80 words and replies 38–47, with two paragraphs per post. Both runs were replayed without inference against the final source: all nine source hashes, thirty recorded requests, validation results, twenty-four posts, cases and summaries matched.

- `pnpm check`: 72 Node checks, 1,090 application tests and 424 Worker tests passed.
- `pnpm build` and distribution validation passed; the existing archived-observer bundle size warning remains.
- Seventeen focused browser checks passed, including WebKit touch, old and new post formats, and layouts from 320 to 2,560 pixels.
- Forty-six source rooms and 373 foreground masks verified; no artwork changed.
- Worker dry run and seven bundled hosting checks passed.
- Ten real public snapshots and ten private exports parsed under the new archive contracts without inference. Production preservation is checked against separately saved pre-deployment snapshots and scheduler diagnostics.

The full trial reports, receipts, metrics and final replay evidence remain in ignored local storage. This change applies to new editions; existing published discussions retain their original text.
