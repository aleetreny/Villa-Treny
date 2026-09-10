# Project introduction and resident cards — 10 September 2026

## Interface changes

- The header explains the premise with “Six AI agents. One daily debate.” A persistent **About the project** link sits at the top right on desktop and mobile.
- About opens with the daily question, shared Gemini 3.5 Flash Lite model and fixed personalities. Six short priorities and three debate stages follow. Schedule, limits and source are in a native, keyboard-accessible disclosure.
- Individual resident routes use a full-width identity card. Desktop places the portrait and biography beside four personality fields in two columns. Tablet stacks the identity above those fields; phone uses one field per row.
- Portraits preserve integer scaling at 6×, 4× or 3×. Narrow phones use the smaller portrait so surnames remain intact. The six-resident index keeps its aligned rows and complete text.
- Each resident has a distinct browser title and a return link to the index. Existing habitat links still select the resident's room.

The source personalities, artwork, generation logic, quota settings, stored debates and Portfolio repository are unchanged.

## Verification

| Check | Local result |
| --- | --- |
| `pnpm check` | Lint, types, 72 Node tests, 1,090 application tests and 411 Worker tests passed |
| `pnpm build` | Passed; 67 deployable files and 46 room images verified |
| `pnpm test:browser` | 56 passed across Chromium and WebKit |
| Resident matrix | All six profiles at 320, 390, 1,024, 1,440 and 1,920 pixels |
| Layout assertions | Full-width cards, aligned desktop fields, mobile stacking, intact surnames, integer portrait pixels and no horizontal overflow |
| Navigation | Header/footer About links, direct routes and reloads, disclosure, individual profiles and return to the board/index |
| API isolation | About and profile visits made no debate API requests; no page errors |
| Visual review | Desktop, phone and narrow-phone layouts inspected in the browser |

Phone sizes are emulated, not physical-device tests. The existing build advisory concerns the lazily loaded legacy observer bundle, not the new profile or About components.

The publishing workflow repeats the complete checks and verifies the exact deployed commit. Its read-only public verifier now also checks `/residents/A`, alongside About, the board, archive, habitat and a saved debate. See [Actions](https://github.com/aleetreny/Villa-Treny/actions/workflows/check.yml) for the release outcome and [release metadata](https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev/release.json) for the currently published commit.
