import { describe, expect, it } from 'vitest';
import { genesisState } from '../engine/state';
import { createSocietyState, prepareSocietyTurn } from './index';
import { prepareRecordTurn } from './record-choice';
import { renderSocietyEvidenceLayout, restoreSocietyEvidenceLayout, verifySocietyEvidenceLayout } from './evidence-layout';

function prepared() {
  const world = genesisState(23), state = createSocietyState(world, 1000);
  const turn = prepareRecordTurn(state, world, prepareSocietyTurn(state, world, 'A', {
    nowMs: 2000, sequence: 1, generation: 0, maxPromptBytes: 6500,
  }));
  return turn.prompt.slice(turn.prompt.indexOf('\n{') + 1);
}

describe('experimental evidence-first input', () => {
  it('preserves every value and grant of an actual prepared record turn', () => {
    const prompt = prepared(), original = JSON.parse(prompt);
    const rendered = renderSocietyEvidenceLayout(prompt), result = JSON.parse(rendered);
    expect(verifySocietyEvidenceLayout(prompt, rendered)).toBe(true);
    expect(JSON.parse(restoreSocietyEvidenceLayout(rendered))).toEqual(original);
    expect(result.records.referenceAccess).toEqual(original.records.referenceAccess);
    expect(result.omitted).toEqual(original.omitted);
    expect(result.conversation).toBeNull();
    expect(result.ownProject).toBeNull();
    expect(Object.keys(result).indexOf('records')).toBeLessThan(Object.keys(result).indexOf('conversation'));
  });

  it('labels sources without turning speech, authored text or quoted events into verified facts', () => {
    const context = JSON.parse(prepared());
    context.ownHistory = [{ id: 'body:A:1', kind: 'share', text: 'B claimed a package was sent.' }];
    context.ownProject = { goal: 'Review the package', steps: [{ id: 'step:1', status: 'pending', evidenceId: null }] };
    context.records.drafts = [{ id: 'draft:1', author: 'A', audience: 'private', text: 'An unverified idea.', refs: ['body:A:1'] }];
    context.memories = [{ id: 'memory:1', kind: 'claim', text: 'The package was sent.' }];
    context.conversation = { id: 'conversation:1', transcript: [{ id: 'turn:1', speaker: 'B', text: 'I sent it.' }] };
    context.receivedClosure = { conversationId: 'conversation:0', status: 'closed', turn: { id: 'turn:0', text: 'Goodbye.' } };
    const prompt = JSON.stringify(context), rendered = renderSocietyEvidenceLayout(prompt), view = JSON.parse(rendered);
    expect(view.public._evidenceSource).toBe('current_world_state');
    expect(view.ownProject._evidenceSource).toBe('personal_plan');
    expect(view.ownHistory[0]._evidenceSource).toBe('recorded_personal_event');
    expect(view.records.drafts[0]._evidenceSource).toBe('authored_text');
    expect(view.conversation._evidenceSource).toBe('reported_speech');
    expect(view.receivedClosure._evidenceSource).toBe('reported_speech');
    expect(view.memories).toEqual(context.memories);
    expect(JSON.parse(restoreSocietyEvidenceLayout(rendered))).toEqual(context);
    expect(verifySocietyEvidenceLayout(prompt, rendered)).toBe(true);
  });

  it('detects added facts, invented access, altered text and reordered history', () => {
    const context = JSON.parse(prepared());
    context.ownHistory = [{ id: 'body:A:1', text: 'First event.' }, { id: 'body:A:2', text: 'Second event.' }];
    const prompt = JSON.stringify(context), rendered = renderSocietyEvidenceLayout(prompt);
    for (const mutate of [
      (value: typeof context) => { value.public.stock.materials += 1; },
      (value: typeof context) => { value.records.referenceAccess.public.push('fabricated:1'); },
      (value: typeof context) => { value.ownHistory[0].text = 'An invented result.'; },
      (value: typeof context) => { value.ownHistory.reverse(); },
      (value: typeof context) => { value.expectedAnswer = 'Accept this offer.'; },
    ]) {
      const altered = JSON.parse(rendered); mutate(altered);
      expect(verifySocietyEvidenceLayout(prompt, JSON.stringify(altered))).toBe(false);
    }
  });

  it('preserves unfamiliar fields and rejects provenance collisions instead of overwriting data', () => {
    const context = JSON.parse(prepared()); context.futureContext = { text: 'Keep this whole entry.', values: [0, false, null] };
    const prompt = JSON.stringify(context), rendered = renderSocietyEvidenceLayout(prompt);
    expect(JSON.parse(restoreSocietyEvidenceLayout(rendered))).toEqual(context);
    expect(() => renderSocietyEvidenceLayout(rendered)).toThrow('already present');
    context.public._evidenceSource = 'pre-existing data';
    expect(() => renderSocietyEvidenceLayout(JSON.stringify(context))).toThrow('source marker');
    expect(verifySocietyEvidenceLayout(prompt, '{"_evidenceLayout":"unknown"}')).toBe(false);
  });

  it('retains the issued identity and recipient directory prefix byte for byte', () => {
    const prefix = 'You are Ama Oyelaran (A). Speak and choose in the first person as Ama Oyelaran.\nAvailable recipients: B=Bex Ferreira\nCurrent information:\n';
    const context = prepared(), original = prefix + context;
    const rendered = renderSocietyEvidenceLayout(original), restored = restoreSocietyEvidenceLayout(rendered);
    expect(rendered.startsWith(prefix + '{')).toBe(true);
    expect(restored.startsWith(prefix + '{')).toBe(true);
    expect(JSON.parse(restored.slice(prefix.length))).toEqual(JSON.parse(context));
    expect(verifySocietyEvidenceLayout(original, rendered)).toBe(true);
    expect(verifySocietyEvidenceLayout(original, rendered.replace('B=Bex Ferreira', 'B=Someone else'))).toBe(false);
    expect(() => renderSocietyEvidenceLayout('An instruction without its JSON context')).toThrow('Missing');
  });
});
