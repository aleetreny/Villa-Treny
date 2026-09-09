import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { genesisState } from '../engine/state';
import type { ResidentId } from '../residents';
import * as compact from './compact-schema';
import * as records from './record-choice';
import { recordContentHash } from './record-schema';
import { RECORD_LIMITS, type AuthoredDraft } from './record-types';
import { createSocietyState } from './state';
import { parseSocietyState } from './schema';
import { prepareSocietyTurn } from './turn';
import { attentionCapabilityChoiceJsonSchema, prepareAttentionTurn } from './attention-choice';

type Shape = Record<string, unknown>;
const object = (value: unknown): value is Shape => value !== null && typeof value === 'object' && !Array.isArray(value);
const ref = (name: string): Shape => ({ $ref: `#/$defs/${name}` });
const obj = (properties: Shape): Shape => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

/** Test oracle for the compiler's supported local, acyclic references. Compare
 * every constraint and annotation; only storage definitions disappear. This is
 * deliberately not a general JSON Schema resolver. */
function expand(schema: Shape): unknown {
  const definitions = object(schema.$defs) ? schema.$defs : {};
  const cache = new Map<string, unknown>(), active = new Set<string>();
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!object(value)) return value;
    if (typeof value.$ref === 'string') {
      if (!value.$ref.startsWith('#/$defs/') || Object.keys(value).length !== 1) throw new Error('Unsupported oracle reference');
      const key = value.$ref.slice(8);
      if (active.has(key) || !object(definitions[key])) throw new Error('Invalid oracle reference');
      if (cache.has(key)) return cache.get(key);
      active.add(key); const body = visit(definitions[key]); active.delete(key); cache.set(key, body); return body;
    }
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$defs').map(([key, child]) => [key, visit(child)]));
  };
  return visit(schema);
}

function fixture(channels = 0, draftCount = 0) {
  const world = genesisState(91), state = createSocietyState(world, 1000), nowMs = 20_000;
  state.minds.A.project = { id: `project:${state.nextId++}`, goal: 'Consider the available accounts.',
    why: 'I want to inspect their exact terms.', visibility: 'private', status: 'active', createdAtMs: 1000, steps: [] };
  for (let index = 0; index < channels; index++) {
    const counterpart = (['B', 'C', 'D', 'E', 'F', 'G'] as ResidentId[])[index]!;
    const closed = index >= 3;
    state.conversations.push({ id: `conversation:${state.nextId++}`, participants: ['A', counterpart],
      revision: closed ? 3 : 2, nextSpeaker: closed ? null : 'A', status: closed ? 'closed' : 'open',
      createdAtMs: 2000 + index, expiresAtMs: 100_000, attentionThrough: [0, 0],
      turns: [0, 1].map(turn => ({ id: `turn:${state.nextId++}`, index: turn,
        speaker: turn ? counterpart : 'A', text: `Exact ${turn ? 'received' : 'own'} account for ${counterpart}.`, atMs: 3000 + index * 100 + turn })) });
  }
  for (let index = 0; index < draftCount; index++) {
    const draft: AuthoredDraft = { id: `record:draft:${state.records.nextId++}`, author: index % 2 ? 'B' : 'A',
      title: `Account ${index} `.padEnd(RECORD_LIMITS.titleBytes, 't'),
      text: `Exact full text ${index}. `.padEnd(RECORD_LIMITS.contentBytes - RECORD_LIMITS.titleBytes, 'x'),
      refs: [], parent: null, contentHash: '', audience: 'public', createdAtMs: 4000 + index, createdAtWatch: 0 };
    draft.contentHash = recordContentHash(draft); state.records.drafts.push(draft);
  }
  if (draftCount) {
    state.retrieval.A = { ...state.retrieval.A, revision: 1, lastSequence: 0, pending: true,
      focus: { draftId: state.records.drafts[0]!.id, contentHash: state.records.drafts[0]!.contentHash } };
    state.minds.A.lastAppliedSequence = 0;
  }
  const parsed = parseSocietyState(state);
  expect(parsed.ok, parsed.ok ? 'Valid bounded Society4 snapshot.' : parsed.code).toBe(true);
  const initial = prepareSocietyTurn(state, world, 'A', { nowMs, generation: 0, sequence: 1,
    dialoguePolicy: 'concurrent-v1', maxPromptBytes: 6500 });
  return { state, world, turn: prepareAttentionTurn(state, world, initial) };
}

beforeEach(() => vi.stubGlobal('fetch', () => { throw new Error('Schema review forbids network and inference'); }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('independent local-reference compaction review', () => {
  it('preserves all constraints through alias chains, sharing, unused definitions and stable renaming', () => {
    const schema: Shape = { ...obj({ first: ref('alias'), second: ref('alias'), third: ref('leaf') }), $defs: {
      alias: ref('alias2'), alias2: ref('leaf'),
      leaf: { type: 'string', enum: ['A', 'B', 'C'], minLength: 1, maxLength: 3, description: 'Exact allowed value.' },
      unused: { type: 'integer', minimum: 1 },
    } };
    const original = structuredClone(schema), result = compact.compactSchemaReferences(schema);
    expect(expand(result)).toEqual(expand(schema)); expect(schema).toEqual(original);
    expect(JSON.stringify(result)).not.toContain('unused');
    expect(compact.compactSchemaReferences(result)).toEqual(result);
    const before = z.fromJSONSchema(schema), after = z.fromJSONSchema(result);
    for (const first of ['A', '', 'D', 1, null]) for (const second of ['B', false]) {
      const value = { first, second, third: 'C' };
      expect(after.safeParse(value).success).toBe(before.safeParse(value).success);
    }
  });

  it.each([
    ['missing target', { ...obj({ value: ref('absent') }), $defs: {} }],
    ['reference siblings', { ...obj({ value: { ...ref('leaf'), maxLength: 1 } }), $defs: { leaf: { type: 'string' } } }],
    ['alias cycle', { ...obj({ value: ref('first') }), $defs: { first: ref('second'), second: ref('first') } }],
    ['multiply referenced self-cycle', { ...obj({ first: ref('node'), second: ref('node') }),
      $defs: { node: obj({ child: ref('node') }) } }],
    ['multiply referenced mutual cycle', { ...obj({ first: ref('one'), second: ref('two') }),
      $defs: { one: obj({ next: ref('two') }), two: obj({ next: ref('one') }) } }],
  ] as const)('rejects %s without depending on inlining frequency', (_label, input) => {
    expect(() => compact.compactSchemaReferences(input)).toThrow(RangeError);
  });

  it.each([
    ['missing target', { ...obj({ proof: ref('absent') }), $defs: {} }],
    ['reference siblings', { ...obj({ proof: { ...ref('leaf'), maxLength: 1 } }), $defs: { leaf: { type: 'string' } } }],
    ['definition cycle', { ...obj({ proof: ref('node') }), $defs: { node: obj({ child: ref('node') }) } }],
  ] as const)('rejects compiler input with %s before expansion can weaken it', (_label, input) => {
    const f = fixture();
    // Inject only at the existing compiler boundary. The private collector
    // must not erase constraints before the final compactor can reject them.
    vi.spyOn(records, 'recordCapabilityChoiceJsonSchema').mockReturnValue(structuredClone(input));
    expect(() => attentionCapabilityChoiceJsonSchema(f.state, f.world, f.turn)).toThrow(RangeError);
  });

  it.each([[0, 0], [1, 0], [6, RECORD_LIMITS.drafts]])(
    'preserves the exact expanded source grammar for %i channels and %i retained documents', (channels, draftCount) => {
      const f = fixture(channels, draftCount), frozen = structuredClone(f);
      const original = compact.compactSchemaReferences;
      let source: Shape | undefined;
      vi.spyOn(compact, 'compactSchemaReferences').mockImplementation(schema => { source = structuredClone(schema); return original(schema); });
      const result = attentionCapabilityChoiceJsonSchema(f.state, f.world, f.turn);
      expect(source).toBeDefined(); expect(expand(result)).toEqual(expand(source!)); expect(f).toEqual(frozen);
      expect(f.turn.attention?.channels).toHaveLength(channels);
      const context = JSON.parse(f.turn.prompt.slice(f.turn.prompt.lastIndexOf('\n{') + 1));
      if (draftCount) {
        expect(context.records.drafts).toHaveLength(3);
        expect(context.records.omitted.drafts).toBe(draftCount - 3);
        for (const shown of context.records.drafts) {
          const exact = f.state.records.drafts.find(d => d.id === shown.id)!;
          expect(shown.text).toBe(exact.text); expect(shown.title).toBe(exact.title);
          expect(new TextEncoder().encode(shown.title + shown.text)).toHaveLength(RECORD_LIMITS.contentBytes);
        }
      }
      const before = z.fromJSONSchema(source!), after = z.fromJSONSchema(result);
      const values: unknown[] = [
        { attention: { kind: 'private', conversationId: null }, content: {} },
        { attention: { kind: 'private', conversationId: 'unissued-channel' }, content: {} },
        { attention: { kind: 'private', conversationId: null }, content: { message: { to: 'B', text: 'Private cannot send.' } } },
        { lookup: { kind: 'search', query: 'stores' } },
        { lookup: { kind: 'search', query: 'x'.repeat(97) } },
        { lookup: { kind: 'clear' }, attention: { kind: 'private', conversationId: null }, content: {} },
      ];
      for (const channel of f.turn.attention!.channels) {
        values.push({ attention: { kind: 'private', conversationId: channel.id }, content: {} },
          { attention: { kind: 'leave', conversationId: channel.id }, content: {} },
          { attention: { kind: 'leave', conversationId: channel.id }, content: { message: { to: channel.counterpart, text: 'No fabricated farewell.' } } },
          { attention: { kind: 'reply', conversationId: channel.id }, content: {} },
          { attention: { kind: 'reply', conversationId: channel.id }, content: { message: { to: channel.counterpart, text: 'I will consider these exact terms.' } } },
          { attention: { kind: 'reply', conversationId: channel.id }, content: { message: { to: 'W', text: 'Wrong counterpart.' } } });
      }
      for (const value of values) expect(after.safeParse(value).success, JSON.stringify(value)).toBe(before.safeParse(value).success);
    }, 20_000);

  it('rejects a seventh prepared channel before invoking the document compiler', () => {
    const f = fixture(6), compile = vi.spyOn(records, 'recordCapabilityChoiceJsonSchema');
    f.turn.attention!.channels.push({ ...f.turn.attention!.channels[0]!, id: 'conversation:unissued' });
    expect(() => attentionCapabilityChoiceJsonSchema(f.state, f.world, f.turn)).toThrow(RangeError);
    expect(compile).not.toHaveBeenCalled();
  });
});
