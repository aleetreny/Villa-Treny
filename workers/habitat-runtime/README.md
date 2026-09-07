# Habitat cloud runtime

Cloudflare control plane and canonical scheduler for the Night Shift habitat. It
persists and advances the same deterministic domain world that the standalone Villa-Treny observer renders.

A new habitat starts **paused** with reason `awaiting-domain-engine`, so a deployment
cannot spend inference quota by itself. An authenticated resume command schedules
the first of four six-hour watches.

## Non-negotiable invariants

- One canonical habitat is one SQLite-backed Durable Object.
- Genesis and maximum population are both exactly **25**.
- Durable Object SQLite is the sole operational authority. D1 may later be a
  rebuildable public projection, never a second source of truth.
- A web visitor can only read health, status, the current snapshot and immutable
  archive days; no visitor path can enqueue, advance the clock or trigger inference.
- Provider order is closed: Workers AI, then Groq Free, then the deterministic
  routine policy. There is no third provider and no paid path.
- Models are compile-time and runtime allowlisted:
  `@cf/qwen/qwen3-30b-a3b-fp8` and `openai/gpt-oss-20b`.
- Local caps are below the advertised free allocations: 8,000 Workers AI neurons
  per UTC day and 150,000 Groq tokens / 200 Groq requests per UTC day.
- Quota is reserved before network I/O. An ambiguous timeout consumes the full
  reservation rather than risking an accidental overrun.
- The cron trigger is only a watchdog. The Durable Object owns its single alarm and
  its persisted generation.

On a Workers Free account, excess Durable Object operations fail rather than being
billed. The application also fails closed before provider I/O when its own caps are
reached. Do not enable Workers Paid, Groq Developer, AI Gateway Unified Billing, or
add any billing method for this runtime.

## What exists now

- A single `HabitatWorld` Durable Object using the current declarative `exports`
  lifecycle and SQLite storage.
- Versioned SQLite migrations, a validated `WorldState` codec (including all 600
  directed relationship edges), an append-only happenings archive with per-person
  indexes, causal watch runs, self-repair via hourly Cron, pause/resume commands,
  provider attempt audit, quota reservations, daily usage counters, and provider
  circuit breakers.
- One cognition opportunity per six-hour watch, with 25 deterministic routines.
  Assignment combines pressure and time since the last opportunity, including
  failed provider calls, so failure cannot monopolize the thinker queue. The model
  returns a verb and optional room, target or known fact. Every intent passes
  through `attempt()`. Private context includes the actor's own knowledge and
  feelings, relevant shared history, recent events, needs, obligations and plans.
  It does not reveal another person's unspoken feelings or unknown confidences.
- Strict JSON contracts. Groq uses native strict structured output; Qwen3 receives
  the same schema in its system prompt because that Workers AI model is not on
  Cloudflare's JSON-mode allowlist, and its response is still parsed and validated
  before the domain sees it.
- Workers AI primary adapter and direct Groq HTTP fallback. The encrypted key is a
  required Worker binding: it is available in memory to the Durable Object but
  never enters SQL, logs, source control or the public HTTP surface.
- Public status reports bounded provider-attempt diagnostics and aggregate usage
  separately from conservative reservations. It never exposes prompts, generated
  content or credentials. Scheduler failure and overdue time affect health even
  when HTTP and the retry alarm still work.
- Public lightweight status, health, snapshot and day-archive endpoints with CORS
  limited to `https://aleetreny.github.io`.
- A test suite running in the actual Workers runtime with Durable Object storage.

Operational wakeups and simulation time are separate persisted clocks. A retry or
hourly watchdog wake never creates an extra watch. If cognition is unavailable or
invalid, the same watch still advances deterministically; the society slows its
thinking before it ever spends money or freezes.

## Commands

From the repository root:

```sh
pnpm runtime:check
pnpm runtime:deploy:dry
pnpm runtime:deploy
```

For local development:

```sh
cp workers/habitat-runtime/.dev.vars.example workers/habitat-runtime/.dev.vars
pnpm runtime:dev
```

Never commit `.dev.vars`.

## Secrets

Production accepts two Worker secrets:

- `ADMIN_TOKEN`: required for every `/v1/admin/*` route.
- `GROQ_API_KEY`: optional at the code boundary. When absent, Groq fails closed and
  the watch uses the deterministic policy after Workers AI.

Both names are declared in Wrangler's `secrets.required`, so production deploys
fail before upload if either encrypted binding is missing. The runtime still keeps
the deterministic fallback as a last-resort safety net.

Set them without placing values in config or shell history:

```sh
cd workers/habitat-runtime
pnpm wrangler secret put ADMIN_TOKEN
pnpm wrangler secret put GROQ_API_KEY
```

On Alejandro's Mac, the generated production admin token is also stored in the
login Keychain under service `aleetreny-habitat-runtime-admin` and account
`alejandrotreny`. Retrieve it for an operator request without printing it:

```sh
runtime_admin_token="$(security find-generic-password \
  -a alejandrotreny -s aleetreny-habitat-runtime-admin -w)"
```

The Groq key should belong to a separate Free project with only
`openai/gpt-oss-20b` allowed. A real inference smoke test is manual only and must
never run in CI.

The provisioned Groq project is `habitat-prod`. It is on the **Free ($0)** plan,
allows only `openai/gpt-oss-20b`, and has project limits of 10 requests/minute,
200 requests/day, 6,000 tokens/minute and 150,000 tokens/day. No API key is stored
in this repository.

## Provisioned Cloudflare runtime

- Worker: `aleetreny-habitat-runtime`
- URL: `https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev`
- Workers plan: **Free ($0)**
- Cron watchdog: minute 7 of every hour
- Production secrets installed: `ADMIN_TOKEN` and `GROQ_API_KEY`

The production admin token is present as a Worker secret and in macOS Keychain.
The Groq key exists only in Groq and Cloudflare's encrypted secret store.

## HTTP surface

Public:

- `GET /health`
- `GET /v1/status`
- `GET /v1/snapshot`
- `GET /v1/observer` (one atomic revision: snapshot, 600 relationships and economy;
  supports `ETag` / `If-None-Match` and `304`)
- `GET /v1/archive?day=100` (optional `room` and `person` filters)

Bearer-authenticated administration:

- `POST /v1/admin/pause`
- `POST /v1/admin/resume`
- `POST /v1/admin/cognition/check` (idempotent provider smoke check; no world tick)
- `GET /v1/admin/recovery` (consistent private state and recovery manifest)
- `GET /v1/admin/recovery/page` (bounded immutable archive pages)

`POST /v1/admin/cognition/enqueue` returns `410`: the scheduler is the only creator
of world-bound cognition jobs. Existing unsupported orphan jobs are retired by
migration, rather than accumulating in an unconsumed queue.

Pause/resume body:

```json
{
  "commandId": "a-stable-idempotency-key",
  "issuedAtMs": 1788210000000,
  "expectedControlRevision": 0,
  "reason": "optional operator note"
}
```

Do not put the admin token in frontend code. These endpoints are for an operator or
a trusted deployment job, not the public observer browser.

## Private recovery and long archives

`GET /v1/admin/recovery` captures the world, scheduler, control state and mutable
records inside one SQLite transaction. Its checkpoint hashes codec version, rules
version, world revision and exact state JSON. `exportSha256` also covers the entire
export envelope. It neither pauses nor advances the world, changes revisions,
creates jobs, nor consumes inference quota. Both recovery routes require the same
admin bearer and return `Cache-Control: no-store`, without public CORS.

A small export has `complete: true` and contains all tables. A larger archive has
`complete: false`: its `tables` contain the mutable core, while `manifest` contains
each archive table's fixed `upperRowId`, expected `count` and `excludedRowIds`.
The core is limited to 128 rows per table and 4 MiB total. Unexpectedly exceeding
that bound produces an explicit error, never a silently truncated backup.

For each manifest entry, request `/v1/admin/recovery/page` with `table`,
`upperRowId`, the core's `exportedAtMs`, and comma-separated `excludedRowIds`.
Start `afterRowId=-1` (the initial checkpoint can have rowid 0), then use the
returned `nextAfterRowId` until it is `null`. Preserve the original bounds for
every page; do not obtain a new core between pages. New rows above that cut are
excluded, and rows that were mutable at capture are already present in the core.
Terminal jobs, attempts, events and journals are append-only; current and previous
UTC-day billing records remain in the mutable core.

Pages contain at most 128 rows, target 1 MiB, and allow one larger archival row up
to 8 MiB. Each page has its own SHA-256. Table names are allowlisted; cursor and
range inputs are validated. The Worker never loads years of history into memory.
Download pages locally and call `verifyRecoveryBundle(core, pages)` from
`src/checkpoint.ts`. It checks all hashes, common cut, cursor continuity, exact
row counts, duplicates and missing pages. `verifyRecoveryExport(core)` alone
verifies a checkpoint but does not turn `complete: false` into a complete backup.

Recovery files contain private memories and runtime details: keep them outside
source control and public assets. There is no public or automatic restore route.

From the repository root, `node scripts/capture-recovery.mjs /absolute/private/backup-directory`
downloads the core and every page, verifies the complete bundle and saves it with
private file permissions. Supply `HABITAT_ADMIN_TOKEN` in the process environment;
the script never prints it and refuses an output directory inside the repository.

Restoration requires an operator-reviewed procedure, verified backup and a paused
single authority; never start a second world or replace the live database merely
to move the frontend repository.

## Domain boundary

`src/domain.ts` is the only Cloudflare adapter around `src/lib/habitat`. It encodes
the `Map`-backed world into validated JSON, freezes each cognition job against a
world/control revision, and converts a structured model decision into an `Intent`.
The model never supplies the actor and never writes consequences. A world update,
job disposition and causal watch commit happen in one synchronous SQLite
transaction, so a retry can neither apply the same thought twice nor skip the
deterministic fallback.

The observer integration and the non-destructive sixteen-to-forty-eight-room
SQLite migration are documented in [the runtime handoff](../../docs/habitat-cloud-runtime.md).
Migration 4 keeps a byte-identical backup of the previous world and never changes
the original happenings archive. The observer receives historical room aliases
alongside `sourceRoom` provenance. Production state is preserved across deployment.

Current SQL schema is 6 and world codec is 4. Migration 6 keeps another byte-exact
pre-migration backup, adds knowledge, plans, fairness and interaction clocks,
economic-event history and verified checkpoints. It preserves identities, balances,
all relationship axes, world/control revision, simulation clock and next watch.
Authored knowledge has no invented acquisition date (`learnedDay: null`); a fact
learned through an actual action records its day and source. Daily checkpoints and
transaction entries record subsequent changes without rewriting earlier history.

The domain uses logical rooms, independently of sprite coordinates and old corridor
capacity. Finite inputs, recipient consent and physical needs still constrain
actions. Emergency food uses actual stocks and an affordable treasury transfer;
manual work remains possible when energy or maintenance is low. Shared work can
meet a companionship need through actual recorded participation. It creates no
conversation or relationship change. Flirting and sharing a fact require an
explicit intent and the relevant consent or knowledge checks.

Reproduce the long offline checks with `pnpm society:validate --long`. The data
in `../../docs/society-validation-after.json` cover 5,000 days for seed 1 and 365
each for seeds 7 and 23. These validate routines, failed-cognition fairness, stock
and currency invariants; they do not call a model or guarantee a particular story.
