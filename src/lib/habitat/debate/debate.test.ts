import { describe, expect, it } from 'vitest';
import { DEBATE_PERSONAS } from './personas';
import { contributionIssues, questionIssues, type DebateCase, type DebatePost } from './contracts';
import { openingPrompt, questionPrompt, replyPlan, replyPrompt } from './prompts';

// Synthetic fixtures establish mechanics, not the quality of real generation.
const debate: DebateCase = { id: 'fixture', domain: 'space', title: 'Fixture case',
  context: 'A synthetic context for a mechanical unit test. '.repeat(14), question: 'How should these people arrange their shared future?', centralTension: 'Autonomy and mutual care' };
const openings: DebatePost[] = DEBATE_PERSONAS.map(person => ({ id: `opening-${person.id}`, personaId: person.id,
  round: 1, replyTo: null, body: `Independent opening by ${person.id}.` }));

describe('debate context and participation', () => {
  it('keeps profiles fixed and assigns each an explicit internal tension', () => {
    expect(DEBATE_PERSONAS).toHaveLength(6);
    expect(new Set(DEBATE_PERSONAS.map(person => person.id)).size).toBe(6);
    for (const person of DEBATE_PERSONAS) {
      expect(Object.isFrozen(person)).toBe(true);
      expect(person.tension.length).toBeGreaterThan(40);
      expect(person.reviseWhen.length).toBeGreaterThan(40);
    }
  });
  it('does not send other openings, other personalities or editorial labels into an independent opening', () => {
    for (const person of DEBATE_PERSONAS) {
      const prompt = openingPrompt(debate, person);
      expect(JSON.parse(prompt.user)).not.toHaveProperty('firstRound');
      expect(prompt.user).not.toContain(debate.centralTension);
      expect(prompt.system).toContain(person.priority);
      for (const other of DEBATE_PERSONAS.filter(other => other.id !== person.id)) expect(prompt.system).not.toContain(other.priority);
    }
  });
  it('uses a balanced rotation with no self reply or missing target', () => {
    const seen = new Set<string>();
    for (let offset = 1; offset <= 5; offset++) {
      const plan = replyPlan(openings, offset);
      expect(new Set(plan.map(row => row.replyTo)).size).toBe(6);
      for (const row of plan) {
        expect(row.replyTo).not.toBe(`opening-${row.personaId}`);
        seen.add(`${row.personaId}:${row.replyTo}`);
      }
    }
    expect(seen.size).toBe(30);
  });
  it('blocks replies until all six independent openings exist', () => {
    expect(() => replyPlan(openings.slice(1), 1)).toThrow('complete_independent_round_required');
    expect(() => replyPlan(openings, 0)).toThrow();
    expect(() => replyPlan([...openings.slice(1), openings[1]!], 1)).toThrow();
  });
  it('gives every reply the same frozen first-round evidence', () => {
    const source = JSON.stringify(openings);
    for (const row of replyPlan(openings, 1)) {
      const persona = DEBATE_PERSONAS.find(person => person.id === row.personaId)!;
      expect(JSON.parse(replyPrompt(debate, persona, openings, row.replyTo).user).firstRound).toEqual(openings);
    }
    expect(JSON.stringify(openings)).toBe(source);
  });
  it('flags exact repeats and multiple questions and bounds recent case context', () => {
    expect(questionIssues(debate, [])).toEqual([]);
    expect(questionIssues(debate, [debate])).toContain('exact_repeat');
    expect(questionIssues({ ...debate, question: 'What should happen? Who decides?' }, [])).toContain('one_question_required');
    expect(questionIssues({ ...debate, question: 'Should the community accept this permanent change?' }, [])).toContain('closed_question');
    expect(questionIssues({ ...debate, question: 'What would a fair agreement require from everyone involved?' }, [])).toEqual([]);
    expect(JSON.parse(questionPrompt('biology', Array.from({ length: 70 }, () => debate)).user).recentlyPublished).toHaveLength(30);
    expect(contributionIssues('Too short.')).toEqual(['post_word_count']);
  });
});
