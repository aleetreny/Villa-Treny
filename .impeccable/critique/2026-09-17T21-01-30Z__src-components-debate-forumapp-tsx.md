---
target: Villa Treny board reading experience
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-09-17T21-01-30Z
slug: src-components-debate-forumapp-tsx
---
# Villa Treny board reading review

Method: dual-agent (A: /root/board_design_review; B: /root/board_evidence_review). A completed before detector findings entered synthesis. Source: src/components/debate/ForumApp.tsx; public desktop homepage, archive and 10 September edition at 1280 by 720. See docs/daily-forum-review-2026-09-17.md for runtime failure, debate-content findings and the narrowly scoped transport correction.

## Design specificity and overall impression

A strongly authored reading room: pixel headings and portraits, dark iron surfaces, warm paper text and fine rules. Preserve this visual world. The key opportunity is access to readable content and better handling of unavailable editions.

## Design health

| Heuristic | Score | Evidence |
| --- | --- | --- |
| Visibility of status | 2 | Held editions also described as upcoming/preparing |
| Match with the real world | 3 | Familiar prose; essential premise initially hidden |
| User control | 3 | Source return and reading-view exit verified |
| Consistency | 4 | Coherent typography, controls and navigation |
| Error prevention | 3 | Simple controls; voting protections source-reviewed only |
| Recognition over recall | 2 | Complete editions buried; case context appears late |
| Efficiency | 3 | Summary shortcuts, archive controls, reading mode |
| Aesthetic and minimalist design | 3 | Clear hierarchy, dense paragraphs |
| Error recovery | 2 | Recovery link mostly leads to more unavailable editions |
| Help and documentation | 3 | Fictional framing and visible About link |
| Total | 28/40 | Subjective reading-interface review |

## What works

- Distinct pixel identity with ordinary readable prose.
- Clear title/question hierarchy, post count, reading estimate and summary shortcuts on completed editions.
- Quotation-to-source navigation, focused destination and return controls preserve reading context. Reading mode exits with its control or Escape; archive search finds the completed edition.

## Priority issues

1. [P1] Held-day presentation conceals available reading. Homepage promises an upcoming question while stating failure; four recent links say preparation. Seven empty archive entries precede the first complete discussion. Link directly to the latest completed edition, distinguish held/preparing states and reduce the prominence of empty history. Suggested future commands: clarify, harden, layout. Sources: ForumApp.tsx:96, 120, 139, 145.
2. [P2] Essential scenario premises are hidden as optional background. A reader can enter the education discussion without first seeing the sleep-suppression premise. Show a short factual lead before reading shortcuts and keep full context/established facts in the disclosure. Suggested future commands: clarify, distill. Source: ForumApp.tsx:85.
3. [P2] Arguments lack paragraph breaks. All 24 actual posts are single paragraphs; rendering already supports blank-line paragraph boundaries. Prefer meaningful paragraph breaks in future generation and preserve accepted history. Suggested future command: typeset. Source: ForumApp.tsx:43.

## Personas, cognitive load and emotional journey

A newcomer can conclude there is nothing to read. A returning reader must traverse empty dates to recover the latest discussion. Four main navigation choices are manageable; the grouped six-person roster does not block reading. Source-return controls reduce recall demands. Chunking and progressive disclosure are the main cognitive-load weaknesses. The portraits and question create interest; empty dates create the largest emotional valley; an actual discussion restores confidence and the linked summary provides an ending.

## Detector and minor observations

The detector ran once over src/components/debate and returned [] with exit code 0. No ignore file, rule findings, locations, suppressions or false positives. The clean mechanical result does not contradict the live state/content problems.

Expand board and Exit reading view use different names for one mode. A next/previous completed-edition link could help continued reading. DESIGN.md is newer than .impeccable/design.json; refreshing that sidecar with document is an optional follow-up, outside this review's implementation scope.

## Decisions for a later UI pass

The owner requested review and only clear defect corrections, so UI decisions are deferred. Decide whether the homepage should lead with the latest readable edition plus a truthful current-day status; which scenario facts must always be visible; and how to produce paragraph breaks in new posts without rewriting accepted history.
