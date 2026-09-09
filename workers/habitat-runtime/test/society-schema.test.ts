import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RESIDENTS } from '../../../src/lib/habitat/residents';
import { genesisState } from '../../../src/lib/habitat/engine/state';
import { applyCapabilityChoice, applySocietyTurn, createSocietyState, prepareSocietyTurn } from '../../../src/lib/habitat/society/index';
import { SOCIETY_SYSTEM, SOCIETY_PROPOSAL_SYSTEM, SOCIETY_ORDERED_SYSTEM } from '../../../src/lib/habitat/society/instructions';
import { SOCIETY_RETRIEVAL_SYSTEM } from '../../../src/lib/habitat/society/retrieval-instructions';
import { SOCIETY_ATTENTION_SYSTEM } from '../../../src/lib/habitat/society/attention-instructions';
import { prepareSocietyJob } from '../src/society-scheduler';
import { estimateGroqInputTokens } from '../src/providers/groq-token-estimate';
import { workersAIInput, GEMMA_WORKERS_AI_MODEL } from '../src/providers/workers-ai';
import { GROQ_PROJECT_LIMITS } from '../src/quota';
import { applySocietyProtocol } from '../src/society-protocol';
import { applyIssuedSocietyProtocol } from '../src/society-issued-protocol';

const project = { mode: 'replace', goal: 'Discuss the shared stores inventory.', why: 'I need to know how supplies stand.', visibility: 'private', steps: [] };
const contextOf = (turn: { prompt: string }) => JSON.parse(turn.prompt.slice(turn.prompt.indexOf('\n{') + 1));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('the real provider protocol budget', () => {
  it.each([6, 7] as const)('admits a complete P%s shared-draft reply above the old limit without cutting text or the 1024 output reserve', async (protocolVersion) => {
    const world = genesisState(91), state = createSocietyState(world, 1000);
    const first = prepareSocietyJob({ state, world, actor: 'A', nowMs: 2000, sequence: 1,
      generation: 0, worldRevision: 0, habitatId: 'offline-free-limit', protocolVersion });
    const text = 'I propose comparing the stores register together, then recording disagreements as claims.';
    const drafted = applySocietyProtocol(protocolVersion, state, world, first.turn, { project,
      message: { to: 'B', text: 'Bex, would you review this exact proposal?' },
      record: { kind: 'draft', title: 'Stores proposal', text, refs: ['world:100:1'], parent: null, audience: 'B', publish: false } },
    { nowMs: 2001, generation: 0 });
    expect(drafted.ok, drafted.code).toBe(true);
    const reply = prepareSocietyJob({ state: drafted.state, world: drafted.world, actor: 'B', nowMs: 3000,
      sequence: 2, generation: 0, worldRevision: 1, habitatId: 'offline-free-limit', protocolVersion });
    const reservation = await estimateGroqInputTokens(reply.job) + reply.job.maxOutputTokens;
    expect(reservation).toBeGreaterThan(6000);
    expect(reservation).toBeLessThanOrEqual(GROQ_PROJECT_LIMITS.minuteTokens);
    expect(reply.job.outputContract.version).toBe(protocolVersion);
    expect(reply.job.maxOutputTokens).toBe(1024);
    expect(contextOf(reply.turn).records.drafts[0].text).toBe(text);
  });

  it('preserves the historical 6000-token bound for all25 opt-in protocol5 jobs even with 1536 output tokens', async () => {
    const world = genesisState(91), f = { world, state: createSocietyState(world, 1000) };
    for (const { id: actor } of RESIDENTS) {
      const { job, turn } = prepareSocietyJob({ ...f, actor, nowMs: 2000, sequence: 0, generation: 0, worldRevision: 0, habitatId: 'offline-schema-budget', protocolVersion: 5 });
      const reserved = await estimateGroqInputTokens(job) + 1536;
      expect(reserved, `${actor}: ${reserved}`).toBeLessThanOrEqual(6000);
      expect(turn.contextOverflow).toBe(false);
      expect(job.outputContract.version).toBe(5);
      expect(job.prompt.system).toBe(SOCIETY_ORDERED_SYSTEM);
      const context = JSON.parse(turn.prompt.slice(turn.prompt.indexOf('\n{') + 1));
      expect(context.conversation).toBeNull();
      expect(context.self.room).toBe(world.bodies[actor].room);
      expect(job.prompt.system).toContain('not sensor readings');
      expect(context.affordances.workExamples.columns).toEqual(['verb', 'at', 'available', 'needs', 'produces']);
      expect(context.public.contacts.length).toBeGreaterThan(0);
      expect(context.self.wants).toBeTruthy();
      expect(turn.prompt).toContain(`You are ${context.self.name} (${actor}).`);
      const payload = workersAIInput(job, GEMMA_WORKERS_AI_MODEL);
      expect(payload.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'society_turn', schema: job.outputContract.jsonSchema, strict: true } });
      expect(payload.messages[0]!.content).not.toContain('Output JSON Schema:');
      expect(payload.messages[1]!.content).toBe(turn.prompt);
      expect(payload.messages[1]!.content).not.toContain('This is not a story to continue');
    }
  });

  it('prepares and applies default protocol8 while keeping explicit protocol3,4,5 and7 reconstruction', () => {
    const world = genesisState(91), state = createSocietyState(world, 1000);
    const input = { state, world, actor: 'A' as const, nowMs: 2000, sequence: 0,
      generation: 0, worldRevision: 0, habitatId: 'offline-protocol-pin' };
    const historical = prepareSocietyJob({ ...input, protocolVersion: 3 });
    const proposal = prepareSocietyJob({ ...input, protocolVersion: 4 });
    const experimental = prepareSocietyJob({ ...input, protocolVersion: 5 });
    const retrieval = prepareSocietyJob({ ...input, protocolVersion: 7 });
    const current = prepareSocietyJob(input);
    expect(historical.job.outputContract.version).toBe(3);
    expect(historical.job.prompt.system).toBe(SOCIETY_SYSTEM);
    expect(proposal.job.outputContract.version).toBe(4);
    expect(proposal.job.prompt.system).toBe(SOCIETY_PROPOSAL_SYSTEM);
    expect(current).toEqual(prepareSocietyJob({ ...input, protocolVersion: 8 }));
    expect(current.job.outputContract.version).toBe(8);
    expect(current.job.prompt.system).toBe(SOCIETY_ATTENTION_SYSTEM);
    expect(retrieval.job.outputContract.version).toBe(7);
    expect(retrieval.job.prompt.system).toBe(SOCIETY_RETRIEVAL_SYSTEM);
    expect(experimental.job.outputContract.version).toBe(5);
    expect(experimental.job.prompt.system).toBe(SOCIETY_ORDERED_SYSTEM);
    expect(experimental.job.prompt.user).toBe(proposal.job.prompt.user);
    expect(experimental.job.outputContract.jsonSchema).not.toEqual(current.job.outputContract.jsonSchema);
    expect(current.job.prompt.user).toContain('"records":');
    expect(proposal.job.prompt.user).not.toContain('"records":');
    expect(historical.job.outputContract.jsonSchema).not.toEqual(current.job.outputContract.jsonSchema);
    const before = JSON.stringify({ state, world, prepared: current });
    const output = { attention: { kind: 'private', conversationId: null }, content: { project } };
    const applied = applyIssuedSocietyProtocol(current.job, state, world, current.turn, output, { nowMs: 2001, generation: 0 });
    expect(applied).toMatchObject({ ok: true, code: 'applied' });
    expect(applied.state.minds.A.project?.goal).toBe(project.goal);
    expect(applied.state.conversations).toEqual([]); expect(applied.world).toEqual(world);
    expect(JSON.stringify({ state, world, prepared: current })).toBe(before);
    expect(applyIssuedSocietyProtocol(current.job, applied.state, applied.world, current.turn, output,
      { nowMs: 2002, generation: 0 })).toMatchObject({ ok: true, code: 'already_applied', state: applied.state, world: applied.world });
    expect(applySocietyProtocol(7, state, world, retrieval.turn, output, { nowMs: 2001, generation: 0 }).ok).toBe(false);
  });

  it('projects only Pilar’s regional examples in protocol4, preserving every canonical voice and exact prior protocol3 jobs', () => {
    const world = genesisState(91), state = createSocietyState(world, 1000);
    const originalResidents = JSON.stringify(RESIDENTS);
    // Captured from the unchanged producer before the protocol-4 language patch.
    const historicalHashes = { P: '40d702b09fc4339004b12b2f88634751eb27429757174ac6d130b6deca0cb702',
      V: 'c9a555fc4ab209455cd14bf095b1f326e26aa8f8773098b5c8f21302ed8906e7' };
    for (const resident of RESIDENTS) {
      const input = { world, state, actor: resident.id, nowMs: 2000, sequence: 0, generation: 0,
        worldRevision: 0, habitatId: 'offline-english-compatibility' };
      const historical = prepareSocietyJob({ ...input, protocolVersion: 3 });
      const current = prepareSocietyJob({ ...input, protocolVersion: 4 });
      const oldSelf = contextOf(historical.turn).self, self = contextOf(current.turn).self;
      expect(oldSelf.voice).toBe(resident.voice);
      if (resident.id === 'P') {
        expect(self.voice).toContain('Andalusian rhythm, short clauses');
        expect(self.voice).toContain('familiar encouragement and affectionate address, rendered in English');
        expect(self.voice).not.toContain('anda and hijo');
        expect(self.voice).toContain('Deflects sincerity with practicality.');
        expect(self).toEqual({ ...oldSelf, voice: self.voice });
      } else expect(self).toEqual(oldSelf);
      if (resident.id === 'P' || resident.id === 'V') expect(hash(historical)).toBe(historicalHashes[resident.id]);
      expect(current.job.prompt.system).toContain('messages, reflections, project goals and every why');
      expect(current.job.prompt.system).toContain('even when self.voice or quoted messages use another language');
      expect(current.job.prompt.system).toContain('Keep names, supplied IDs and schema values unchanged.');
      expect(historical.job.prompt.system).not.toContain('Write all free text in English:');
      expect(self.id).toBe(resident.id); expect(self.name).toBe(resident.name);
    }
    expect(JSON.stringify(RESIDENTS)).toBe(originalResidents);
  });

  it('keeps Spanish historical speech, exact IDs and evidence hashes intact when preparing an English-guided reply', () => {
    const world = genesisState(91), state = createSocietyState(world, 1000);
    const options = { generation: 0, worldRevision: 0, habitatId: 'offline-english-history', protocolVersion: 3 as const };
    const first = prepareSocietyJob({ world, state, actor: 'P', nowMs: 2000, sequence: 0, ...options });
    const saved = applyCapabilityChoice(state, world, first.turn, { project: { ...project, goal: 'Teach someone bread making.' },
      message: { to: 'V', text: 'Vero, ¿quieres aprender a hacer pan conmigo?' } }, { nowMs: 2001, generation: 0 });
    expect(saved.ok).toBe(true);
    const second = prepareSocietyJob({ world: saved.world, state: saved.state, actor: 'V', nowMs: 3000, sequence: 1, ...options });
    const reply = applyCapabilityChoice(saved.state, saved.world, second.turn,
      { project: { ...project, goal: 'Learn bread making from Pilar.' }, message: { to: 'P', text: 'Claro, Pilar. Quiero aprender a preparar esa masa.' } },
      { nowMs: 3001, generation: 0 });
    expect(reply.ok).toBe(true);
    const before = hash(reply.state), originalTranscript = reply.state.conversations[0]!.turns.map(({ id, speaker, text }) => ({ id, speaker, text }));
    const next = { world: reply.world, state: reply.state, actor: 'P' as const, nowMs: 4000, sequence: 2, ...options };
    const historical = prepareSocietyJob(next), current = prepareSocietyJob({ ...next, protocolVersion: 4 });
    const conversation = contextOf(current.turn).conversation;
    expect(conversation.transcript).toEqual(originalTranscript);
    expect(hash(conversation.transcript)).toBe(hash(contextOf(historical.turn).conversation.transcript));
    expect(current.turn.evidenceIds).toEqual(historical.turn.evidenceIds);
    expect(current.turn.conversation).toEqual(historical.turn.conversation);
    for (const entry of originalTranscript) expect(current.turn.evidenceIds).toContain(entry.id);
    expect(hash(reply.state)).toBe(before);
  });

  it('grounds a reply in the actual preceding speaker and text', () => {
    const world = genesisState(91), state = createSocietyState(world, 1000);
    const options = { nowMs: 2000, sequence: 0, generation: 0, worldRevision: 0, habitatId: 'offline-schema-context', protocolVersion: 7 as const };
    const first = prepareSocietyJob({ state, world, actor: 'A', ...options });
    const utterance = 'Bex, can we discuss the stores inventory together?';
    const result = applyCapabilityChoice(state, world, first.turn, { project, message: { to: 'B', text: utterance } }, { nowMs: 2001, generation: 0 });
    expect(result.ok).toBe(true);
    const reply = prepareSocietyJob({ state: result.state, world: result.world, actor: 'B', ...options, nowMs: 3000 });
    const context = JSON.parse(reply.turn.prompt.slice(reply.turn.prompt.indexOf('\n{') + 1));
    expect(context.conversation.nextSpeaker).toBe('B');
    expect(context.conversation.transcript.at(-1)).toMatchObject({ speaker: 'A', text: utterance });
    expect(reply.job.prompt.system).toContain('answer the actual last speaker');
  });

  it('labels unprojectable saved steps without guessing an inherited room or changing the saved plan', () => {
    const world = genesisState(91), state = createSocietyState(world, 1000);
    const old = prepareSocietyTurn(state, world, 'B', { nowMs: 2000, sequence: 0, generation: 0 });
    const saved = applySocietyTurn(state, world, old, { project: { ...project, mode: 'replace', visibility: 'private',
      steps: [{ verb: 'go', room: 'well' }, { verb: 'clean' }, { verb: 'observe' }, { verb: 'clean', at: 'well' }] } },
    { nowMs: 2001, generation: 0 });
    expect(saved.ok).toBe(true);
    const before = structuredClone(saved.state);
    const { turn } = prepareSocietyJob({ state: saved.state, world: saved.world, actor: 'B', nowMs: 3000,
      sequence: 1, generation: 0, worldRevision: 0, habitatId: 'offline-legacy-projection' });
    const context = JSON.parse(turn.prompt.slice(turn.prompt.indexOf('\n{') + 1));
    expect(context.ownProject.steps[1]).toMatchObject({ intent: { legacyVerb: 'clean' }, at: null,
      legacyReason: 'Its effect depends on the room when this saved step executes.' });
    expect(context.ownProject.steps[1].intent.verb).toBeUndefined();
    expect(context.ownProject.steps[2].intent).toMatchObject({ legacyVerb: 'observe' });
    expect(context.ownProject.steps[3].intent.verb).toBe('filter_water');
    expect(saved.state).toEqual(before);
  });
});
