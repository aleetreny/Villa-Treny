# Villa Treny

**Night Shift** is an observer's window into twenty-five lives in one shared refuge. Explore forty-five rooms, follow a resident, read the journal, inspect relationships and watch a small economy develop through work, care, scarce resources and obligations.

The interface is a standalone React application. The persistent world lives in a Cloudflare Durable Object. Opening the website does not advance the world or invoke a model. The world runs four watches per day, with at most one model opportunity per watch; the other residents continue through deterministic, state-dependent routines. Visual walking provides atmosphere independently of the economic clock.

## Run locally

Requires Node24+ and pnpm. From this repository alone:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. No Portfolio environment, database, storage service, authentication setup or private key is needed for the observer. Development reads the existing public world through Vite's `/__habitat` proxy. `VITE_HABITAT_RUNTIME_URL` selects the public API in a production build; see `.env.example`.

```sh
pnpm check                         # lint, TypeScript, engine/UI units, Worker/SQLite tests
pnpm build                         # standalone production bundle
pnpm exec playwright install chromium
pnpm test:browser                  # isolated, deterministic browser flows
pnpm rooms:export --verify         # source pixels, navigation and original alpha masks
pnpm check:all                     # check + production build + browser suite
```

Browser and Worker tests do not buy inference or change the live world. On Linux CI, Playwright installs its system dependencies with `playwright install --with-deps chromium`.

## Project map

| Location | Purpose |
| --- | --- |
| `src/components/desk/habitat` | Room observer, atlas, people, journal, ledger and relationship views. The directory name is retained from extraction; there is no Portfolio shell dependency. |
| `src/lib/habitat` | Canon, rooms, relationships, presentation navigation and validated public data. |
| `src/lib/habitat/engine` | Persistent state, primitive intentions, economy, needs, memory and scheduled watches. |
| `workers/habitat-runtime` | Single authoritative world, migrations, quotas, provider adapters and public API. |
| `public/habitat` | Production room PNGs. The generated navigation manifest lives in `src/lib/habitat/generated`. |
| `tools/roomlab` | Source library, exact composition tools, original rooms and archived corridor experiments. |
| `tests/browser` | Observer flows and negative-path tests against local fixtures. |
| `docs` | Canon, source provenance, audit findings, improvement list and verification evidence. |

## Art and movement

Room art comes from the existing licensed source packs. Keep source coordinates and source pixels when adjusting a composition. Floors, physical footprints, projected sprite bodies and foreground masks have different purposes. Movement tests must check both access from a real opening and independent positions on visible furniture; validating a collision mask against itself is insufficient.

The renderer uses integer magnification and nearest-neighbour pixels. RoomLab is retained so the original corridors can be revisited; corridors are not extra RoomIds in the observer. Source exports can be regenerated with `pnpm rooms:export`. The verification mode checks decoded pixels rather than PNG compression bytes.

Production builds copy only final room PNGs and fonts. Raw licensed spritesheets remain available to local RoomLab in this private repository and are excluded from the deployable. Every build verifies this distribution boundary.

## Persistent world and deployment

This project continues the existing world. Preserve `aleetreny-habitat-runtime`, exported class `HabitatWorld`, binding `HABITAT_WORLD` and `HABITAT_ID=habitat-canonical`. **Renaming them is not a harmless repository rename**: it can select another world. Never reconstruct the world from a public observer snapshot or enable a second scheduler over a copy.

```sh
pnpm runtime:check
pnpm runtime:deploy:dry
pnpm runtime:deploy
```

Deployment requires the owner's Cloudflare credentials. Runtime secrets belong in Cloudflare, or an ignored local `.dev.vars` for development; never in `VITE_*`, frontend files or Git. The repository's CI verifies changes and does not deploy or reset the service. See `docs/habitat-cloud-runtime.md` for the operational history and `docs/extraction.md` for the separation from Portfolio.

## Audit and limitations

Start with [the accepted improvement list](docs/audit-improvement-plan.md), then the [navigation](docs/habitat-audit-navigation.md), [observer](docs/habitat-audit-observer.md), [engine](docs/habitat-audit-engine.md) and [architecture](docs/habitat-audit-architecture.md) reports. They record the **pre-fix** findings. The final verification document identifies what changed and which checks were actually run.

The [final verification report](docs/audit-verification.md) maps the findings to implemented corrections, 716 application/domain tests, 70 Worker tests, 11 browser flows, source-alpha evidence and preservation of the live world.

This is a bounded simulation, not twenty-five continuously running language models. Intentions use a validated vocabulary and the engine determines their consequences. Long simulations and adverse scenarios provide evidence about the rules; they cannot guarantee that every future story will be interesting. Historical authored lore, current state and visual presentation are deliberately distinguishable.

## Credits and permissions

Created by Alejandro Treny Ortega. This repository is private. Do not apply an open-source license to third-party artwork or redistribute its raw source library. Asset terms are included in `public/assets/props/LICENSE-0_mem0ry.txt`; exact room/corridor sources are documented in RoomLab. Interface fonts are self-hosted under their included SIL Open Font Licenses; see `public/fonts/README.md`.
