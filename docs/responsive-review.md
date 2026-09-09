# Responsive interface review — 9 September 2026

The refinement preserves the approved rooms, authored portraits, typography and iron/paper/brass palette. It changes the observer interface, not the daily protocol, provider, saved posts, collision geometry or legacy world.

## Defects resolved

| Finding | Result |
| --- | --- |
| Centered fixed-width shell wastes the outer viewport | Shared fluid gutters (16–48 px), full-width shell and adaptive columns; long arguments retain a readable measure |
| General button styles draw boxes around resident bodies | Transparent 24×44 native sprite buttons, zero padding/border, including hover; original art and integer camera unchanged |
| Opening/reply labels link to themselves | Openings are plain labels; replies link to the other resident's original opening |
| A source jump only highlights text | The destination scrolls into view and receives focus; a persistent control returns to the reply, summary or question |
| No useful way to share one argument | Copy link creates a dated `/debates/YYYY-MM-DD#post` address, with live success feedback and a selectable fallback if clipboard access is denied |
| Reading mode loses its exit during a long discussion | Sticky reading controls; Escape still exits |
| Mobile navigation or secondary controls crowd the content | Four visible navigation links, stacked reading rows, native selectors, touch targets, safe-area gutters and a compact habitat map |
| Tiny touch atlas targets | Map becomes an orientation preview; the accessible native selector still reaches all visitable rooms |
| Room/follow query changes do not reliably update the page | Same-origin navigation handles query changes and browser Back; selecting a room cancels follow |
| Stopping follow returns to an unrelated old room | Stop stays in the resident's current room; mobile Follow brings the resulting room into view |
| Archive waits for an unrelated latest-board request | Independent query loading, valid URL filters, clear-filter recovery and owned abort controllers |
| Malformed URL fragments can throw | Invalid fragments are ignored without blanking the discussion |

## Verification

- `pnpm check`: lint/types, 72 Node/provenance/evaluator/readiness tests (67 base checks plus five release-readiness regressions), 1,090 application tests and 411 Worker tests passed.
- `pnpm test:browser`: 38 flows passed, including Chromium layout checks at 320×740, 390×844, 768×1024, 844×390, 1920×1080 and 2560×1440; no horizontal page overflow.
- WebKit 26.5 exercised touch reading, source/return links, recommendation, archive filtering, native room selection and follow at 390×844 with a 3× device scale. Native option pickers retain consistent 44 px control styling in WebKit. Zoom controls were measured at a minimum 44×44 CSS pixels.
- Existing browser coverage still loads all 45 visitable interiors, checks integer fit, foreground-aware following, reduced motion, retries, historical records and private-data boundaries.
- `pnpm build`, source-room verification, dry deploy and seven tests of the actual bundled Worker passed. The distribution contains 67 deployable files and 46 room images; raw packs and private runtime files are excluded. Room export verifies 373 foreground masks; legacy art checks verify 11 rasters and 24 authoring dependencies.
- One visual batch inspected board, archive, residents and habitat at 1920×1080 and 390×844, plus reading/reply/summary views, using the actual saved edition **The Restored Hearing Threshold**. Captured pages had no JavaScript errors or horizontal overflow. README screenshots come from that batch.
- Verification uses saved text or isolated fixtures. It does not generate debates, switch models, reset storage or spend inference quota.

## Follow-up: aligned profiles and project explanation

The six resident sheets now share content-sized heading and definition rows within each group of columns. Names, lenses, introductions, habitat links and all four label/value pairs align without shortened text or fixed heights. Single-column mobile and individual profiles keep their natural reading order. The footer now links to `/about`, with an English explanation of the daily question, fictional perspectives, reader controls, cloud schedule and experiment limits.

Eight additional browser regressions pass in Chromium and WebKit: field alignment and absence of overlap at 390, 1280 and 1920 px, plus footer navigation, direct reload, profile links, browser Back and returning to the board. Profiles and About make zero debate API requests. The full browser suite now passes **46 tests**; `pnpm check` and `pnpm build` also pass. One batched visual inspection covered both pages on desktop and mobile, plus profiles at tablet width, with no page overflow or JavaScript errors. The layout detector reported no findings. No inference, room art, personality or saved debate was changed.

## Hosted runner correction

The first GitHub run (`34404581965`, source `803afa5`) stopped before deployment: the historical offer-disposition regression spent 5,362 ms against its 5,000 ms limit on Ubuntu. Its 23 inputs all share one immutable state/turn; compiling the schema once removes redundant work while retaining every assertion and the existing timeout. Production engine behavior is unchanged. The next hosted run passed every check and deployed successfully; its immediate public check briefly saw the previous commit. Readiness verification now requires the exact commit within seven reads, five seconds apart, with regressions for stale, invalid and unavailable responses. Transport or identity errors still fail. See the release verification for the observed public result.

## Practical limits

Browser emulation is not a physical iPhone/Android device test. The camera deliberately preserves native pixels and integer zoom; large rooms can require panning. Existing source-image limitations remain as documented in the art catalogue. The build still reports a 619 kB lazy room/legacy chunk (56 kB compressed); it is separate from the initial forum bundle. These interface checks do not establish the factual correctness or editorial quality of future model output.

See [release verification](release-validation.md) for the actual deployed commit and CI result. The [release guide](releasing.md) explains why daily debates are stored API updates and do not require Git commits or a running laptop.
