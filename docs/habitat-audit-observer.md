# Night Shift observer — audit before extraction

Audit date: 7 September 2026. Scope: the working tree of the portfolio's Night Shift observer, before corrections or extraction into Villa-Treny. This phase changes no product implementation. Room masks and routes have a separate audit by the navigation agent; the findings below concern the observer, camera, rendering, data presentation and interaction.

## Evidence and limits

- Read every current observer component, `useHabitatLive`, `useObserverPresence`, room-art/motion contracts, graph/relationship functions and the relevant CSS.
- The native Mac session remains locked. CUA reported that it requires manual unlocking; no attempt was made to bypass it.
- Browser checks use a **new, headless Chromium process with an ephemeral Playwright profile**, separate from the user's browser/session. The checks load the local development site and only read the public API. They never advance a watch, modify a resident or buy cognition.
- Tests and captures: `/tmp/habitat-observer-audit/verify-ui.mjs`, `verify-more.mjs`, `browser.json`, `browser-more.json`, and the PNGs in that directory. These are diagnostic artifacts, not replacement artwork.
- Pure-code reproductions: `standing-spots.json`, `body-outside.json` and `pure-behaviour.json` in the same directory.
- No P0 issue was established in the frontend. P1 issues below materially obstruct a core observer action or misrepresent unavailable data. P2 issues are narrower defects or weaknesses.

## Priority list

### OBS-01 — P1 — Automatic fit can hide the bottom of a room

**Evidence.** `RoomScene.tsx:61` multiplies the available height by `1.12` before choosing the integer zoom. The image can therefore exceed the actual viewport under the default “Fit room to view” setting. The primary agent reproduced Common at 4× with the lower room and feet below the footer in `/tmp/villa-before-desktop.png`. This is an implementation defect, not evidence that the original room image lacks detail.

**Correction.** Default fit must use the real available width and height, including padding, with no overscan. Keep whole-pixel enlargement. Use manual zoom/pan for inspection. For a viewport smaller than native art, clearly retain a scrollable native-size mode rather than silently claiming the full image fits. Recheck every room after ResizeObserver settles.

### OBS-02 — P1 — Following a resident does not keep them in view

**Evidence.** `HabitatView.tsx:32–34` follows a room ID. In `RoomScene.tsx:66,75`, `followed` only affects highlighting; no scroll offset or camera position follows their feet. Headless reproduction: Follow Quim, increase zoom twice. At 4× in the Near Rooms, his button starts at screen y=681.7 while the viewport ends at y=665.2. The entire resident is invisible, with scroll offsets still `[0,0]`. Capture: `follow-zoom.png`; measured rectangles: `browser.json`.

**Correction.** Track the followed resident's live pose and move a bounded camera to keep them inside a comfortable inset. Define how manual pan pauses camera following, and recenter when Follow is selected again. Keep a clear state if the followed resident is queued because the room has insufficient floor space.

### OBS-03 — P1 — A valid foot position can draw the body outside the room

**Evidence.** Feet reserve 12×8 native pixels, while `ResidentSprite.tsx` draws an opaque torso/arms from sprite x=3…20 and y=14…25 inside a 24×44 frame. `RoomScene.tsx:75` positions that frame at `feet − [12,44]`, above a single flat room PNG, without a render boundary. An exhaustive check of `walkerStandingSpots` against the PNG's alpha finds such positions in **13 rooms**: Bridge, all five Cabins, Camp, Digging One, Dock, Face, Garden, Hold and Yard. Examples:

- Digging One: valid feet `(234,78)` put 36 opaque coat pixels outside the room silhouette, beginning at `(240,48)`.
- Cabin One: valid feet `(106,6)` put the entire tested 18×12 coat region above the image, starting at y=−24.
- Bridge: valid feet `(18,22)` put 205 of those coat pixels outside the image/silhouette.

Data: `body-outside.json`. This is additional to the navigation agent's furniture-footprint findings. It does not justify deleting every floor position within 44 pixels of a wall.

**Correction.** Establish an explicit render boundary and entry/exit behavior, plus a deliberate foreground-occlusion contract where a room needs it. Preserve source wall/object pixels. Give the camera enough padding where an exterior body's overhang is valid. Distinguish collision footprints, projected body size and painted foregrounds; they cannot be represented by one undifferentiated mask.

### OBS-04 — P1 — Unavailable live data can be displayed as an apparently current world

**Evidence.** `useHabitatLive.ts:19–21` initializes the current world with `genesisSnapshot()` and the authored day-100 relationships. On the first failed request it retains this generated world. `HabitatView.tsx:97–101` can display its generated record. At mobile widths, CSS line 238 hides `.ns-connection` entirely, including Offline and Last received. Separately, the observer and status endpoints are coupled by `Promise.all` (`useHabitatLive.ts:43–45`): a status failure discards a successful, newer observer response.

The hook retrieves `status` and `lastConnectedAt`, but the observer does not display their clock health, paused state or last successful read. A successful HTTP read is labelled Live even when the simulation is paused. The public status read during this audit was running/healthy; the paused-state problem is established from the code path, not from a claim that the current live service was paused.

**Correction.** Give initial loading, verified live state, retained stale state and explicit preview data separate states. Do not pass generated genesis events off as received current events. Keep connection/freshness visible on mobile. Accept a valid observer snapshot independently of a status-endpoint failure. Show clock state and age of the last successful read without turning the interface into an operations dashboard.

### OBS-05 — P1 — Landscape mobile can lose the notebook entirely

**Evidence.** At 844×390, the <=960px layout keeps the chamber's first grid row at a minimum 310px (`habitat-observer.css:218`). With the header, almost no vertical room remains for the notebook, while its tabs and footer cannot shrink sufficiently. The headless capture `landscape.png` shows the diary/tabs off the bottom of the screen; this is a reproduced failure, not just an arithmetic prediction.

**Correction.** Use a short-viewport layout in addition to width breakpoints: allow the notebook to occupy a usable panel/drawer/page, or let the whole content area scroll. Keep the room atlas available. Test portrait and landscape independently, including 844×390 and 667×375.

### OBS-06 — P1 — The modal focus trap fails at its initial focus

**Evidence.** Mount focuses the `.nightshift` wrapper, which has `tabIndex=-1` (`HabitatView.tsx:69,104`). The keyboard trap only handles focus on its first/last listed controls (`:80–86`). Headless Chromium: the initial focused element is the wrapper; Shift+Tab moves focus to BODY, outside the dialog. `aria-modal=true` alone does not make the underlying portfolio inert.

**Correction.** In the standalone project use appropriate page landmarks rather than pretending the whole application is a modal. If an embedded modal mode remains, make the background inert and handle the initial wrapper, empty control lists, reverse tabbing and restored focus explicitly.

### OBS-07 — P2 — The relationship matrix is not operable on touch or keyboard

**Evidence.** `Weave.tsx:162–195` renders 625 rectangles, with the 600 values available only in SVG `<title>` hover text. There is no cell selection handler, focus target or readable selected-pair panel. Headless DOM count: **625 rectangles, zero focusable cells**. Alphabetic row/column IDs are not enough to identify the full pair without hover. The mobile CSS also hides the explanatory note.

**Correction.** Add selected-cell state with click/tap and arrow-key navigation, and readable full names plus the selected numeric value/direction. An accessible table or pair selector may serve as a compact equivalent. Do not create 600 separate Tab stops.

### OBS-08 — P2 — Archive failure is also presented as “no matching events”

**Evidence.** Abort a historical archive request after opening day 105: the diary displays both `Failed to fetch Refresh` and `No events match this selection yet.` The empty-state condition (`HabitatView.tsx`, diary rendering) does not exclude `archiveError`. The observer cannot infer an empty day from a failed read.

**Correction.** Keep loading, failure, successfully empty and populated states exclusive. Preserve any verified entries with a stale label. Translate network-level messages into clear observer copy while retaining a useful technical reason for diagnostics.

### OBS-09 — P2 — A room image failure has no direct retry

**Evidence.** `RoomScene.tsx:69,74` sets `failed=true` and replaces the image with text. There is no retry callback. The global Refresh rereads the world/archive and does not reset this state; selecting the same room does not remount its keyed stage. The user must visit another room and return.

**Correction.** Give the room error a Retry action that resets/reloads that asset only. Verify recovery from a one-time failed image request without abandoning the chosen room or follow state.

### OBS-10 — P2 — Visual itineraries jump between nonadjacent rooms

**Evidence.** `observerPresence()` recomputes a walk from the saved location using `distance = beat % 12`. When the cycle wraps, it returns directly to the original location. A 600-second deterministic run gives 358 room changes, **16 of them not adjacent even after the archived corridors are collapsed**. Examples: Vero moves Cabin Two → Garden at second 39; Lior moves Hearth → Hold at second 145. Reopening an individual room also creates fresh walkers at arbitrary standing spots, not at a rendered entry.

**Correction.** Persist a presentation itinerary with consecutive connected steps and a coherent return journey, independent from the intelligence clock. Define visual arrival/departure behavior. The user's authorization to separate intelligence from physical location is preserved; this fix concerns visual continuity only.

### OBS-11 — P2 — Reduced motion does not stop room changes

**Evidence.** `RoomStage` and `ResidentSprite` read the reduced-motion media query when their effects start, but `useObserverPresence` never checks it. Even with body stepping disabled, the atlas, followed room and resident location still change on the presentation clock. Existing effects also do not react to the preference changing while the page remains open.

**Correction.** Centralize a reactive reduced-motion preference. Stop optional presentation wandering and scene transitions consistently while continuing to display newly received world state. Keep actual runtime updates distinct from decorative motion.

### OBS-12 — P2 — Camera and visual positions reset during ordinary inspection

**Evidence.** `RoomScene` keys the stage by room (`RoomScene.tsx:94`). Entering Weave unmounts it entirely (`HabitatView.tsx:126–128`). Zoom, pan, pose routes and waiting state are local to that stage. In the headless flow, zoom 4× before Weave is lost on returning; initial layout briefly uses the hard-coded 400×360 measurement as well.

**Correction.** Retain per-room camera state and presentation state separately from mounted renderers. Only the active room needs to render. Avoid showing a guessed initial zoom before the real viewport is known.

### OBS-13 — P2 — Some numerical relationship cues describe a different quantity

**Evidence.** In Bonds, the displayed number belongs to the selected feeling, but `≠` is based on average asymmetry across all six axes (`Weave.tsx:214,242–243`; `weave.ts:443`). A pair with equal trust 30/30 and resentment 0/100 receives the inequality badge beside the equal trust value. Graph positions use a stable authored `layout(when)` rather than the current received relationships. This stable layout is legitimate, but should not be described as a live force layout.

**Correction.** Make the inequality indicator refer to the selected axis, or explicitly identify it as an all-feelings difference. Preserve stable graph positions if desired and state what the line color/width means. Add a small legend for hidden weak edges and averaged bidirectional graph lines.

### OBS-14 — P2 — Historical location labels and profile context can be misleading

**Evidence.** Diary and profile entries display `ROOM_BY_ID[observerRoom(entry.room)].name`. This relabels a historical Long Walk/Row event as Common, even though the archive retains the original room ID. The button destination may reasonably open Common, but its historical label need not be rewritten. A profile's “Recent events” also uses whichever archive day was selected in the diary, and can show an old day under that heading. Opening another profile preserves the old scroller position while focusing its heading with `preventScroll:true`, so the new person's header may remain out of view.

**Correction.** Separate historical source labels from the observer's present navigation destination. Date the profile event section explicitly. Reset only the profile panel to its heading when changing person, leaving the room camera alone. Preserve authored historical prose rather than silently rewriting canon.

### OBS-15 — P2 — Light and power consequences are not observable in the room

**Evidence.** The received snapshot includes reactor power and per-room `lit` state. `RoomScene` never reads either; its baked room image looks the same for a lit and unlit room. Shared charge/maintenance now appear in the ledger, but the observer cannot see the direct room-light consequence recorded by the engine.

**Correction.** Present the actual room-light state and current power in a restrained, intelligible place. Any visual treatment must preserve the approved art and make clear whether it is a state indicator or a source-image change.

### OBS-16 — P2 — Avoidable repeated work remains in the presentation layer

**Evidence.** Every observer second creates a new complete presentation snapshot even when nobody changes room. RoomStage creates a fresh poses array every 80ms even if all residents are waiting or motion is reduced. Each moving resident owns another 180ms timer. Bonds calls `edges('embarkation')` inside all 24 rows, constructing **14,400 directed edge objects per render**. The measured edge-generation cost was about 2.13ms per Bonds render on this host; this is not evidence of a current catastrophic performance failure.

**Correction.** Reuse immutable boarding data, update poses only when positions change, and use one visibility-aware presentation scheduler. Isolate map/room animation from the journal and graph. Confirm improvements with browser profiling before adding more infrastructure.

## Coverage by feature

| Feature | What was checked | Result / outstanding work |
| --- | --- | --- |
| Room atlas | 45 selectable rooms; sealed Breach; unique source IDs; button/select handlers | All 45 images loaded in headless Chromium. Long Walk and Row intentionally remain outside the room-only selector. Native/touch target review follows camera/mobile correction. |
| Room loading | PNG dimensions, correct image path, active-only mount, failure branch | Active-only rendering works. Direct image retry missing: OBS-09. |
| Fit / zoom / pan | Integer scaling, frame and scroll geometry, manual zoom, return from Weave | OBS-01, 02, 12. Keep source pixels and manual inspection. |
| Residents | Individual portrait/sprite IDs; click labels; reservations; queue message; visible pose extents | 25 identities retained. Mask safety is a separate navigation audit. Body extent defect: OBS-03. |
| Follow | Roster → Quim profile → Follow; correct room selected; cancellation on manual navigation | Room selection works; camera does not: OBS-02. |
| Roster | The 25; name query; profile entry | “Quim” returns exactly one resident. Search is case-insensitive but does not normalize accents or whitespace; this is a smaller usability consideration. |
| Profiles | Focused name, shared home from SLEEPS, lore, week-14 journal, relations, Means & needs | Quim's actual housemates are Lior and Wen. Static authored lore must remain distinct from the evolving log. Some authored field fragments, e.g. Quim's Fears text beginning with a comma, need a copy pass when extracted. OBS-14. |
| Journal | Current snapshot fallback; reverse order; day bounds; room/person filtering; reload errors | Main flow works. Failure/empty distinction and historical labels need correction: OBS-08,14. |
| Shared ledger | Current watch/start date, stores, balances, remaining loans, source null | Received day106/watchIII displayed; 25 account rows present. Null does not invent balances. Existing tests cover outstanding/paid distinction and money conservation. |
| Graph | 25 portraits, six feelings, boarding/current choice, profile affordance | All 25 present. Lines read current data; positions are deliberately stable. Legend and numerical cue clarification: OBS-13. |
| Matrix | 625 cells/600 directed values; direction and full names | Not touch/keyboard operable: OBS-07. |
| Bonds | 24 other residents, current value, boarding/current taper, profile link | All 24 present. Selected-axis cue and repeated generation: OBS-13,16. |
| Live / stale / offline | First load, read failures, coupled status request, mobile visibility | OBS-04. Network reads never invoke mutation/admin routes. |
| Motion preferences | Timer guards and media-query handling | OBS-11,16. |
| Mobile / keyboard | 390×844 offline; 844×390 landscape; initial reverse tab; profile focus | OBS-04,05,06. Final native-browser review remains pending manual unlock. |
| English | Headers, labels, controls, errors, profile headings, dates, title, document language | Title and document lang confirmed English. Proper names keep their canonical accents. Human-readable network errors and a few inherited sentence fragments need refinement. |
| Visual provenance | Approved PNG use, source lattice, legacy silhouette fixes | No art changed in this audit. Earlier halo correction preserved every interior RGBA value; current body projection is the remaining distinct issue. |

## Verification and next phase

The diagnostic browser session emitted no uncaught page errors during its desktop checks. It successfully loaded all 45 rooms and exercised roster/profile/follow, the ledger's 25 accounts, and all three relationship views. Negative-path failures above are intentionally injected in an ephemeral test browser and are not claims that the production API is currently failing.

The first audit script incorrectly waited for the mobile Offline element to become visible; it timed out because the CSS hides that exact element. The continuation uses attachment/state checks instead and records its actual visibility. This test failure is documented rather than presented as a passing visual check.

Before corrections, the implementation list must be consolidated with the runtime, navigation and extraction audits. The final standalone project should have automated browser tests for the key normal flows and the failures above, followed by native visual confirmation. No item in this document has been fixed during this read-only phase.


## Final baseline measurements before implementation

- The auto-fit defect affects 16 of 45 selectable rooms at 1280×800 after the ResizeObserver settles. Common, Stalls and Washroom lose 56.6 CSS pixels vertically; Dig 2 loses 57.6.
- Forced offline at 390×844 displays Day 100 / Watch II and ten Genesis journal entries while the connection indicator is hidden. This confirms OBS-04.
- Reduced-motion mode still changes the room map after eight seconds, confirming OBS-11.
- Eight existing relevant test files pass: 112 tests. These unit tests do not cover the visual failures reproduced here.
- The continuation script completed its camera, reduced-motion and mobile-offline measurements, then hit a test teardown error from an in-flight intercepted request. Its auxiliary status-failure measurement is not counted as a successful browser proof; Promise.all source analysis establishes that defect.
- Runtime audit independently confirms that health can report healthy during repeated rollback; connection and world progress need separate labels.

Implementation is now authorized only in Villa-Treny. The Portfolio source remains the recorded baseline.

## Corrections implemented in Villa-Treny

All changes below are in the standalone project. No source art was drawn or committed. The approved layout, palette, typefaces and 24×44 resident proportions remain.

| Finding | Resolution | Evidence |
|---|---|---|
| OBS-01 | Whole-pixel auto-fit uses actual dimensions, with 2px per side. Extra pan padding applies only to manual zoom. | All 45 rooms checked after ResizeObserver settles: zero cropped images at 1280×800. Pure tests cover every room and the 618px / 204px Cabin case. |
| OBS-02 | Camera centers the followed resident within bounded scroll offsets; a resident without floor space has an explicit named waiting message. | Browser follow at 5× keeps the full body visible with vertical scroll. |
| OBS-03 | All resident rendering is clipped to the approved room PNG’s alpha silhouette. Exact source-object foreground layers use native `bounds`, `mask` and `baseY`; 1px coat seams separate shoulders without halos. | Geometry/source agent supplies measured object masks; full coverage of foreground objects remains dependent on those source exports. |
| OBS-04 | No Genesis fallback is displayed. A saved world must arrive before the room, people or journal render. Network connection is separate from paused/delayed/running/unknown clock state; timestamps and overdue checks are readable on mobile. Status failure does not discard a valid world. | Forced offline mobile has zero events and visible Offline. Forced status503 keeps day106 with Connected / Clock unknown. |
| OBS-05 | Short windows scroll the page, retaining a substantial notebook and sticky left map. | 844×390 screenshot reaches a 389px notebook; 390×844 health remains visible. |
| OBS-06 | Standalone observer is an ordinary page with landmarks and Portfolio link, without a modal role or focus trap. Escape closes only nested profile/Weave views. | Keyboard navigation and source inspection. |
| OBS-07 | Matrix has one roving cell tab stop, arrow navigation, touch selection, From/To lists and an always-visible bidirectional value readout. | Browser ArrowRight updates full names and values; exhaustive pure tests cover all non-self pairs and four directions. |
| OBS-08 | Archive error and genuine empty results are exclusive. Transport failures use English recovery copy and retry. | Forced failed day produces an error and no “No events match” message. |
| OBS-09 | Failed room images have an in-place Retry room action with a fresh request. | Abort → Retry → room loaded browser test. |
| OBS-10 | Presentation routes extend continuously; the old twelve-step return-home jump is removed. Initial route origins persist across saved-world updates. | 3600 seconds of all25 residents cross only adjacent visible rooms, with unchanged diary/state data. |
| OBS-11 | Motion preference changes are subscribed live. Hidden pages and reduced motion pause presentation clocks; the observer also offers Pause wandering. | Shared preference hook and motion controls; no per-resident timers remain. |
| OBS-12 | Per-room camera/occupancy cache retains chosen zoom, pan and poses. RoomScene remains mounted while Weave is shown. Dimensions are measured before showing the image. | Browser5× zoom retained after Weave. |
| OBS-13 | Bonds compare the selected axis in both directions. Graph caption identifies authored positions and current relationship lines. | Equal trust / unequal resentment regression. |
| OBS-14 | History keeps the recorded room label; a link can still navigate to its current visible destination. Profile events name their selected day; switching person scrolls their heading into view. | Dossier and archive source paths inspected. |
| OBS-15 | An unlit room is explicitly labeled; reference artwork stays visible rather than fabricating different source lighting. | Scene state is read from the verified world’s room record. |
| OBS-16 | Boarding edges are cached once; portraits and sprites are memoized; sprite frames share the room clock; idle poses do not publish new state; route clocks publish only at crossings. Conditional ETag reads avoid unchanged large payloads. | Cache/source inspection, ETag304 regression, no browser JS errors. |

Verification artifacts: `/tmp/villa-observer-review/results.json`, `regressions.json`, screenshots and read-only browser scripts. The first continuation harness encountered a transient load while files were being edited, and a later selector was too broad; corrected runs used a captured real observer response with explicit error injections. Neither error was reported as a passed test. Final project CI is owned by the primary agent.

### Browser regression coverage, 7 September 2026

The repository browser suite now passes **11 tests** in an isolated Chromium context against fixed, recorded observer/status/archive responses. In addition to loading all 45 rooms, failure recovery and short/mobile layouts, it exercises:

- Matrix keyboard focus across cells, diagonal skipping, wraparound, Enter/Space activation and leaving the matrix with one Tab stop. Both directional values are checked against the recorded relationship data.
- Following a resident already placed on clear floor through the roster, zooming to 5× and resizing to 390×844. The complete body stays inside the viewport and the camera actually pans.
- Changing the operating-system motion preference while the page is open. With a virtual browser clock, 120 seconds of reduced motion preserve exact room occupancy, sprite coordinates and canvas frames; normal motion then produces room crossings; restoring reduced motion freezes them again. The saved day/journal remain unchanged and no API mutation is sent.

The first Matrix run exposed a test selector mismatch: Playwright's label-text matcher included the wrapped option text. Using the combobox's computed accessible name matches the browser accessibility tree. The final complete run passed in 5.7 seconds. These checks do not claim to test the live external cognition provider; their world inputs are deliberately fixed to isolate observer behavior.
