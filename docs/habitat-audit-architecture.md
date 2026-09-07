# Architecture and extraction audit

Audit target: the uncommitted habitat simulation in Portfolio's `night-shift-habitat`, based on ebbca44 plus the resolved integration of codex/habitat-integrated. This document precedes implementation.

## Confirmed boundaries

- Destination `aleetreny/Villa-Treny` exists, is private and empty; authenticated owner has administrator access.
- Portfolio main contains the original `src/lib/world/crew.ts`, `UvCrew`, `UvWorld`, the night switch and board. It does not contain the dedicated habitat simulation. Those original features must remain in Portfolio.
- Habitat source is `src/lib/habitat`, `src/components/desk/habitat`, its scoped styles, `public/habitat`, existing props/fonts, `tools/roomlab`, `tools/habitat`, related specs and the Cloudflare Worker.
- Cross-project code dependencies are the deterministic RNG and environment configuration. The observer also depends on rules in Portfolio's global CSS. These must become explicit standalone modules/styles rather than importing the portfolio shell.
- Destination stays private. Keep artist license and source credits with assets. Neither a generic open-source license nor publication of the source asset library is implied by extraction.

## Prioritized structural fixes

| ID | Severity | Finding / impact | Acceptance criterion |
| --- | --- | --- | --- |
| A01 | P1 | Standalone simulation currently requires the Portfolio App shell and its close/escape lifecycle. | `/` opens the observer directly; explicit return link to Portfolio; Escape closes nested views without leaving an empty application. |
| A02 | P1 | Portfolio environment/config/dependencies include Neon, S3, board editing and unrelated UI in the same build. | Villa installs/builds/tests without Portfolio, its env vars, files, symlinks or Node modules; minimal React/Vite/engine/Worker dependency graph. |
| A03 | P1 | Habitat styles inherit global `.hab-*`, `.weave*` and font declarations from a 149kB Portfolio stylesheet. | Extract exact relevant styles and required tokens; visual baseline preserved without shipping board CSS. |
| A04 | P1 | Renaming/recreating the deployed Durable Object during repo move would silently create a different world. | Preserve Worker name, class, habitat ID, storage and migrations; compare clock, archive, balances and relationships before/after any deployment. |
| A05 | P1 | Many collision tests validate authored masks against themselves rather than independently against artwork. | Independent furniture probes and entrance-based reachability plus visual depth tests; wrong metadata must fail. |
| A06 | P2 | Current production room exports require a manually served/exported browser page. | Reproducible documented export command with source manifest and generated-mask consistency checks; legacy corridors remain recoverable. |
| A07 | P2 | Observer local state, visual movement and economic world may be mistaken for a single physical timeline. | Distinguish persistent watch/decisions from visual walking without changing economic truth; deterministic visual movement has stable IDs and explicit capacity. |
| A08 | P1 | Uncommitted merge and untracked art could be lost when returning Portfolio to main. | Verified full working-tree archive, git bundle, staged/unstaged patches and Git index/merge metadata; source hashes preserved in destination before cleanup. |
| A09 | P2 | Repo setup/CI/documentation assume portfolio root and provider deployment ownership. | Standalone README, env examples, package scripts and CI; no deployment secrets in Git, no automatic reset or implicit new cloud world. |

## Preservation evidence

Source working-tree backup contains 762 files, each verified against SHA-256 after archiving, plus all Git refs, both diffs, index and merge metadata. Its location is recorded locally in `habitat-extraction-backup.txt`. Extraction will not rewrite main history or import this simulation into Portfolio main.
