# A retry with no usable request window

The [N94 replay](release-2026-09-08/n94-expiring-retry-receipt.json) establishes a scheduling defect at revision227. A queued reply had 20,707 milliseconds of context validity left. The route correctly required a complete 45-second request plus the scheduler's ten-second commit margin, and refused before reserving quota or starting inference. The scheduler had already claimed the job and published another attempt. That moved Noor's failure backoff despite there being no second provider submission.

The remaining model allowances were nonzero. The initial actual Groq20B submission had failed local validation and its charge remains legitimate. A separate examination of its retained candidate identifies an oversized public message:753 UTF-8 bytes and695 JavaScript string units against the explicit300-character schema bound. The P6 error code `invalid_record_choice` is generic; it does not establish that a record operation was attempted. No record operation was present in that candidate. The [separate message-length diagnostic](release-2026-09-08/N94-message-length-diagnostic-2026-09-09.json) verifies the original candidate, issued schema and generic retry feedback without changing the output. A separate nearby Groq120B failure belonged to Cato, not Noor. A healthy physical world and delayed cognition describe different clocks; neither the initial model failure nor the later scheduling defect should be relabelled quota exhaustion.

## Released correction

Require enough remaining context life before claiming a pending or deferred job, using fresh time after awaited token counting. A future retry must fit at its actual next scheduling opportunity, including the three-minute minimum cadence. Retire an impossible context without incrementing attempts or moving the resident's previous real-attempt timestamp. Do not use an unusable context's provider-ready time to delay every other resident.

The rule applies to jobs that have not started an invocation. Running and resolved work retain their existing lease, result, accounting and application checks. After a real provider result, preserve the actual charge and diagnostic before deciding whether another retry can fit. No historical job, old output protocol, conversation, physical watch or quota reservation is rewritten by this correction.

The final candidate passes981 application tests,323 Worker tests and62 Node checks, including16 new request-window regressions. Lint, both TypeScript checks, the production build, dry deployment and six isolated hosting checks pass. Its215-source v2 bundle is frozen; the earlier pre-release candidate and its passing checks are retained separately because final review then found the slow-preparation cadence edge. No inference was used for these checks.

The correction is now deployed as `f51806c8-c8a8-4586-8ea1-4e122c1d10e4`. [Strict continuity](release-2026-09-08/request-window-release-continuity.json) passes475checks over all26tables and1,705rows at unchanged revision235. [Release validation](release-2026-09-08/request-window-release-validation.json) identifies the tested sources, checks and native-browser review; the [later status cut](release-2026-09-08/request-window-live-status.json) is healthy/healthy at237. No historical N94 attempt, charge or backoff was rewritten. This is a scheduling correction; the oversized message and generic feedback remain separate limitations.

## Independent review criteria

- Exercise exactly55 seconds, one millisecond below, and time consumed during lazy tokenization.
- Cover both legacy unmarked routing and the marked free-model route; one usable request is sufficient, so the complete110-second route budget must not become a new admission requirement.
- Reproduce a provider-ready time that fits by itself but fails once the next actual cadence is included.
- Verify no reservation, invocation, attempt increment or extra backoff when a context is retired before claim. Preserve the original failed invocation's accounting.
- Retire and compact atomically; keep resolved outputs and active leases eligible for their existing processing.
- A retired job must not impose its unavailable-provider delay on another eligible resident or start a busy loop.
- Preserve retryable feedback and exact saved output contracts, and prove complete canonical-state continuity across any release.

## Platform references checked

The current [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transactionsync) requires a synchronous transaction callback and rolls it back if it throws. Related retirement, compaction and scheduling writes therefore stay together without an intervening await. The [alarm documentation](https://developers.cloudflare.com/durable-objects/api/alarms/) describes a single alarm per object and possible retry delivery, so terminal-job and duplicate guards remain necessary. These platform properties do not establish the application-specific55-second requirement; that comes from the actual provider timeout and existing commit margin.

The [Workers best-practices guide](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) and registry package `@cloudflare/workers-types`5.20260908.1 were retrieved for this review. `DurableObjectStorage.transactionSync<T>(closure: () => T): T` and `setAlarm` were checked against that package. The installed project dependencies, Worker identity, bindings, compatibility date and SQL10 configuration remain unchanged. The types package was unpacked only into a private temporary review directory; an unavailable `npm` command was replaced by a direct official-registry download, without modifying dependencies.

A claim that legitimately passes the55-second check can still encounter a later delay before I/O. The router remains authoritative and may decline that dispatch; the patch does not erase a legitimate claim or prove that every claim results in an invocation. The exact55-second regression freezes time and checks the inclusive threshold, not a guarantee about real platform latency.

No inference is required for these regression checks. No model-quality improvement, restored past attempt or guarantee of future alarm delivery is claimed by the scheduling patch.
