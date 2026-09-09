# Villa Treny

**Night Shift** is an observer's window into twenty-five lives in one shared refuge. Explore forty-five rooms, follow a resident, read the journal, inspect relationships and watch a small economy develop through work, care, scarce resources and obligations.

The interface is a standalone React application, packaged as Static Assets alongside the existing Cloudflare Worker. The persistent world lives in its Durable Object. Opening the website does not advance the world or invoke a model. The physical world runs four watches per day. The society extension separates individual deliberation from those watches: residents retain purposes, exchange their own messages and negotiate commitments, while the engine verifies every consequence. Visual walking provides atmosphere independently of the economic clock.

The current P8 protocol permits up to three bilateral conversations per resident. Each ordinary thought can reply, contact another available person, work or review privately, leave an exchange, or look up an authorized retained document. First private decisions need a purpose; they need not speak. Selecting a channel acknowledges only its supplied revision, without implying agreement. Leaving preserves accepted commitments. Private drafts, exact publication, explicit sharing, commissions and consent-based economic commitments retain their existing effects. Saved protocols 1–7 keep their original meaning. Opening the observer grants no additional model calls.

**Workers AI GPT-OSS 120B is the primary**. Its deployed daily guard is 10,000 neurons, within the verified Workers Free allowance. Newly marked P8 jobs and saved marked P6/P7 jobs can also use Groq OSS120B and OSS20B, each with a separate Free allowance of 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute and 200,000 tokens/day. These are model-specific organization limits, shared with other usage in the organization, not one interchangeable pool. Existing unmarked jobs retain their previous route. All attempts reserve quota before dispatch, retain unknown charges conservatively and settle usage before fallback. The router bounds requests by both the job's attempt allowance and its live lease.

A lazy WASM tokenizer counts complete authored Groq system/user/schema text up to 32,000 combined UTF-8 bytes, with a 24,000-byte component bound. Larger input or encoder failure uses the complete byte estimate without truncation. Reservations include the output maximum and a provisional 128-token framing allowance; Groq's full internal format is not known. See the [tokenizer measurements](docs/research/groq-tokenizer-bound-2026-09-08.md), [account readback](docs/research/groq-dual-free-account-readback-2026-09-08.json) and [architecture](docs/society-architecture.md).

**Current release: `f50c0b1a-163b-42c0-995f-5374d695a4a1`**, deployed 9 September 2026, with **P8 / SQL12 / society codec 4** and a **10,000-neuron Workers AI daily guard**. Physical world codec 4 and public DTO 2 remain unchanged. Residents can choose among up to three conversations, work or review privately, contact another available person, or leave while waiting. One normal thought selects one operation; additional conversations do not create extra inference calls. Exact consent, document permissions and accepted commitments remain authoritative. Saved P1–P7 jobs keep their issued contracts. See the [attention design](docs/research/concurrent-attention-design-2026-09-09.md).

**9 September allowance reallocation — deployed:** the Workers AI daily guard is now 10,000 neurons, within the verified active Workers Free allowance. This reallocates our former 8,000 runtime / 2,000 research buffer; it adds no provider quota. All 1,852 research neurons belong to 8 September and their last conservative hold expired on 9 September at 11:33 UTC. The separate 1,865 ambiguous production neurons remain charged. Validation passes **1,077 application / 377 Worker / 62 Node tests**, 21 browser checks, 6 hosting checks, lint/types/build and dry deploy. The [independent production comparison](docs/research/release-2026-09-09/cf10000-production-continuity.json) passes 67 checks: all 2,118 rows in 26 tables remain identical at revision 326, including quotas and clocks. See the [sanitized account evidence and release scope](docs/research/cloudflare-free-allowance-reallocation-2026-09-09.md).

For the previous attention checkpoint `5cc86d7b`, [Release verification](docs/research/release-2026-09-09/attention-release-validation.json) passes **1,077 application / 377 Worker / 62 Node tests**, 21 fresh browser checks and 6 hosting checks, lint/types/build/dry deploy. The [strict production comparison](docs/research/release-2026-09-09/attention-production-continuity.json) preserves every old row and column in 26 tables at revision 322; 2,098→2,100 rows add the exact archival migration. 319 frozen source files match. The pending publication, balances, quotas, old jobs, control and physical/cognitive clocks are preserved. A native review after unlocking the Mac confirms Common at 4x, Journal and Lives; all 45 rooms are covered by the automated browser suite.

**Previous attention checkpoint measurements:** The [selected budget measurement](docs/research/attention-budget-candidate6-compact-system-facet-2026-09-09.json) fits all 25 actual revision 317 preparations at 6,587–7,903 Groq tokens. A legal three-open/three-closure fixture remains 8,754 and needs eligible Cloudflare capacity or waiting. The 128-token framing margin is provisional. Neither these fixtures nor the new choices prove better factual grounding, bounded waiting or an autonomous paid-work-to-performance chain. The [post-release status](docs/research/release-2026-09-09/attention-live-status.json) is physically healthy; cognition is delayed by provider admission, with 18/25 successful within the previous watch and 25/25 having thought at least once. No P8 model result had been observed at that cut. At that earlier cut, research totaled165 local calls /1,852 CF neurons, with no new evaluation calls at that checkpoint.

**Current semantic evidence — completed local diagnostic:** the [six-call P7/P8 comparison](docs/research/attention-chain-mechanical-review-2026-09-09.md) applied every response but created zero agreements. P7 issued three further proposals; P8 only exchanged messages. Y ate in Common identically in both arms and the zero-inference control. W's pre-existing publication executed in all three and is not credited to these replies. The [independent semantic review](docs/research/release-2026-09-09/attention-chain-independent-semantic-review.json) also finds no demonstrated improvement. This selected local pair does not isolate concurrency or prove production quality. Current research totals are **171 local calls /1,852 historical CF neurons**, with no new cloud research. The [mechanical receipt](docs/research/release-2026-09-09/attention-chain-final-mechanical-receipt.json) preserves hashes, replay and limits.

Release `af8bb409-387b-45eb-be9e-849163fc3536` is the 8 September 21:07 UTC P6/SQL10 checkpoint. [Complete continuity](docs/research/release-2026-09-08/p6-progress-release-continuity.json) preserves all 1,606 rows in 26 tables at revision 210, including 143 quota reservations. It fixes received final-message visibility and a mismatch between separately allowed title/body lengths and the combined document budget. The [25-context measurement](docs/research/final-closure-budget-review-2026-09-08.md) fits every full Groq reservation below 8,000 tokens, with a maximum of 7,420 at revision199; this is not a guarantee for future inputs.

An [eight-response local comparison](docs/research/p6-progress-comparison-semantic-review-2026-09-08.md) did not show that broader progress instructions improved grounding: six replies applied, two drafts were rejected by the exposed size mismatch, and no exchange closed. Those broader instructions remain an experiment and are not the live SYSTEM. Real observations include individual thought coverage of all 25 residents, Quim's independently accepted two-cell gift to Gita, private authored drafts and natural Groq120B decisions. No authored publication or paid document commission has been established. [Validation](docs/society-validation.md) preserves failed trials and distinguishes claims from executed outcomes. The [research PDF](output/pdf/villa-treny-investigacion.pdf) remains a separately dated 14-page b557 checkpoint.

The previous retrieval release is `caf46bd8-1bda-40f6-a1f3-b60dfe420375`, with P7 / SQL11 / society codec 3. [Authorized retrieval](docs/research/authorized-retrieval-implementation-2026-09-09.md) restores a way to request an older retained revision when the ordinary bounded context omits it. [Structural retry feedback](docs/research/structural-retry-feedback-2026-09-09.md) can identify safe field paths and limits from a complete, hash-bound rejection without copying its private values. Both features preserve normal admission, consent and provider quotas. The final [25-resident budget measurement](docs/research/retrieval-budget-final-2026-09-09.json) reserves 5,420–7,843 complete Groq tokens, adding 218–294 per job; this is a fixture measurement, not a guarantee for future contexts or all-day capacity. The immediate post-deployment cut still contained the old schema; its failed comparison is preserved. The later [exact offline reconstruction](docs/research/release-2026-09-09/retrieval-natural-continuity-receipt.json) reproduces all 26 tables, 1,750→1,761 rows, through the actual migration and one natural P7 job at revision247, preserving the old jobs, physical world and control. Both strict-comparison failures remain attached to their original cuts. [Release validation](docs/research/release-2026-09-09/retrieval-release-validation.json) records the checks and remaining review. No improvement in autonomous factual grounding is claimed.

The preceding request-window release is `f51806c8-c8a8-4586-8ea1-4e122c1d10e4`. It fixes retries claimed with too little context lifetime to reach a provider, preventing an unnecessary attempt/backoff and releasing that context's wait over other residents. New claims and future retries need a complete55-second request/commit window; a slow, expired new preparation preserves the three-minute scheduling floor. Running and resolved work keeps its existing checks. [Release continuity](docs/research/release-2026-09-08/request-window-release-continuity.json) passes475checks over all1,705rows in26tables, including156reservations, at unchanged revision235. [Validation](docs/research/release-2026-09-08/request-window-release-validation.json) records215frozen sources and the reloaded production browser; [public status](docs/research/release-2026-09-08/request-window-live-status.json) is healthy for both clocks at revision237, with all25residents covered. This does not repair the separate [oversized model message](docs/research/release-2026-09-08/N94-message-length-diagnostic-2026-09-09.json) or guarantee that a later runtime delay cannot prevent dispatch after a valid claim.

The preceding receipt-selection release is `5443a27b-ca4f-4b69-9d77-3017977ed969`. It fixes selection of personal evidence: the last retained physical result and relevant step receipt now survive within the existing four-memory budget, and personal history is deduplicated only against observations actually shown. In the audited revision218 cut, latest physical-result coverage improves from 2/25 to 25/25 preparations. [The audit](docs/research/grounded-receipt-selection-2026-09-08.md) separates this retrieval guarantee from model understanding. [Release continuity](docs/research/release-2026-09-08/receipt-selection-release-continuity.json) passes 473 checks over all 1,671 rows in 26 tables at revision227, including 152 reservations and seven private drafts. [Release validation](docs/research/release-2026-09-08/receipt-selection-release-validation.json) records the 214 frozen sources and browser review. The world is healthy at this cut; cognition is delayed on a previously saved job, as the [status receipt](docs/research/release-2026-09-08/receipt-selection-live-status.json) shows.

A separate [eight-response evidence-layout comparison](docs/research/evidence-layout-semantic-review-2026-09-08.md) has mixed results and remains unselected. All eight responses applied, but one advertised a list whose actual draft was only a heading; other cases still confused reported claims with delivery or completed work. This local test used 24,065 reported tokens and no cloud inference. More mechanically valid output is not proof of a better society.

The preceding presentation release `7dd380ef-5c98-4608-9be8-842d31599299` added an explicitly labelled English translation of public turn419 in Lives and Journal without rewriting the original. Its strict comparison retained a natural-activity mismatch; the separate [exact reconstruction](docs/research/release-2026-09-08/observer419-natural-continuity-receipt.json) explains every row, column and rowid from revision216 to218 without further inference. Historical release evidence remains attached to its original checkpoint.

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

The current source passes **1,019 application tests, 355 Worker tests and 62 Node checks**, lint/types, production build and six isolated hosting checks with zero outbound requests. All 21 automated browser checks were run freshly for this release. Native post-release visual review remains pending because the Mac was locked. That suite loads all45 accessible rooms at integer fit and checks the translated public message in both Lives and Journal. The build verifies 59 deployable files and 46 room PNGs. Historical trials remain attached to their own source checkpoints in the [validation record](docs/society-validation.md). These tests do not certify generated dialogue. The main bundle retains a size warning (about 936 kB / 155 kB gzip).

## Project map

| Location | Purpose |
| --- | --- |
| `src/components/desk/habitat` | Room observer, atlas, people, journal, ledger and relationship views. The directory name is retained from extraction; there is no Portfolio shell dependency. |
| `src/lib/habitat` | Canon, rooms, relationships, presentation navigation and validated public data. |
| `src/lib/habitat/society` | Private minds, bounded evidence, purposes, individual conversations and consent-based economic commitments. |
| `src/lib/habitat/engine` | Persistent state, primitive intentions, economy, needs, memory and scheduled watches. |
| `workers/habitat-runtime` | Single authoritative world, migrations, quotas, provider adapters and public API. |
| `public/habitat` | Production room PNGs. The generated navigation manifest lives in `src/lib/habitat/generated`. |
| `tools/roomlab` | Source library, exact composition tools, original rooms and archived corridor experiments. |
| `tests/browser` | Observer flows and negative-path tests against local fixtures. |
| `docs` | Canon, source provenance, audit findings, improvement list and verification evidence. |

## Art and movement

Room art comes from the existing licensed source packs. Keep source coordinates and source pixels when adjusting a composition. Floors, physical footprints, projected sprite bodies and foreground masks have different purposes. Movement tests must check both access from a real opening and independent positions on visible furniture; validating a collision mask against itself is insufficient.

The renderer uses integer magnification and nearest-neighbour pixels. RoomLab is retained so the original corridors can be revisited; corridors are not extra RoomIds in the observer. Source exports can be regenerated with `pnpm rooms:export`. The verification mode checks decoded pixels rather than PNG compression bytes. Eleven historical Canvas scenes use [approved original canvas rasters](tools/roomlab/canonical-legacy/README.md) with hashed authoring dependencies to preserve their exact colors across platforms; recapture is an explicit art-authoring operation, never part of CI.

Production builds copy only final room PNGs and fonts. Raw licensed spritesheets remain available to local RoomLab in this private repository and are excluded from the deployable. Every build verifies this distribution boundary.

## Persistent world and deployment

This project continues the existing world. Preserve `aleetreny-habitat-runtime`, exported class `HabitatWorld`, binding `HABITAT_WORLD` and `HABITAT_ID=habitat-canonical`. **Renaming them is not a harmless repository rename**: it can select another world. Never reconstruct the world from a public observer snapshot or enable a second scheduler over a copy.

Current storage uses SQL11, society codec 3 and physical world codec 4. Earlier supported recovery formats remain readable, but rollback requires a binary that understands current retrieval state, records and per-model quota identity. The archived prior society row does not justify discarding later activity to run an older binary. Keep a complete private [recovery cut](docs/recovery.md), including society state, original inputs where retained, all quota history and scheduler controls. Do not remove fields or reset the world for compatibility.

```sh
pnpm runtime:check                 # works without dist/ or frontend build
pnpm build                         # verified assets for this deployment
pnpm runtime:deploy:dry
node workers/habitat-runtime/test-hosting.mjs  # local HTTP, external network blocked
pnpm runtime:deploy
```

The [canonical Worker URL](https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev) serves the observer at `/` and the API under `/v1`. Build at base `/` (the default); the production observer already targets this public runtime. Static files and SPA navigation bypass the application Worker. `/v1`, `/v1/*`, `/health` and `/health/*` always reach the API, including direct browser navigation: unknown API routes remain JSON errors and recovery remains authenticated. No unused `ASSETS` binding or second scheduler is created. The [SQL10 migration proof](docs/research/release-2026-09-08/sql10-migration-continuity.json) preserves all 1,546 previous rows and 135 reservations while adding model accounting metadata. The subsequent [reference-instruction release](docs/research/release-2026-09-08/p6-refs-release-continuity.json) preserves all 1,564 rows in 26 tables at revision199, including four private drafts and the first actual Groq120B charge. The earlier [closure and draft-budget release](docs/research/release-2026-09-08/p6-progress-release-continuity.json) preserves all 1,606 rows at revision210 with 443 checks. None of these deployments resets clocks or historical usage. Earlier releases remain documented in the validation record.

Deployment requires the owner's Cloudflare credentials. Runtime secrets belong in Cloudflare, or an ignored local `.dev.vars` for development; never in `VITE_*`, frontend files or Git. Unit tests derive local public bindings from the same configuration, omit assets and remote providers, and do not load those secret files. The separate hosting check uses the actual dry-run bundle and generated assets with local disposable storage. The repository's CI verifies changes and does not deploy or reset the service. See the [Worker hosting details](workers/habitat-runtime/README.md#observer-hosting), `docs/habitat-cloud-runtime.md` for the operational history and `docs/extraction.md` for the separation from Portfolio.

## Audit and limitations

Start with [the accepted improvement list](docs/audit-improvement-plan.md), then the [navigation](docs/habitat-audit-navigation.md), [observer](docs/habitat-audit-observer.md), [engine](docs/habitat-audit-engine.md) and [architecture](docs/habitat-audit-architecture.md) reports. They record the **pre-fix** findings. The final verification document identifies what changed and which checks were actually run.

The [extraction verification report](docs/audit-verification.md) maps the original findings to their corrections and historical checks, source-alpha evidence and preservation of the live world. The society validation record covers the subsequent engine and provider work.

This is a bounded simulation, not twenty-five continuously running language models. Intentions use a validated vocabulary and the engine determines their consequences. Long simulations and adverse scenarios provide evidence about the rules; they cannot guarantee that every future story will be interesting. Historical authored lore, current state and visual presentation are deliberately distinguishable.

## Credits and permissions

Created by Alejandro Treny Ortega. This repository is private. Do not apply an open-source license to third-party artwork or redistribute its raw source library. Asset terms are included in `public/assets/props/LICENSE-0_mem0ry.txt`; exact room/corridor sources are documented in RoomLab. Interface fonts are self-hosted under their included SIL Open Font Licenses; see `public/fonts/README.md`.
