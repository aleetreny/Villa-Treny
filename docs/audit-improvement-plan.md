# Villa-Treny — accepted improvement list

This list was consolidated from the read-only audit on 7 September 2026, before fixes. The detailed reports retain original evidence; their findings are not claims that every issue remains in the corrected project. Final results belong in `audit-verification.md`.

## Implementation scope and acceptance

| Work | Priority | Acceptance |
| --- | --- | --- |
| Architecture A01–A03, A09 | P1/P2 | A standalone observer with minimal dependencies, its own entry point, fonts, styles, configuration, README and CI. Install and build without Portfolio files or credentials. |
| Preservation A04, A08 | P1 | Verified source archive and extraction hashes. Preserve the existing Worker identity and world. Move simulation source to private Villa-Treny; restore Portfolio to its original main, including the original Night Shift. |
| Navigation NAV01, NAV05 | P1/P2 | Native footprint coverage, furniture masks measured against source art, and independent regression probes for all eight confirmed objects. No invented or blurred art. |
| Navigation NAV02, NAV06, NAV07 | P1/P2 | All visual spawn positions reach a usable opening with the real footprint; dual Washroom compartments stay intact; north portals work; routes/reservations/queues have movement tests as well as collision tests. |
| Depth NAV04, OBS03 | P1/P2 | Source-pixel foreground masking and correct projected body bounds. Preserve walkable ground rather than hiding depth errors with oversized collision rectangles. |
| Presentation NAV03, A07, OBS10–12 | P2 | Stable, connected visual itineraries, reactive reduced-motion preference and retained per-room camera state. Economic intentions remain independent of visual co-location, as explicitly requested by the user. |
| Camera OBS01–02, OBS09 | P1/P2 | True integer fit, bounded follow camera, explicit panning and direct image retry, without losing the selected room. |
| Data truth OBS04, OBS08, OBS14–15 | P1/P2 | Separate received world/preview/stale data and service clock health; mutually exclusive archive states; truthful historical labels and dates; visible actual light/power state. |
| Usability OBS05–07, OBS13 | P1/P2 | Usable short landscape layouts, standalone page landmarks, keyboard/touch matrix and precise numerical relationship cues. |
| Efficiency OBS16 | P2 | Share immutable relationship data and animation scheduling; avoid unchanged world-wide re-renders; verify with browser checks. |
| Engine starvation/capacity | P1 | Low-water/empty-food states cannot roll back a complete watch or crowd all agents into a full room. Test resource boundaries and full destinations. |
| Engine intentions/order | P1 | Accepted actions are not immediately undone by routine; viable social intentions do not fail solely due to iteration order. |
| Engine cognition fairness | P1 | Failed/rejected/no-provider turns do not let one resident monopolize future opportunities. Preserve quotas and fallback. |
| Engine action/memory contracts | P1/P2 | Reject irrelevant verb fields and do not write memories to nonparticipants. Validate stored state identities, coordinate bounds and time. |
| Long-term economy E06–E07 | P1/P2 | Explicit emergency access to essentials, meaningful energy/maintenance recipes and long-horizon recovery without hidden currency creation. |
| Agency and knowledge E13–E14 | P2 | Individual counterpart response, durable commitments and learned facts with provenance; no generic disclosure of secrets. |
| Recovery E15 | P2 | Structured economic accounting and versioned, checked world checkpoints; preservation of existing authority. |
| Service E10–E12, E16 | P2 | Bounded prompt packing, finite provider deadline, rejection of unsupported enqueue, conditional reads and honest usage/attempt metrics. |
| Runtime health | P1/P2 | Repeated watch failures and overdue schedules become degraded; the observer distinguishes HTTP connectivity, world progress and cognition availability. |
| Evidence A05–A06 | P1/P2 | Reproducible room export, independent geometry fixtures, adversarial engine scenarios, Worker tests, production build and browser flows in CI. |

The scope is the confirmed defects and implementable improvements above. The audit does not claim mathematical perfection or open-ended conscious agents. Economy remains a bounded simulation with validated primitive intentions and persistent consequences. No generative art, new rooms or automatic Portfolio commits are part of this change.
