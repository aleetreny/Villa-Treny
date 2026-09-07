# Extraction from Portfolio

Source: Portfolio branch `night-shift-habitat`, base `ebbca44`, including the resolved but uncommitted integration of `codex/habitat-integrated` and subsequent room/observer/economy work.

Destination: the owner's existing private repository `aleetreny/Villa-Treny`. The source copy was verified file-by-file before any correction: 506 files, with SHA-256 values retained in `extraction-source-hashes.json`. A separate full source backup preserves 762 working files, all Git refs, staged/unstaged patches and the open-merge index/metadata. That recovery archive is outside both working trees.

## What moved

The dedicated habitat's canon, engine, 25 residents, 45 visitable room images, source compositions, navigation, observer, relationships, economy and Cloudflare runtime source now belong to Villa-Treny. Its own entry point, dependency graph, configuration, styles, fonts and verification commands replace the Portfolio shell. The sole shared deterministic random helper was copied into `src/lib/habitat/random.ts`.

The original Portfolio Night Shift—its UV world/crew, switch and board—belongs to Portfolio main and is preserved there. The dedicated Habitat must not be merged into that main branch. The main revision identified before extraction was `df2f965fd71d3636a1cf279c243bf4d805834fa9`.

## World continuity

The existing Cloudflare Worker remains the only authority. Moving its source repository does not copy, regenerate or rename its Durable Object. The observed world before this change was day106/watchIII/revision26, with25 residents,48 narrative room IDs,600 directed relationships and159 archive events. No manual watch advance, reset or additional inference was used to extract the project.

Future changes must preserve the same account/name/class/habitat ID, and use checked schema migrations. Public read evidence can be captured with `node scripts/capture-runtime.mjs <output-directory>`; that evidence is explicitly **not** a complete private state backup.

The final audited deployment is `2b6d3511-fae3-460d-acc1-ad01b162c88d`, SQL6/codec4. The original clock naturally advanced to day106/watchIV/revision27 before deployment; the migration preserved that complete public state and all174 archived events. A verified full private recovery was saved separately. Every existing private state field matches the retained codec3 migration backup.

Portfolio now matches its original `main` at `df2f965fd71d3636a1cf279c243bf4d805834fa9`. No new Portfolio commit or push was made. The full former source also remains in stash `13651ea5ba425429af745084c9a2317a6057703a` and an external Git bundle. Its existing local launch configuration remains in place.

## Recovery boundary

The new repository does not include private `.env`, `.dev.vars`, `.wrangler` state or Portfolio deployment credentials. Original corridors remain in RoomLab. Pre-fix reports and their historical reproduction data remain in `docs`; they describe the source state, while final checks describe the corrected project.

## Independent installation check

A fresh copy was installed away from both working repositories, without their
`node_modules`, Git data, build output or local secrets.
`pnpm install --frozen-lockfile --offline` installed both workspace projects from
the ordinary pnpm package store; `pnpm build` and the Worker typecheck passed.
No import, asset path or workspace package resolved through Portfolio. The offline
flag is evidence of a complete lockfile/cache in this check, not a requirement for
a new machine.

The extraction review also found that Vite's default public copy included complete
RoomLab source spritesheets in production output. Production packaging now uses
an explicit application-asset list; the full sources remain available only for
local work in the private repository. This is an additional distribution finding,
separate from the original audit's numbered items.

The operational README commands now use the standalone `runtime:*` scripts, the
1-pixel movement mask and 24 × 44 resident dimensions. The optional manual RoomLab
importer writes the same version-3 RLE manifest and image hashes as the automatic
exporter; a round trip of all 46 rooms in the isolated copy produced identical
metadata.

`pnpm rooms:export --verify` additionally checks all 373 foreground masks against
their original PNG alpha, including horizontal reflection, and rejects duplicate
object IDs. A deliberately changed single bit in an isolated source mask made
verification fail at that exact object and pixel; the unmodified project passes.
This check runs in the existing Chromium/CI pipeline without Python or live
provider calls.
