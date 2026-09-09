# Private recovery

Recovery includes the physical world, all 25 minds, plans and conversations, scheduler controls, pending jobs and their prepared contexts, actual agreements and events, and every quota reservation. It contains private resident knowledge and model context. Keep the files outside this repository.

Small worlds still produce a complete `villa-recovery-v1` export. Larger worlds create a consistent SQL cut: mutable rows are frozen inside the same transaction as the physical checkpoint, and append-only archives are read up to their recorded high-water marks. Downloading pages does not advance either clock. Auxiliary cut tables are not part of the restored world.

New `society_turn` jobs omit their duplicated full input after becoming `applied` or `dead`. The same terminal transaction replaces the envelope's system/user prompt and the prepared prompt with versioned markers containing SHA-256 of each original string's UTF-8 bytes and its original byte count. `promptBytes`, turn identity, control generation, evidence IDs and every other prepared field remain available. Exact `output_json`, decisions, public diary entries, private minds, plans, conversation history, agreements and world history are preserved. A hash can verify a separately retained input; it cannot reconstruct that input. Open jobs, including resolved-but-unapplied results, and pre-v7 legacy jobs retain their original bytes.

`compactTerminalCognition(sql, jobId)` must run inside the transaction that first closes that job. It is idempotent and must never be used as a later historical sweep. Recovery freezes contexts belonging to open jobs and orphaned contexts, so a job closing during pagination cannot alter a captured input. Terminal contexts become immutable with their jobs. There is no new SQL column or migration.

A paginated cut lasts one hour. The runtime retains at most four cuts; creating a fifth evicts the oldest. An expired, evicted or schema-incompatible cut fails explicitly. Start a new capture into a new directory if this happens. The client writes `recovery.json` only after verifying every page; it does not overwrite an earlier backup.

Capture uses the existing administrator credential supplied through `HABITAT_ADMIN_TOKEN`; do not put that credential in a command, file or repository. `HABITAT_RUNTIME_URL` can select an explicitly intended runtime.

```sh
node scripts/capture-recovery.mjs /absolute/private/new-backup-directory
node scripts/verify-recovery.mjs /absolute/private/new-backup-directory/recovery.json
```

The verifier prints only counts and revision information. It checks checksums, table counts, page order, cut identities, all 25 mind identities, society codec/revision and the physical checkpoint. Usage marked confirmed must contain complete integer billing fields. Legacy checkpoints with `villa-society-v6`, `villa-society-v7` and `villa-society-v9` rules remain verifiable; SQL10 uses `villa-society-v10`. Deployment status is recorded separately in the research release evidence.

SQL9 preserves the exact previous cognitive singleton and its SHA-256 in `society_layout_backups` before upgrading society codec1 to2 with an empty records extension. It archives exact authored publications, including private ones, in `authored_publications`; public pagination only projects explicitly public content. The archive survives bounded working-set eviction. Historical SQL8 captures do not require future SQL9 tables.

SQL10 adds model identity to quota reservations, a historical row boundary and per-model circuit state. Existing reservations retain null model values and every prior field; historical Groq charges belong only to OSS20B. New reservations require an explicit model consistent with their attempt. Complete exports include both new tables, and strict recovery checks prevent old null identities from being assigned to new rows. SQL9 restoration must use its matching schema before migration; an older binary is not a rollback strategy for a live SQL10 world. See the [offline rehearsal](research/release-2026-09-08/sql10-offline-migration-rehearsal.json) and [production continuity](research/release-2026-09-08/sql10-migration-continuity.json).

`provider_rejections` is optional private debugging evidence, separate from immutable billing and attempt history. It retains at most64 rows and16MiB of serialized JSON. Evidence older than seven days is collected on the next provider-attempt write; an idle runtime does not claim background deletion. Each candidate captures at most64KiB and each issued schema at most192KiB. A partial candidate is explicitly marked incomplete; full hashes are unavailable above the defensive4MiB hashing bound. Prompt text, HTTP headers and arbitrary provider error messages are not captured. Actual SYSTEM/USER hashes cannot reconstruct the original prompts or the domain state needed for a complete replay.

The rejected primary receipt is saved before starting a fallback. Diagnostic validation or storage failure cannot invalidate the attempt, refund usage or authorize another inference. The public observer does not expose this evidence. Recovery freezes retained diagnostic rows because normal retention can delete them during pagination. A downloaded private backup deliberately keeps the captured evidence after its live retention expires; manage those files separately.

To prepare a restoration for review:

```sh
node scripts/restore-recovery.mjs /absolute/private/backup/recovery.json /absolute/private/restore.sql habitat-canonical
```

This command produces a private SQLite CLI plan and never connects to or changes a runtime. The target habitat ID must match the backup. The plan stops on errors and checks the source SQL version and table columns before deleting target data. Execution requires the matching SQL schema; restore an older backup into its matching schema before applying later migrations. Old v1 exports that lack the `world_state` row preserve the exact checkpoint but use the capture time for the unavailable `updated_at_ms` metadata.

The local `restoreRecoveryBundle(storage, core, pages, targetHabitatId)` primitive also validates identity/schema and performs every write inside `transactionSync`. It has no administrative HTTP endpoint. A failed insertion rolls back the whole restoration. Alarm installation remains the runtime operator's separate responsibility; generating or verifying a backup never starts the simulation.
