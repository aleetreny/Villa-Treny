# Audit implementation and verification

7 September 2026. This report closes the [accepted improvement list](audit-improvement-plan.md), which was written before implementation from four independent audits. The earlier reports retain their original failing evidence. They are not lists of defects still present in this version.

## Scope and preservation

The audit covered the 45 visitable rooms, 25 resident identities, visual movement, observer and its negative states, all primitive action contracts, scheduled watches, economy, private knowledge, persistence, provider routing, quotas and extraction boundaries. The work was implemented in the dedicated Villa-Treny checkout. No room or furniture art was generated, and the existing Night Shift interface identity was preserved.

The source copy contains 506 verified original files. A separate full archive preserves 762 Portfolio working files, Git refs, staged and unstaged patches, and the unresolved-commit merge metadata. The extraction includes original RoomLab corridors so they can be reused. Secret files, private local databases and Portfolio dependencies are excluded from Villa-Treny.

## Findings and resulting behavior

| Findings | Implemented result | Evidence |
| --- | --- | --- |
| A01–A03, A09 | Independent entry point, page landmarks, dependencies, fonts, styles, configuration, documentation and CI. Escape closes nested inspection; the Portfolio link is explicit. | Standalone install, lint, typecheck, production build and browser suite. |
| A04, A08 | Source archive and extraction hashes; preserve the existing Worker/DO identity. Portfolio main is kept separate from Habitat. | `extraction.md`, `extraction-source-hashes.json`, continuity checks below. |
| A05–A06 | Reproducible room export and independent furniture probes, in addition to metadata consistency tests. | `rooms:export --verify`, navigation tests and PNG evidence. |
| A07, NAV03 | Visual walking follows connected, stable itineraries. The observer explicitly distinguishes it from saved decisions and economics. | Itinerary, reduced-motion and browser tests. This separation follows the user's requested omnipresent agency. |
| NAV01, NAV05 | The full 12×8 native footprint is tested against 1 px floor geometry, including every interpolated step. Eight independently identified furniture collisions are blocked. | Eight illustrated probes; 80 navigation/movement tests. |
| NAV02, NAV06 | Initial positions connect to a real opening. All five northern cabin accesses work. Washroom preserves two separate compartments with their own entrances. | Entrance paths, component diagnostics and north-boundary tests. Physically free but inaccessible ground remains visible and separately diagnosed. |
| NAV07 | Native footprint reservations, detours, ordered admission queues and bounded movement. Residents are not silently discarded when a small room is crowded. | 25 visitors in each of 45 rooms for 12 seconds: no footprint overlap, obstacle crossing or lost identities, with movement in every room. |
| NAV04, OBS03 | Source-pixel foreground masks and room-alpha clipping stop bodies being drawn over verified foreground objects or outside the scene. | 368 source-alpha masks in 43 visitable rooms, 373 including archived Breach. Every mask checked against original alpha. Remaining source limitations are detailed below. |
| OBS01–02, OBS09, OBS12 | True integer fit, bounded follow camera, explicit panning, direct room-image retry and retained per-room camera/poses. | All-room browser fit, 5× follow on desktop and mobile, retry and Weave round trip. |
| OBS04, OBS08 | No fictitious current world while disconnected. HTTP connectivity, saved world availability, clock health and archive errors have separate states. | Offline, status failure, paused world and archive failure browser tests. |
| OBS05–07, OBS13 | Short-landscape notebook access, standalone page semantics, keyboard/touch Matrix, correct directed relationship labels and values. | 844×390 and 390×844 checks; real arrows, Enter, Space, Tab and reciprocal value assertions. |
| OBS10–11 | Adjacent visual itineraries, reactive reduced motion and explicit pause. Motion never changes the saved journal or invokes a provider. | Virtual-clock browser checks freeze/resume room, sprite and minimap positions without API writes. |
| OBS14–15 | Historical location names and profile dates remain truthful. Actual light/power state is visible. Twenty room descriptions were corrected against their images, preserving people and canon. | Room-name, profile, society and room/tiles tests; review of all 45 images. |
| OBS16 | Shared immutable relationship calculations and one animation schedule; unchanged world reads avoid unnecessary projection/render work. | Observer behavior tests and conditional HTTP reads. Lossless bitmap compression reduces the main JS from 4,003 kB before compression to about 900 kB with the expanded depth masks; gzip about 146 kB. |
| E01 | Empty meals or one unit of water cannot roll back an entire watch. Logical world capacity is independent of sprite-room crowding. | Resource-boundary, full-destination and SQLite watch tests. |
| E02–E03 | Model intentions run before routine. Accepted visits persist as bounded plans; one sustained interaction per participant avoids iteration-order races. | Accepted movement, interrupted plans, social ordering and second-interaction regressions. |
| E04 | Failed, rejected and unavailable cognition advances opportunity fairness. Invalid output is validated before acceptance and can use fallback. | All 25 subjects receive turns even through consecutive failures; invalid-primary/valid-fallback attempt tests. |
| E05 | Failed or overdue watches become degraded; successful progress is tracked separately from reachable HTTP. | SQLite error/overdue tests and observer status checks. |
| E06–E07 | Finite emergency access to food and water, real maintenance/energy recipe limits, lower-output manual work and material repair costs. Actual shared meals/work can satisfy companionship. | 5,730 simulated days, zero critical physical conditions in the tested scenarios, companionship minimum 30, bounded stocks and preserved accounting. |
| E08–E09 | Irrelevant action fields cannot create remote memories. Stored identities, positions, time, participant uniqueness and domain state are validated. | Action-context tests and tampered-state rejection, including future diary events. |
| E10 | Deterministic context packing has a hard 6,500 UTF-8 byte bound, keeping all action verbs, authorized fact IDs, due obligations and the most recent memories. | 361 official-tokenizer measurements: maximum 1,860 input tokens including 64 framing tokens; output allowance excluded. This measured sample maximum is not a universal tokenizer guarantee. |
| E11–E12 | Unsupported arbitrary enqueue returns 410; old unsupported pending jobs are retired by migration. Workers AI has a 45-second deadline and ignores late output. | Queue retirement, timeout, quota and late-result tests. |
| E13–E14 | Counterpart agency, commitments and learned facts have persistent consequences and provenance. Model proposals do not reveal another person's secret IDs or private reverse feelings. | Agency tests and independent whole-prompt privacy review. |
| E15 | Economic account events can be replayed; versioned checkpoints cover both state and metadata in their checksum. Migrations retain exact prior state. Authenticated recovery is read-only. | Account replay, six tampering cases, migration and authenticated recovery tests. |
| E16 | ETag/304 avoids retransmitting unchanged worlds. Reserved quota, actual usage and every provider attempt remain distinguishable. | HTTP validator, CORS, fallback and quota ledger tests. |

The independent engine review found five additional defects in the first implementation, all corrected and reproduced again: foreign secret IDs in the output schema, private reverse axes, checksum metadata exclusion, future/duplicate diary participants and a second sustained encounter. A final packing review also caught loss of recent memories through early list truncation; a 32-memory regression now checks the newest four.

An independent extraction review additionally found raw licensed spritesheets being copied to the deployable by Vite's public-directory default. Production now copies only final room scenes and fonts; `scripts/verify-distribution.mjs` runs as part of every build and rejects source-only packs or private runtime files. Local RoomLab keeps the original resources in this private repository.

## Long simulation evidence

`docs/society-validation-after.json` records seed1 for 5,000 days and seeds7/23 for 365 days each. These run the actual engine offline with no provider calls. Physical condition minima remain above18; companionship remains at least30. Resource stocks remain inside capacity. The largest currency-conservation discrepancy is approximately 1.03×10⁻⁹ cells; the largest replay discrepancy is approximately 4×10⁻¹⁵. All25 residents receive cognition opportunities. This is floating-point tolerance, not unrecorded currency creation.

The emergency mechanism spends actual stock instead of minting money. Lending produces durable repayment obligations and dated events. At very low power, manual production remains possible at reduced output. These are causal simulation rules; they do not guarantee that every future narrative will be interesting.

An additional offline run starts from the actual preserved revision27 world, instead of genesis. Over120 watches (30days), with120 serialization round trips, all25 residents persist, physical conditions remain at least26.2, companionship at least21, and currency error stays below3.5×10⁻¹³. These inherited-world minima are distinct from the genesis-run figures above. No provider was called and nothing was written to the live world. See `current-world-validation.json`.

## Verification record

- Frontend/domain unit suite: 716 tests passed in 24 files.
- Browser suite: 11 tests passed, covering all45 rooms plus offline and failure paths, keyboard Matrix, follow camera, mobile/landscape and reduced motion.
- Source export: all46 source PNGs and their metadata reproduced exactly. PNG equality compares decoded RGBA rather than encoder bytes.
- Five source-provenance regressions reject changed authoring inputs, changed canonical raster bytes, missing required provenance and incorrect selectors, while accepting the original sources.
- Production build: passed, including an additional `/Villa-Treny/` base-path smoke check. The compiled room image and self-hosted fonts loaded with no page or HTTP errors.
- Source boundary scan: no symlinks, credential-shaped secrets, private environment files or Portfolio runtime imports in the extracted application.
- Worker suite: 70 tests passed in 10 files, with generated binding types and TypeScript verification. The 60 engine tests are included in the 716 application/domain total, not an additional total.
- `pnpm check:all`: passed on the stabilized code, including lint, typecheck, units, Worker, build/distribution checks and all11 browser flows.
- Distribution contains59 files and46 finished rooms, with no raw spritesheets or runtime credentials. Vite retains a non-fatal advisory for the approximately900 kB uncompressed data-heavy main chunk; it is not hidden by increasing the warning threshold.
- Portfolio `pnpm check`: passed, including repository validation, lint, types and265 tests. Its tracked contents are exactly `origin/main` at `df2f965fd71d3636a1cf279c243bf4d805834fa9`.

The first Linux CI runs found a cross-platform export issue after all unit, Worker, build and browser tests passed: the eleven historical Canvas scenes differed by at most one RGB level, with no alpha changes. Disabling GPU rendering did not fix this. Their original raw authoring canvases are now retained as canonical source PNGs before any explorer clipping, openings or navigation. SHA-256 verifies every raster plus24 loaded authoring dependencies; changes require an explicit capture and visual review. Exact final-pixel comparison remains unchanged, and no final room image or metadata was replaced. See `tools/roomlab/canonical-legacy/README.md` for the source boundary and authoring procedure.

## Runtime continuity and repository handoff

The verified service was deployed from Villa-Treny to the existing Worker as version `2b6d3511-fae3-460d-acc1-ad01b162c88d`. Before deployment, the original scheduler naturally advanced to day106/watchIV/revision27. The migration itself did not advance time: before/after snapshots,600 directed relationships, society balances and174 archive events are identical. Control revision3, next-watch time and alarm generation are unchanged; health is `healthy`.

SQL6/codec4 introduces the new contracts and preserves an exact codec3 source-state backup. A comparison of every pre-existing private state field found zero changes. A full authenticated recovery was downloaded outside both repositories and verified from its core plus15 archive pages. It includes state, private memory, history, quotas and scheduler tables. The backup is not committed or publicly served. See `runtime-continuity-verification.json` and `scripts/capture-recovery.mjs`.

Portfolio was restored to its existing main without a new Portfolio branch commit or push. The old Habitat branch still points to `ebbca44`; stash `13651ea5ba425429af745084c9a2317a6057703a` preserves the complete staged/untracked source. Both the earlier source archive and an additional Git bundle containing that stash are retained outside the repositories. Ignored RoomLab previews and local Worker artifacts were preserved there too. The unrelated local `.claude/launch.json` remains in Portfolio; it is not a tracked application change.

The independent destination is the owner's existing private repository, [aleetreny/Villa-Treny](https://github.com/aleetreny/Villa-Treny). Its CI runs the same application/Worker/build/browser/source-export checks on pushes and pull requests. It never deploys, resets the world or invokes a model.

## Limits and follow-up conditions

Both original ZIPs were inspected. Camp only has its flattened JPEG, and Digging Three matches the already resampled `Post Apoc Shelter - Asset Pack_4.jpg`. No omitted transparent source pack could be recovered. Their remaining image-definition limits cannot be repaired by recovering original layers that are absent. The 1 px navigation, clipping and camera fixes still apply to both rooms.

The large partially obscured workbenches in Maintenance and modular table in Service Counter have corrected collisions, but complete original-alpha occlusion is not demonstrated for every part. This report does not turn a passing authored-mask test into a claim of complete visual proof. Source coordinates, reviewed matches, isolated-floor counts and exact limitations are in `habitat-navigation-fixes.md`.

The public observer receives an intentionally limited projection. It is not a private world backup. Model cognition remains capped at one opportunity every six hours; the other residents run deterministic routines. No additional inference is needed for room browsing, motion tests or the long simulation.
