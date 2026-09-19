# Reader review — 19 September 2026

## Why the format changed

The local checkout, GitHub main and public release initially matched `0e519ae4e676e64dd6ca7fa56a379ebd93c9e139`. The published **The Automated Shift** completed normally: 15 requests, 12 posts and a summary. That did not make it a satisfying conversation. Five openings repeated the rent argument, several used the same landlord joke, and most assigned replies restated a position. The reader also had to expand the scenario before knowing enough to follow the arguments.

The owner asked for understandable, enjoyable discussion, stronger voices where useful, and repeated real simulations with structural changes allowed. This review treats schema success and editorial success separately.

## Selected change

Protocol `villa-debate-v6` uses nine chronological contributions, generated separately. Every resident sees the complete conversation so far. All six speak; three return to a point, with that allocation rotating over six dates. Contributions usually target 6–25 words; a direct question or answer needs no padding. Their priorities and the costs they will accept help distinguish the voices without assigning an opinion.

The case is visible immediately. Compact rows put each original pixel portrait beside the name, response link and body. New editions have one conversation; older editions retain their round headings, original text and quotations. The final request selects two highlights. The server quotes the original contributions and names, without a generated verdict or claim that the speakers disagree. Earlier attempts at paraphrased recaps failed even after stricter attribution checks.

One edition normally needs 12 requests instead of 15. Gemini 3.5 Flash Lite, the 20-attempt edition cap, model quotas, schedule, Worker identities, storage and original artwork remain unchanged. Reading, recommending and visiting rooms never invoke inference.

## Experiments that did not earn a production change

Twenty-one initial private prototype experiments compared whole-script writing, planned exchanges, shorter prompts, separate turns with dynamic or fixed order, a larger model, and copy editing. Two later single-turn checks revisit the misunderstood dinner proposal. Some experiments revise the same case; they are not distinct daily editions. Raw requests, responses, failures, source snapshots and reservations are retained under ignored `.local/reader-review-2026-09-19/`.

- Whole-script variants frequently reduced the cast to slogans, invented personal anecdotes or introduced unsupported facts.
- Dynamic handoffs spent too many lines asking who should speak next. Twelve guided turns often exhausted the argument before the ending.
- Very short output alone produced empty statements. Removing minimum padding while requiring a concrete contribution was more useful.
- A final copy editor removed some filler and an invented formal debt, but retained repetition and substituted an unanswered closing question. It was not added to the production path.
- Four Gemini 3.8 Flash comparisons produced one successful response and three provider errors. The successful book dialogue had a stronger ending, but did not establish dependable production performance. All four attempts remain charged; there is no model switch.

## Native generator trials

Fourteen full trials covered all twelve subjects. Each completed in twelve requests with nine contributions: 168 requests and 126 contributions in total. These run the actual production core and freeze nine source files, every request and every response. Dates are sampling keys for topic and speaker rotation; none of these future dates was published or adopted into production. All cases, contributions and full recaps were read, including unsuccessful iterations.

| Run | Actual subject / case | Result and interpretation |
| --- | --- | --- |
| 01 | Technology — The Location Map | 12 requests / 9 turns. Clear exchange about a reassuring text versus an obligation to check in, but too much repeated choice and scene detail. Led to removing padding and separating the stored position from the spoken line. |
| 02 | Bodies — Julian's Knee Surgery | 12 / 9. Easy language, weak discussion: unsupported claims about future mobility and repetitive agreement. The run name mistakenly says belief; the saved domain is bodies. Led to stronger grounding and preference for competing human wishes. |
| 03 | Education — The Academy Deadline | 12 / 9. A useful exchange about leaving for a band and facing one's parents, followed by an invented formal debt and repeated repayment questions. Recap named Ama while citing Bex. This prompted visible-speech-only summary input and author-reference validation. |
| 04 | Knowledge — The Hidden Truth | 12 / 9. Stronger differences about truth and family loyalty, with a change of mind. The premise wrongly forced expose-or-destroy and guaranteed a family rupture. Editorial instructions now explicitly remove those devices. |
| 05 | Culture — The Unfinished Manuscript | 12 / 9. Readable disagreement about readers' benefit versus a final promise. Returning speakers answer one another; the ending directly challenges calling a broken promise mere friction. One reply is weakly phrased and some lines minimize the other side's cost. |
| 06 | Belief — The Memorial Prayer | 12 / 9. Clear opposing advice, but little development beyond honesty versus comfort. Too solemn and repetitive to establish the desired variety. |
| 07 | Relationships — The Weekly Private Evening | 12 / 9. A useful monthly-dinner suggestion was misread as replacing the existing weekly meeting; that misunderstanding propagated. This prompted an explicit private reading of the target before composing a reply. |

The batch launcher was stopped after these findings; the active relationship trial completed and its full usage was registered. Three further planned runs did not dispatch. The next iteration adds a daily mix of light, awkward and ambitious situations, supplies recent case contexts so that repeated underlying stories are visible, and asks each resident to identify what the selected neighbour actually proposed before responding. That private reading is never displayed as part of the conversation. Advice must offer something useful beyond saying that the decision belongs to the person.

The next nature trial, **The Free-Roaming Feline**, completed in 12 requests. It explored an enclosed patio, indoor toys, puzzle feeders and a harness, a more practical progression. Some lines still exaggerated outcomes. Its recap enumerated all six speakers, prompting a 45-word/two-resident overview limit. In the targeted dinner check, private paraphrasing alone did not prevent the original assumption. A further fair-listening example produced a question about whether private time was protected rather than asserting that it was lost. That single result is limited evidence, not proof of general understanding.

The next six full trials revisit weaker subjects and extend the coverage. Each uses the real daily pipeline, not a hand-written replacement dialogue.

| Run | Subject / case | Editorial reading |
| --- | --- | --- |
| b02 | Space — The Delayed Transmission | Clear, short disagreement about consulting a distant partner, but most speakers favour autonomy and the premise makes the request too controlling. The recap improperly recommended an answer. This led to an explicit neutral-reporting instruction. |
| b03 | Justice — The Workshop Suspension | The opening repeats agreement. The discussion becomes more useful when Edda asks who can waive a penalty and Cato challenges leaving an ignored rule on the books. Some claims about a closed board exceed the premise. |
| b04 | Democracy — The Weekend Market Conflict | Cato proposes moving stalls; Bex suggests using the foot traffic; Dima points out that this adds work rather than restoring quiet. The recap reports positions without choosing for the reader. Some speakers exaggerate commercial urgency into survival or describe a petition too harshly. |
| b05 | Work — The Sunday Bakery Contract | The conversation moves from repair money versus Sunday rest to whether staff consultation is meaningful if refusal is not accepted. Edda's final line answers that question directly. Dima invents a specific roof problem, and later speakers inherit it; valid fact IDs do not prevent that error. |
| b06 | Belief — The Birthday Gift Exchange | A lighter situation and concrete alternatives: secondhand objects, a meal or an adventure. Too many turns repeat asking the recipient. Its recap falsely treats caring for someone and suggesting an adventure as opposing positions. |
| b07 | Relationships — The Lakeside Cabin Sale | A clear disagreement between selling a shared cabin and borrowing to keep it. Several proposals address financing, but Bex repeats the same slogan and later speakers overstate whether a loan will work. Legible, with weaker development than the bakery exchange. |

The last four dialogues contain 151–174 words each, compared with 660 in the published baseline. They are much easier to read, with visible moments of progression, rather than twelve miniature essays. That does not make every case equally engaging. Culture and the bakery have the clearest exchanges; belief and the cabin show why brevity alone is insufficient. The release decision favours this more readable format and removes the unreliable recap layer, while retaining the weaker samples as evidence of the remaining work in model quality.

## Why the recap became two quotations

Four targeted recap retries removed the instruction to find contrasting proposals. Belief correctly returned no disagreement, but the bakery retry still labelled two recommendations to take the contract as opposing sides. The relationship retry exceeded the two-name overview bound. These failures remain in the private `p24-*` receipts, including the rejected result and its charged request.

The final design removes that paraphrasing stage. The model selects two post indices, and the server supplies the exact text, author and source link. An archive card uses the first named quotation. The interface says **Worth thinking about**, not that those speakers disagree or that the case has been settled. Import checks reject rewritten quotations, nonexistent references, repeated authors and reversed reading order. This preserves traceability without pretending to validate semantics.

Four targeted selection runs (`p25-*`) use the saved democracy, work, belief and relationship conversations. All four completed with valid literal selections. They test the final production task and schema without generating another set of speeches. Their complete results are recorded separately from the fourteen full editions; originals are never overwritten. Exact replay against the final source matched the eleven earlier requests for each case, all 36 accepted contributions and the four new selection requests. Replay itself made no inference calls. The receipt checks all nine production/evaluator source hashes and the separate manual harness.

The complete manual evaluation ledger contains 217 Lite requests and four Flash requests, including every failure. There were 23 initial experiment families, then the two four-case recap/selection comparisons, in addition to the fourteen full editions. The 15 existing production requests are separate. Cumulative external usage was registered with the existing quota guard; neither allowance nor model was changed.

## Verification and remaining limits

Visual checks used actual generated editions at desktop width and a 390 px phone viewport. The premise is visible, three short contributions fit comfortably in the reading flow, response links are distinct, and the original portraits retain integer scaling. The final phone page measured 390 px content width in a 390 px viewport. The private preview explicitly labels its dates as simulation sampling keys, not published editions. The final literal-highlight view was also checked on the phone viewport. Phone verification is emulation, not a physical-device claim.

Local checks pass 72 Node tests, 1,090 application tests and 430 Worker tests, including complete v6 generation, short questions, fair turn allocation, retries, stale results, invalid references, literal highlight validation, v5 imports and completion-gated recommendations. Build, all 46 room exports, 373 foreground masks and 11 legacy rasters pass. The final full browser run passes all 58 checks across Chromium and WebKit, including layouts from 320 to 2,560 px. Two obsolete About copy expectations from the earlier browser run were corrected before that full pass. The actual dry-run Worker bundle passes all seven hosting checks with zero external requests. Automated checks do not invoke live inference.

This is an editorial improvement, not proof of perfect or endlessly novel conversations. The model can still repeat itself, misread a neighbour, invent a detail, overstate a cost or write an awkward line. Exact fact IDs and valid links cannot establish semantic faithfulness. These are qualitative readings of one model's samples, not a blinded human preference study. The failed trials remain visible evidence.

Eleven public editions and their private attempt exports were saved outside the repository before release. Those edition exports are not a complete backup of every database table. No database migration or replacement of archived history is part of this change.
