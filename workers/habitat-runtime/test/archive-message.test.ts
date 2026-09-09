import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { deserializeWorldState } from '../src/domain';
import { prepareSocietyJob } from '../src/society-scheduler';
import type { SocietyState } from '../../../src/lib/habitat/society/index';

it('labels actual archived model speech without rewriting its row or claiming a transfer happened', async () => {
  const stub = env.HABITAT_WORLD.getByName('archive-message-provenance');
  await stub.resume({ commandId: 'archive-message-provenance-resume', issuedAtMs: Date.now() });
  const result = await runInDurableObject(stub, (instance, state) => {
    const sql = state.storage.sql, nowMs = Date.now();
    const world = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
    const society = JSON.parse(sql.exec<{ state_json: string }>('SELECT state_json FROM society_state').one().state_json) as SocietyState;
    const runtime = sql.exec<{ control_revision: number; world_revision: number }>('SELECT control_revision,world_revision FROM runtime_meta').one();
    const prepared = prepareSocietyJob({ state: society, world, actor: 'Q', sequence: 1, nowMs,
      generation: runtime.control_revision, worldRevision: runtime.world_revision, habitatId: env.HABITAT_ID, protocolVersion: 4 });
    const output = { project: { mode: 'replace', goal: 'Offer support for the workshops.', why: 'Discuss a possible gift.', visibility: 'public', steps: [] },
      message: { to: 'G', text: 'Here are two cells.', close: false }, deal: { kind: 'transfer', direction: 'give', cells: 2 } };
    sql.exec('INSERT INTO cognition_contexts(sequence,job_id,actor,prepared_json,generation) VALUES(?,?,?,?,?)',
      prepared.turn.sequence, prepared.job.jobId, 'Q', JSON.stringify(prepared.turn), prepared.turn.generation);
    sql.exec(`INSERT INTO cognition_jobs(job_id,envelope_json,status,pressure,created_at_ms,due_at_ms,attempts,output_json,provider)
      VALUES(?,?,'resolved',0,?,?,1,?,'fixture')`, prepared.job.jobId, JSON.stringify(prepared.job), nowMs, nowMs, JSON.stringify(output));
    (instance as unknown as { applySocietyJob(id: string, now: number): void }).applySocietyJob(prepared.job.jobId, nowMs + 1);
    expect(sql.exec<{ status: string }>('SELECT status FROM cognition_jobs WHERE job_id=?', prepared.job.jobId).one().status).toBe('applied');
    const after = deserializeWorldState(sql.exec<{ state_json: string }>('SELECT state_json FROM world_state').one().state_json);
    expect(after.bodies.Q.cells).toBe(world.bodies.Q.cells);
    expect(after.bodies.G.cells).toBe(world.bodies.G.cells);
    return { day: world.day, rows: sql.exec('SELECT * FROM happenings ORDER BY sequence').toArray() };
  });
  const archive = await stub.getArchive({ day: result.day });
  const speech = archive.entries.filter(entry => entry.speech);
  expect(speech).toHaveLength(1);
  expect(speech[0]).toMatchObject({ text: 'Q: Here are two cells.', kind: 'meeting', speech: { speaker: 'Q' } });
  expect(speech[0]!.speech!.turnId).toMatch(/^turn:[0-9]+$/);
  await runInDurableObject(stub, (_instance, state) => {
    expect(state.storage.sql.exec('SELECT * FROM happenings ORDER BY sequence').toArray()).toEqual(result.rows);
  });
  await stub.pause({ commandId: 'archive-message-provenance-pause', issuedAtMs: Date.now() });
});
