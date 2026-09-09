import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CognitionJob } from './contracts';
import { applySocietyProtocol } from './society-protocol';

/** Admission validated this grammar before saving an output. Recheck it at
 * the durable commit boundary too: restored resolved jobs do not pass through
 * a provider again, and current capacity must not expand an issued choice. */
export function applyIssuedSocietyProtocol(job: CognitionJob,
  ...args: Parameters<typeof applySocietyProtocol> extends [number, ...infer Rest] ? Rest : never) {
  const [state, world, turn, payload] = args;
  if (job.outputContract.version === 8 && turn.sequence > (state.minds[turn.actor]?.lastAppliedSequence ?? -1)) {
    const fail = (code: string) => ({ ok: false, code, state, world });
    try {
      const schema = job.outputContract.jsonSchema;
      if (!schema || typeof schema !== 'object' || Array.isArray(schema)
        || job.outputContract.schemaHash !== `sha256:${createHash('sha256').update(JSON.stringify(schema)).digest('hex')}`)
        return fail('invalid_job');
      if (!z.fromJSONSchema(schema).safeParse(payload).success) return fail('invalid_attention_choice');
    } catch { return fail('invalid_job'); }
  }
  return applySocietyProtocol(job.outputContract.version, ...args);
}
