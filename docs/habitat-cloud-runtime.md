# Night Shift: live observer and runtime

The observer, room art and the autonomous runtime now share `night-shift-habitat`.
The complete `codex/habitat-integrated` implementation has been incorporated;
there is no second simulation in the browser.

## Public observer

`src/lib/habitat/useHabitatLive.ts` reads `/v1/observer` and `/v1/status` every
45 seconds while visible, and refreshes on returning to the tab. The observer
response contains one atomic world revision, all 25 residents, all 48 room states
and all 600 directed relationship edges. It also includes the same revision's
`society`: dated inventory, treasury, 25 balances and needs, work credits, actual
obligations and the conservation ledger. The frontend validates this contract.
A failed request retains the last known world and visibly marks the connection
as stale. Before the first connection, the authored day-100 state is labelled as
an offline fallback. Opening a room, moving a drawn resident, changing the map
or reading the diary cannot change the canonical clock or trigger inference.

`GET /v1/archive?day=N` returns the complete recorded day, with optional room and
person filters. The diary can read every available day from day 100 onwards.
The live record contains only the current simulated day. CORS remains limited
to `https://aleetreny.github.io`; Vite provides the same-origin `/__habitat`
read-only proxy for local review. Production uses `VITE_HABITAT_RUNTIME_URL` or
the already provisioned public Worker origin.

## Preserving the existing lives

SQL migration 4 / world codec 2 expands the original sixteen broad spaces to the
48 authored rooms. It saves the original serialized world in
`world_layout_backups` before writing the migrated state in the same transaction.
It preserves the seed, simulated day and watch, world revision, all residents'
conditions, charge, pressure, memory dates, current activity, reactor state and
all relationship values. Only retired room identifiers and positions that no
longer fit the smaller room grids are translated. Invalid data fails closed.

| Historical space | Present destination |
| --- | --- |
| Cabins / Diggings | Each resident's authored home (`SLEEPS`) |
| Great Wall | Records, Administration or Dispatch for their posted residents |
| Spine | Workshops |
| Berths | Infirmary |
| Hydroponics | Garden |
| Hollow | Face |

The immutable happenings table is **not rewritten**. Read-time room aliases map
old entries into the present catalogue and include `sourceRoom` with the original
identifier. General historical Cabins and Diggings entries appear under Long Walk
and The Row. Exact historical text, participants and timestamps remain intact.
No deployment resets the world or its archive.

## Cognition

One six-hour watch is a causal SQLite transaction. All 25 residents act by domain
policy; at most one resident receives model cognition per watch. Unbounded time
since their last thought combines with bounded pressure so nobody is excluded.
The model proposes only a verb and optional room/target, and the engine retains
all authority over consequences. Recent personal history enters the next prompt.
Provider order and existing free limits remain Workers AI, Groq Free, then routine.
The browser never receives provider keys and public reads never invoke a model.

The Qwen adapter now reads the documented `choices[0].message.content` response
rather than assuming the old Workers AI `response` field. This corrects the
repeated TypeError seen in the deployed runtime. It requests Qwen's documented
`/no_think` mode, removes only a complete leading reasoning wrapper, and rejects
truncated outputs. The output budget is 384 tokens, within the existing hard cap.
Groq's `json_validate_failed` is classified as an invalid response, avoiding the
former unnecessary 24-hour rejection breaker. Daily quota limits, model allowlists
and billing settings are unchanged.

Sources: [Cloudflare's Qwen response schema](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/),
[Qwen's thinking switch](https://huggingface.co/Qwen/Qwen3-30B-A3B-FP8/blob/main/README.md),
[Groq structured outputs](https://console.groq.com/docs/structured-outputs).

`POST /v1/admin/cognition/check` is an authenticated, idempotent operator smoke
check. It uses the normal provider router, quota reservations and bounded prompt;
it records diagnostics but neither advances a watch nor applies a consequence.
Repeating its command ID cannot invoke providers a second time. It is never
called from the portfolio or CI.

## Validation

Run `pnpm check`, `pnpm habitat:check` and `pnpm habitat:deploy:dry`.
The Worker tests run against Durable Object SQLite with remote bindings disabled.
They cover the inhabited 16-to-48 migration, preservation of a byte-identical
backup and original historical rows, valid non-overlapping bodies, all 600 edges,
read-only public projections, provider parsing, operator-check idempotency,
watch scheduling, archives and quota limits.

Public runtime: `https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev`.

### Verified production migration — 7 September 2026

Worker version `9cb58134-c8a9-4650-ae5b-157e8043d2b1` was deployed after the
37 Worker tests, frontend contract tests, lint and dry-run passed. The production
world remained at revision 26, day 106, watch III, with its reactor output and
next-watch time unchanged. Its public observer validates 48 rooms, 25 unique
walkable resident positions and 600 relationship edges. All 23 happenings from
day 105 matched the pre-deployment record, including their historical locations.

The single authenticated smoke check `night-shift-layout4-check-20260907` received
a valid `observe` intention for resident Y from Workers AI. Its result was stored
idempotently; it did not change the world snapshot or apply that proposed action.
This confirms the Qwen envelope fix against the actual provisioned binding.

### Verified economy migration — 7 September 2026

Worker version `1acbdc89-2ac3-44c5-b2e1-527d8f05c321` introduces SQL migration 5
and world codec 3 after 51 engine tests, 44 Worker tests, typecheck, lint and
deployment dry-run. [The society audit](habitat-society-audit.md) documents the
causal rules and the three-seed comparison; those simulated events are separate
from the live record.

Migration 5 stores the byte-identical previous JSON in `world_layout_backups`
under migration 5 before atomically writing the new fields. Integration tests
verify the backup and unchanged runtime metadata and archive rows. No existing
balances, conditions, axes, dates or activities are replaced. A new stock baseline
is explicitly dated day 106; its initial money is the existing **828.4872291863744
cells**, with zero newly minted, consumed or leaked cells at introduction.

Production reads before and after deployment confirmed identical snapshots,
600 relationships, all day-105 archive entries, revision 26, day 106/watch III,
and next watch `1788808084141` (7 September 2026, 19:08:04.141 UTC). The service
reports schema 5, codec 3 and healthy status. Public accounting balances exactly.

The one authenticated check `night-shift-economy5-check-20260907` obtained a valid
`inspect` intention for resident T from the provisioned Qwen Workers AI binding
in 936 ms. It used the existing quota router and did not apply the intention.
The entire observer response, including balances and inventory, remained equal
before and after the check; clock and schedule also remained unchanged. The
normal scheduler continues with one model intention per six-hour watch.
