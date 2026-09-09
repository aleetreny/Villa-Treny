# Observer request and SQLite cost audit

Measured locally on 2026-09-08 with the real Cloudflare Workers SQLite test runtime. No public load test, provider request or production data mutation was performed. SQL8 is an additive follow-up to the already released SQL7; deployment of this patch is a separate verification step.

## Concrete defect and correction

Before SQL8, `getStatus()` scanned all terminal cognition jobs, sorted the full provider-attempt history, and scanned reservations outside the current quota windows. Even a single observer left visible could exhaust the free SQLite read allowance after enough history accumulated.

The correction retains every historical row and every quota rule. It adds three indexes: `provider_attempts(recorded_at_ms DESC)`, `quota_reservations(day,provider)`, and `quota_reservations(provider,MAX(created_at_ms,COALESCE(dispatched_at_ms,0),COALESCE(settled_at_ms,0)))`. The Workers AI predicate has an equivalent indexed activity range. A creation or settlement in the current UTC day necessarily has activity newer than `now − 24h`; unknown carried reservations retain their previous strict expiry condition.

The public queue now explicitly reports `scope: "active"` and counts pending, deferred, running and resolved jobs. Applied/dead jobs remain in the database and complete backups. No UI consumes their former aggregate queue counts.

`getStatus()` also shares one in-flight/result promise for at most ten seconds. Every request first reads the entire current runtime row, which forms the cache key. World, control, mode, alarm and error changes invalidate it. Failed builds are not retained, and an older rejected build cannot evict a newer revision. Only the public status method uses this cache. Scheduling, spending, settlement, recovery and administrative decisions continue to read authoritative data directly. Quota-window and queue presentation may be up to ten seconds old without a runtime change, consistent with the pre-existing HTTP status freshness interval.

## Actual SQLite cursor measurements

Read counts below are `SqlStorageCursor.rowsRead` after consumption, not returned-row counts or estimated SQL plans. All measured public read methods wrote zero SQL rows. Alarm-storage reads and Worker CPU/serialization are separate from these SQL counters.

First fixture: N attempts, N terminal jobs and N reservations; 10% of reservations are current-day, 90% are ten days old. The current-day subset belongs to Workers AI. Each result is a fresh status computation, outside the new cache.

| Retained N | Current-day reservations | Before SQL8 | After indexes, fresh |
| ---: | ---: | ---: | ---: |
| 100 | 10 | 514 | 46 |
| 1,000 | 100 | 5,014 | 226 |
| 5,000 | 500 | 25,014 | 1,026 |

Permanent regression fixture: **100 recent reservations split equally between providers**, four active jobs/contexts, plus the historical rows shown below. All recent charges stay in the same UTC/rolling-day window during the measurements.

| Additional historical requests | Fresh status rows read | Cached status rows read |
| ---: | ---: | ---: |
| 100 | 247 | 1 |
| 1,000 | 247 | 1 |
| 5,000 | 247 | 1 |

`getWorldRevision()` reads one row. `getObserver()` reads three rows and parses the current world and society documents. The cache test also verifies that twenty concurrent requests trigger only one quota snapshot calculation.

Indexes have a measurable write cost. Direct statement measurements for one confirmed request are:

| Operation | SQL7 rows written | SQL8 rows written |
| --- | ---: | ---: |
| Insert reservation | 3 | 5 |
| Mark dispatched | 1 | 2 |
| Settle confirmed usage | 1 | 2 |
| Insert provider attempt | 2 | 3 |
| Total for those four statements | 7 | 12 |

These are five additional index writes per completed request, **not** the entire job's write bill: daily compatibility-cache updates, job/context/event writes and world publication remain separate.

One-time migration measurements include all three index constructions and the migration marker. Each `CREATE INDEX` runs as its own statement in the same transaction so cursor accounting does not accidentally report only the last statement of a batch.

| Existing requests in each fixture table | Migration rows read | Migration rows written |
| ---: | ---: | ---: |
| 100 | 607 | 304 |
| 1,000 | 6,032 | 3,004 |
| 5,000 | 30,151 | 15,004 |

## Request traffic and free-plan limits

The observer makes two GET requests every 45 seconds while the page is visible: status and conditional observer state. The selected day's archive is fetched initially and after each observed revision. A changed observer ETag costs an extra Durable Object RPC because the Worker checks the revision before obtaining the full observer document. These behaviors are in `useHabitatLive.ts` and the Worker GET routes.

For one continuously visible observer, use approximately 1,920 polling rounds/day. Counting one initial archive and R later observed revisions gives **3,841 + R Worker GETs** and **3,841 + 2R Durable Object RPC requests**, before manual refreshes, visibility changes, admin traffic, alarms or Cron. This is a derivation from the current polling loop, not a concurrency benchmark. Static asset requests follow the separate asset-serving path.

The current Workers Free allowance is 100,000 Worker requests/day and 10 ms CPU per invocation. Static asset requests are free and do not count toward that request allowance. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Durable Objects Free separately allows 100,000 requests/day, 5 million SQLite rows read/day and 100,000 rows written/day. RPC calls count as requests; index maintenance can add billable row writes. Its duration allowance is 13,000 GB-s/day. Storage is limited to 1 GB per object and 5 GB total on Free. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [SQLite cursor accounting](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

At the permanent fixture's 247 rows, one observer making fresh status calls every 45 seconds costs **474,240 status SQL reads/day**. Before the indexes, the first fixture's 1,000 retained reservations cost **9,626,880 status reads/day**, already above the free allowance for one observer.

The shared cache helps multiple observers. Let S be total status requests, F the number of fresh calculations, and Q the fresh calculation cost. The measured structure gives `status rows = S + (Q − 1) × F`. With no runtime-key changes, ten-second freshness bounds F by approximately 8,641/day on a continuously active instance; key changes and instance recreation add fresh calculations. At Q=247 and twenty continuous observers, this yields about **2.20 million combined status and stable-observer revision reads/day**, versus about **9.52 million without the shared cache**. Archives, initial full-state reads and runtime mutations add to both totals. These arithmetic examples isolate this fix and do not guarantee twenty-user capacity.

The remaining request ceiling is also finite: twenty observers already generate roughly 76,820 GET/RPC requests/day before revision-dependent traffic. The first binding quota therefore depends on observer behavior, active reservations, archive size, instance resets, simulation writes and other account usage. CPU and large-document serialization have not been stress-tested. No new CDN API cache or traffic-management service is assumed.

## Preservation and regression checks

`workers/habitat-runtime/test/observer-load.test.ts` covers eight causal cases: historical growth with a fixed recent window; concurrent/TTL/runtime invalidation and authoritative quota admission; failed-cache recovery; SQL7-to-SQL8 data/backup preservation; the old versus new quota predicate across 896 timestamp/confirmation combinations and five observation times; per-request index writes; one-time index construction at three history sizes; and exact job/provider submission counting with Unicode, wildcard characters, adjacent prefixes and repeated denied wakes.

The last test also closes a separate productive-job cost: `dispatchedCount()` previously filtered an entire provider's history by `substr(reservation_id,...)`. Merely adding an ID range with a SQL provider guard still made SQLite choose that broad provider index: **109 / 1,009 / 5,009 rows** for 100 / 1,000 / 5,000 unrelated reservations in the adversarial fixture. The final query reads only the existing primary-key range and checks provider/state in JavaScript: **5 / 5 / 5 rows**, returning the same two real dispatches. Replacing the prefix's final colon with a semicolon supplies the exact exclusive BINARY upper bound; `%`, `_` and Unicode are literal data, with no `LIKE` semantics. Fifty denied wakes at each history size create no reservations. Existing router tests independently prove that quota-only wakes still permit two actual provider submissions.

The SQL7 migration test compares every data row in the 20 unchanged recovery tables, retaining the existing 21-table recovery manifest. Only the migration table gains its version8 marker. Complete SQL7 and SQL8 backups both validate; the existing SQL6 backup-verification test remains valid. The SQL6 migration fixture now removes later SQL8 indexes before exercising the actual SQL7 migration, avoiding a misleading synthetic predecessor schema.

Patch verification completed with **189/189 Worker tests in 18 files**, Worker typecheck, targeted ESLint and whitespace checks passing. The full application's final release checks and this patch's deployment result belong in the release validation record, not in these capacity estimates.

Reproduce locally, without credentials or inference:

```sh
cd workers/habitat-runtime
pnpm exec vitest run test/observer-load.test.ts test/quota.test.ts test/recovery.test.ts test/society-runtime.test.ts
pnpm typecheck
```

## Bounded follow-up opportunities

The archive effect still refetches the selected day on every world revision, including an already finished historical day and private cognition revisions without new diary entries. A separate archive revision/ETag could reduce that source-level redundancy. This patch does not change archive semantics or add a cache table.
