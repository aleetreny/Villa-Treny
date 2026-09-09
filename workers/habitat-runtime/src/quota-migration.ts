export const GROQ_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'] as const;
export const LEGACY_GROQ_MODEL = GROQ_MODELS[0];
export const GROQ_120B_MODEL = GROQ_MODELS[1];

/** SQL10, called inside the owner's migration transaction. Historical values
 * stay byte-for-byte unchanged; NULL is an explicit legacy identity, not a
 * license to charge an unknown Groq model to either allowance. */
export function migrateQuotaModels(sql: SqlStorage, nowMs: number): void {
  const unexpected = sql.exec<{ model: string }>(
    "SELECT model FROM provider_attempts WHERE provider='groq' AND model != ? LIMIT 1", LEGACY_GROQ_MODEL).toArray();
  if (unexpected.length) throw new TypeError('SQL10 cannot identify a historical Groq model');
  const upper = sql.exec<{ upper: number }>('SELECT COALESCE(MAX(rowid),0) AS upper FROM quota_reservations').one().upper;
  sql.exec(`ALTER TABLE quota_reservations ADD COLUMN model TEXT;
    CREATE TABLE quota_model_migration (singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      legacy_reservation_rowid INTEGER NOT NULL CHECK(legacy_reservation_rowid>=0), migrated_at_ms INTEGER NOT NULL);
    CREATE TABLE provider_model_breakers (provider TEXT NOT NULL, model TEXT NOT NULL,
      open_until_ms INTEGER NOT NULL, reason TEXT, failure_streak INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY(provider,model));
    CREATE INDEX quota_provider_model_activity_idx ON quota_reservations(provider,
      COALESCE(model,'openai/gpt-oss-20b'), MAX(created_at_ms,COALESCE(dispatched_at_ms,0),COALESCE(settled_at_ms,0)));`);
  sql.exec('INSERT INTO quota_model_migration VALUES(1,?,?)', upper, nowMs);
  // Old non-authentication Groq restrictions belonged to its only permitted
  // model. Keep the old row for history and seed its exact scoped equivalent.
  sql.exec(`INSERT INTO provider_model_breakers(provider,model,open_until_ms,reason,failure_streak,updated_at_ms)
    SELECT provider,?,open_until_ms,reason,failure_streak,updated_at_ms FROM provider_breakers
    WHERE provider='groq' AND COALESCE(reason,'') NOT IN ('authentication','misconfigured')`, LEGACY_GROQ_MODEL);
}
