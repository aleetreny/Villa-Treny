import { CHARACTER_IDS, type CharacterId } from '../debate/characters';
import type { Puzzle, Statement, StatementKind } from './contracts';

/** The Villa Liar: a seeded generator of small deductive puzzles. Every
 * statement is a formal predicate over "who is guilty", so the solver checks
 * the published rule by enumeration instead of trusting any language model. */
export const MYSTERY_VERSION = 'villa-liar-v1';
export const MYSTERY_RULE = 'Exactly one resident is responsible. That resident’s statement is false. The other five statements are true.';
const GIVEN: Record<CharacterId, string> = { A: 'Ama', B: 'Bex', C: 'Cato', D: 'Dima', E: 'Edda', F: 'Ferran' };
export const SCENARIOS = [
  { id: 'greenhouse-key', title: 'The greenhouse key', setting: 'The spare key to the roof greenhouse is missing from its hook by the stairs.', question: 'Who took the greenhouse key?' },
  { id: 'chess-clock', title: 'The chess clock', setting: 'The common room’s chess clock has vanished from its shelf on tournament night.', question: 'Who took the chess clock?' },
  { id: 'honey-jar', title: 'The last jar of honey', setting: 'The last jar of garden honey has disappeared from the pantry.', question: 'Who took the honey?' },
  { id: 'tide-map', title: 'The tide map', setting: 'The laminated tide map is no longer pinned beside the dock door.', question: 'Who took the tide map?' },
  { id: 'lantern', title: 'The brass lantern', setting: 'The brass lantern used for the evening walk is missing from the hall.', question: 'Who took the lantern?' },
  { id: 'record', title: 'The borrowed record', setting: 'Someone removed the only jazz record from the music room before the listening night.', question: 'Who took the record?' },
] as const;

/** Formal statement in role space; subjects are resident IDs (or roles). */
type Shape = { speaker: number; kind: StatementKind; subjects: number[] };
export function truthSet(shape: Shape): number[] {
  const all = [0, 1, 2, 3, 4, 5], [x, y, z] = shape.subjects;
  switch (shape.kind) {
    case 'innocent': case 'truthful': return all.filter(c => c !== x);
    case 'accuse': case 'liar': return [x!];
    case 'either': case 'conditional': return [x!, y!];
    case 'neither': return all.filter(c => c !== x && c !== y);
    case 'group': return [x!, y!, z!];
  }
}
/** Candidate c is consistent when the speaker c lies and everyone else tells the truth. */
export function consistent(shapes: Shape[], candidate: number, speakers = shapes.map(s => s.speaker)): boolean {
  return shapes.filter(s => speakers.includes(s.speaker)).every(s => truthSet(s).includes(candidate) === (s.speaker !== candidate));
}
export function solve(shapes: Shape[], speakers?: number[]): number[] {
  return [0, 1, 2, 3, 4, 5].filter(c => consistent(shapes, c, speakers));
}
/** Smallest number of statements that alone single out the solution. */
export function minimalClues(shapes: Shape[]): number {
  let best = 7;
  for (let mask = 1; mask < 64; mask++) {
    const speakers = [0, 1, 2, 3, 4, 5].filter(i => mask & (1 << i));
    if (speakers.length < best && solve(shapes, speakers).length === 1) best = speakers.length;
  }
  return best;
}

export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}
export const dayNumber = (date: string) => Math.floor(Date.parse(date + 'T12:00:00Z') / 86_400_000);
/** Balanced rotation: every block of six consecutive days names each resident
 * as the culprit exactly once, in a seeded order. */
export function culpritFor(date: string): CharacterId {
  const n = dayNumber(date), block = Math.floor(n / 6);
  return shuffle(CHARACTER_IDS, rng(seedOf(MYSTERY_VERSION + ':block:' + block)))[((n % 6) + 6) % 6]!;
}

const KINDS: StatementKind[] = ['innocent', 'accuse', 'either', 'neither', 'liar', 'truthful', 'group', 'conditional'];
function randomShape(speaker: number, random: () => number): Shape {
  const kind = KINDS[Math.floor(random() * KINDS.length)]!;
  const pool = [0, 1, 2, 3, 4, 5];
  const pick = (n: number, exclude: number[]) => shuffle(pool.filter(p => !exclude.includes(p)), random).slice(0, n);
  // Self-accusation is never consistent, and "X is lying/truthful" about oneself is paradoxical.
  const selfless = kind === 'accuse' || kind === 'liar' || kind === 'truthful';
  const count = kind === 'group' ? 3 : ['either', 'neither', 'conditional'].includes(kind) ? 2 : 1;
  const subjects = kind === 'innocent' && random() < 0.25 ? [speaker] : pick(count, selfless || kind === 'innocent' ? [speaker] : []);
  return { speaker, kind, subjects: subjects.sort((a, b) => a - b) };
}
const signature = (shapes: Shape[]) => shapes.map(s => s.kind + '(' + s.subjects.join('') + ')').join(' ');
/** Accepts only a unique solution (role 0) that needs exactly three clues,
 * uses at least four statement kinds and at most one empty self-denial. */
export function acceptable(shapes: Shape[]): boolean {
  if (shapes.length !== 6 || shapes.some((s, i) => s.speaker !== i)) return false;
  const solutions = solve(shapes);
  if (solutions.length !== 1 || solutions[0] !== 0) return false;
  const clues = minimalClues(shapes);
  // One comparable difficulty band: exactly three statements are needed.
  if (clues !== 3) return false;
  if (new Set(shapes.map(s => s.kind)).size < 4) return false;
  if (shapes.filter(s => s.kind === 'innocent' && s.subjects[0] === s.speaker).length > 1) return false;
  return new Set(shapes.map(s => s.kind + s.subjects.join())).size === 6;
}
/** Hand-checked fallbacks in role space (role 0 is the culprit). Tests verify
 * that each one satisfies `acceptable`. */
export const FALLBACK_TEMPLATES: Shape[][] = [
  [{ speaker: 0, kind: 'group', subjects: [3, 4, 5] }, { speaker: 1, kind: 'innocent', subjects: [1] }, { speaker: 2, kind: 'group', subjects: [0, 1, 5] }, { speaker: 3, kind: 'neither', subjects: [3, 4] }, { speaker: 4, kind: 'truthful', subjects: [5] }, { speaker: 5, kind: 'truthful', subjects: [2] }],
  [{ speaker: 0, kind: 'group', subjects: [1, 3, 4] }, { speaker: 1, kind: 'group', subjects: [0, 2, 4] }, { speaker: 2, kind: 'either', subjects: [0, 3] }, { speaker: 3, kind: 'truthful', subjects: [4] }, { speaker: 4, kind: 'innocent', subjects: [5] }, { speaker: 5, kind: 'innocent', subjects: [2] }],
  [{ speaker: 0, kind: 'either', subjects: [1, 2] }, { speaker: 1, kind: 'neither', subjects: [1, 5] }, { speaker: 2, kind: 'innocent', subjects: [2] }, { speaker: 3, kind: 'group', subjects: [0, 2, 5] }, { speaker: 4, kind: 'group', subjects: [0, 1, 3] }, { speaker: 5, kind: 'innocent', subjects: [4] }],
];

function render(shape: Shape, roles: readonly CharacterId[]): string {
  const name = (role: number) => role === shape.speaker ? 'I' : GIVEN[roles[role]!];
  const [x, y] = shape.subjects.map(name);
  const pair = () => shape.subjects.includes(shape.speaker) ? [x === 'I' ? y : x, 'I'] : [x, y];
  switch (shape.kind) {
    case 'innocent': return x === 'I' ? 'I did not take it.' : `${x} did not take it.`;
    case 'accuse': return `${x} took it.`;
    case 'liar': return `${x} is lying.`;
    case 'truthful': return `${x} is telling the truth.`;
    case 'either': { const [a, b] = pair(); return b === 'I' ? `It was either ${a} or me.` : `It was either ${a} or ${b}.`; }
    case 'conditional': {
      const [a, b] = shape.subjects.map(r => r === shape.speaker ? 'me' : GIVEN[roles[r]!]);
      return a === 'me' ? `If it wasn’t me, then it was ${b}.` : `If it wasn’t ${a}, then it was ${b}.`;
    }
    case 'neither': { const [a, b] = pair(); return `Neither ${a} nor ${b === 'I' ? 'I' : b} took it.`; }
    case 'group': {
      const names = shape.subjects.map(r => r === shape.speaker ? 'me' : GIVEN[roles[r]!]);
      return `It was one of ${names[0]}, ${names[1]} and ${names[2]}.`;
    }
  }
}
function explain(shapes: Shape[], roles: readonly CharacterId[], texts: string[]): string[] {
  const lines: string[] = [];
  for (const candidate of [1, 2, 3, 4, 5].sort((a, b) => CHARACTER_IDS.indexOf(roles[a]!) - CHARACTER_IDS.indexOf(roles[b]!))) {
    const broken = shapes.find(s => s.speaker === candidate && truthSet(s).includes(candidate))
      ?? shapes.find(s => truthSet(s).includes(candidate) !== (s.speaker !== candidate))!;
    const who = GIVEN[roles[candidate]!], speaker = GIVEN[roles[broken.speaker]!], said = texts[broken.speaker]!;
    lines.push(broken.speaker === candidate
      ? `Not ${who}: ${who}’s own statement, “${said}”, would then be true, but the responsible resident’s statement must be false.`
      : `Not ${who}: ${speaker}’s statement, “${said}”, would then be false, though ${speaker} would be innocent.`);
  }
  lines.push(`Only ${GIVEN[roles[0]!]} fits: that statement is false and the other five are true.`);
  return lines;
}

/** Deterministic for a date. Returns the first acceptable candidate within a
 * bounded budget, else a tested fallback template with a fresh permutation. */
export function generatePuzzle(date: string, budget = 4000): Puzzle {
  const seed = seedOf(MYSTERY_VERSION + ':' + date), random = rng(seed), culprit = culpritFor(date);
  const roles = [culprit, ...shuffle(CHARACTER_IDS.filter(id => id !== culprit), random)];
  const scenario = SCENARIOS[((dayNumber(date) % SCENARIOS.length) + SCENARIOS.length) % SCENARIOS.length]!;
  let shapes: Shape[] | null = null, attempts = 0;
  while (!shapes && attempts < budget) {
    attempts++;
    const candidate = [0, 1, 2, 3, 4, 5].map(speaker => {
      for (let tries = 0; tries < 40; tries++) {
        const shape = randomShape(speaker, random);
        if (truthSet(shape).includes(0) === (speaker !== 0)) return shape;
      }
      return { speaker, kind: 'innocent' as const, subjects: speaker === 0 ? [0] : [speaker] };
    });
    if (acceptable(candidate)) shapes = candidate;
  }
  shapes ??= FALLBACK_TEMPLATES[seed % FALLBACK_TEMPLATES.length]!;
  const texts = shapes.map(shape => render(shape, roles));
  // Publish in resident order so the speaking order never hints at the role.
  const statements: Statement[] = shapes.map((shape, i) => ({ speaker: roles[shape.speaker]!, kind: shape.kind, subjects: shape.subjects.map(r => roles[r]!),
    text: texts[i]!, truthSet: truthSet(shape).map(r => roles[r]!).sort() }))
    .sort((a, b) => CHARACTER_IDS.indexOf(a.speaker) - CHARACTER_IDS.indexOf(b.speaker));
  const clues = minimalClues(shapes);
  return { version: MYSTERY_VERSION, seed, attempts, scenario: { ...scenario }, rule: MYSTERY_RULE, culprit, statements,
    solutions: solveStatements(statements), template: { signature: signature(shapes), roles },
    difficulty: { minimalClues: clues, directClues: shapes.filter(s => ['accuse', 'innocent'].includes(s.kind)).length,
      referenceClues: shapes.filter(s => ['liar', 'truthful'].includes(s.kind)).length, level: clues >= 4 ? 'hard' : 'standard' },
    explanation: explain(shapes, roles, texts) };
}
/** Independent check on the published, resident-labelled statements. */
export function solveStatements(statements: Pick<Statement, 'speaker' | 'truthSet'>[]): CharacterId[] {
  return CHARACTER_IDS.filter(c => statements.length === 6 && new Set(statements.map(s => s.speaker)).size === 6
    && statements.every(s => s.truthSet.includes(c) === (s.speaker !== c)));
}
