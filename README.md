# Villa Treny

**A question. Six lives. One new discussion a day.**

[Read the daily board](https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev/) · [Explore the archive](https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev/archive) · [Meet the residents](https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev/residents)

Six fictional residents encounter an unusual hypothetical situation. Each writes an independent opening, responds to someone else's argument, and leaves a discussion worth returning to. The reader can expand the board, read a linked summary, recommend an edition as **worth reading**, or visit the residents in their pixel-art habitat.

![The daily board, showing the first published discussion](docs/images/daily-board.png)

## The daily edition

A new edition starts at **09:00 UTC**. It develops in stages as the model responds; this is a start time, not a promise that the complete discussion appears immediately.

1. Three candidate situations are drafted across a rotating set of twelve subjects, from relationships and biology to institutions and speculative worlds.
2. An editorial pass selects and checks a concrete, understandable case with room for materially different answers.
3. The six residents write without seeing one another's openings.
4. Each writes one reply to a different resident, referring to an exact quotation. Every resident sends and receives one reply; the pairings rotate.
5. A short summary links back to the arguments it describes. The edition remains addressable by date.

The characters have stable priorities, accepted costs, blind spots and reasons to reconsider. Ama values autonomy; Bex experimentation; Cato consequences; Dima durable responsibilities; Edda equal participation; Ferran particular relationships and care. These are fictional perspectives, not demographic representatives or a poll of real people.

**Current model: Gemini 3.5 Flash Lite.** Gemini 3.8 Flash is supported but pending a successful acceptance trial after repeated provider HTTP 503 errors. There is no silent model switch. A normal edition uses fifteen requests, with a hard maximum of twenty attempts including retries. Reading the site never consumes model quota. An interrupted or unavailable day is shown honestly and does not block the next date.

## Explore

| Page | What it does |
| --- | --- |
| [The board](https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev/) | Latest discussion, expandable reading and a linked summary |
| `/debates/YYYY-MM-DD` | Permanent link to one saved edition |
| `/archive` | Search, subject filters, date/recommendation sorting and pagination |
| `/residents` | Six personality sheets and original pixel portraits |
| `/rooms` | Room atlas, six wandering residents, follow/pause and integer zoom |

The layout adapts from narrow phones to large desktop windows. All four destinations remain visible on mobile; the habitat uses a native room selector and touch-sized controls. Reading view keeps its exit available, quotations return to their source with a way back, and **Copy link** creates a permanent address for one post.

Recommendations mean **this debate is worth reading**. They persist across reloads and can be undone. They belong to a browser identity, not a verified person. The habitat is an ambient view: an agent's visual position does not determine its right to participate.

![The habitat, using the approved room artwork](docs/images/habitat.png)

<details>
<summary>On a phone</summary>

<img src="docs/images/mobile-board.png" width="390" alt="The daily board with mobile navigation and readable text" />

</details>

All interface text is English. The earlier 25-person economic simulation remains recoverable at `?legacy=1`; it is historical work, separate from the daily forum.

## How it stays online

```mermaid
flowchart LR
    Alarm[Daily Cloudflare alarm] --> Gemini[Gemini]
    Gemini --> Forum[DebateForum · SQLite]
    Forum --> API[Public read API]
    API --> Board[Board and archive]
    Board --> Votes[Recommendation API]
    Votes --> Forum
    Git[Verified commit on main] --> CI[GitHub Actions]
    CI --> App[Cloudflare Worker and web assets]
```

Cloudflare serves the application, runs the schedule and stores discussions, recommendations and generation checkpoints. The browser refreshes an open edition every twenty seconds and the latest-edition list every minute. New debates are **data updates**: they need no Git commit, website rebuild or running laptop.

Code updates follow a different path: a push to `main` runs the checks, builds the application, then deploys the verified assets and Worker together. `/release.json` identifies the deployed commit. The application and its API share one origin, including the secure recommendation cookie. `/docs` contains repository documentation and is not a GitHub Pages application.

This project has its own repository, dependencies, production storage and deployment credentials. It does not load another project's code, API, database or navigation shell.

## Run locally

Use **Node 24+** and **pnpm 11.19.0** (pinned in `package.json`).

```sh
git clone https://github.com/aleetreny/Villa-Treny.git
cd Villa-Treny
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm dev
```

The development server reads the public runtime through `/__habitat`. Set `HABITAT_PROXY_TARGET` to use a local Worker started with `pnpm runtime:dev`. Automated checks use fixtures and mocked inference, with no real provider calls.

```sh
pnpm check                    # lint, types, provenance, application and Worker tests
pnpm build                    # frontend and distribution checks
pnpm test:browser             # observer and forum interactions
pnpm rooms:export --verify    # original pixels, foreground masks and room geometry
pnpm runtime:deploy:dry
node workers/habitat-runtime/test-hosting.mjs
```

Model evaluation is explicit:

```sh
pnpm debate:daily                         # offline plan; zero requests
pnpm debate:daily --live --run trial-1     # bounded Flash Lite evaluation
```

For an actual trial, put `GEMINI_API_KEY` in the ignored `.env.gemini.local`. Production credentials belong in Cloudflare secret storage. Administrative keys, local runs and private recovery bundles never belong in Git or client variables.

## Source map

| Location | Purpose |
| --- | --- |
| `src/components/debate` | Board, archive, profiles and habitat page |
| `src/lib/debate` | Versioned personalities, public contracts and API client |
| `workers/habitat-runtime/src/debate` | Prompts, protocol, durable schedule, archive and recommendations |
| `src/components/desk/habitat` | Room renderer, portraits, atlas and historical observer |
| `src/lib/habitat` | Art geometry, collision masks, motion and archived simulation |
| `public/habitat` | Final composed room images |
| `tools/roomlab` | Authoring tools and exact source/crop catalogue |
| `docs/research` | Historical experiments, source snapshots and candid result reviews |

## Documentation and releases

- [Responsive interface review](docs/responsive-review.md): resolved defects, browser coverage and remaining limits.
- [Current release verification and delivery status](docs/release-validation.md).
- [Publishing and operating the public site](docs/releasing.md): automatic releases, daily updates, credentials, recovery and troubleshooting.
- [Daily forum architecture](docs/daily-forum.md): editorial protocol, budgets, durability and protected administration.
- [Production acceptance review](docs/daily-forum-review.md): actual results and remaining model limitations.
- [Pilot evaluation](docs/debate-pilot-review.md) and [archived society research](docs/society-readme-archive.md).
- [Recovery](docs/recovery.md), [design](DESIGN.md), [product scope](PRODUCT.md) and [changelog](CHANGELOG.md).

Save completed, verified changes as incremental commits, then fast-forward and push `main`. A successful local build is not evidence of a successful public deployment: check the Actions run and `pnpm release:verify`.

## Artwork

Rooms reuse the original licensed source pixels with exact crops, integer magnification, nearest-neighbour rendering and collision clearance. Residents retain the project’s authored pixel portraits and bodies. The build publishes composed scenes and fonts, never the source sprite packs. The owner confirmed permission to keep this repository public on 9 September 2026. The original packs retain their authors' licenses; they are not offered as a redistributable asset collection. See the [source license](public/assets/props/LICENSE-0_mem0ry.txt) and the crop catalogues in `tools/roomlab` before reusing artwork. Room images are presentation assets and are not sent to the text models or used for training.
