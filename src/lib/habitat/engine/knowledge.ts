import { BONDS, LATENT } from '../weave';
import { RESIDENTS, type ResidentId } from '../residents';

export type KnownFact = { id: string; learnedDay: number | null; source: ResidentId };
export const FACTS: Readonly<Record<string, { text: string; private: boolean; owner?: ResidentId }>> = Object.fromEntries([
  ...LATENT.map((fact) => [`secret:${fact.from}:${fact.to}:${fact.knower}`, { text: fact.line, private: true, owner: fact.knower }] as const),
  ...['grow', 'cook', 'clean', 'dig', 'repair'].map((verb) => [`skill:${verb}`, {
    text: ({ grow: 'Growing trays need water and produce food.', cook: 'Prepared meals consume produce and clean water.',
      clean: 'The well can be filtered by hand when pumps fail.', dig: 'Cutting produces materials and consumes water.',
      repair: 'Repairing machinery consumes materials; charge makes it faster.' } as Record<string, string>)[verb]!, private: false,
  }] as const),
]);
const SKILLED: Partial<Record<ResidentId, string>> = { V: 'grow', E: 'cook', H: 'cook', O: 'clean', F: 'dig', X: 'dig', Y: 'dig', J: 'repair', Q: 'repair', W: 'repair' };
export function initialKnowledge(id: ResidentId): KnownFact[] {
  const ids = Object.entries(FACTS).filter(([, fact]) => fact.owner === id).map(([key]) => key);
  if (SKILLED[id]) ids.push(`skill:${SKILLED[id]}`);
  return ids.map((fact) => ({ id: fact, learnedDay: null, source: id }));
}
export function knowledgeFor(facts: readonly KnownFact[]) {
  return facts.map((fact) => ({ ...fact, text: FACTS[fact.id]!.text, private: FACTS[fact.id]!.private }));
}
export function isKnownFactId(id: string): boolean { return Object.hasOwn(FACTS, id); }
export const MAX_KNOWN_FACTS = Object.keys(FACTS).length;
export function validKnowledgeSource(id: string): boolean { return RESIDENTS.some((resident) => resident.id === id); }

/** Shared history, stripped of the author-only description of either person's
 * unspoken motives. These summaries are reviewed against each authored bond. */
const SHARED_HISTORY: Readonly<Record<string, string>> = {
  UO: 'Half-siblings. Nineteen years without speaking, over a house neither kept. Civil since the crash.',
  SX: 'Sten taught Xan to swim forty-eight years ago.', AU: 'Schoolmates who are fond of one another.',
  XA: 'Grew up on the same street.', SO: "Sten knew Osvald's father at the harbour.",
  HQ: "Halim blocked Quim's promotion twice; Quim knows this.", HG: 'Worked together for twenty years.',
  GQ: 'Gita was a demanding colleague toward Quim.', DH: 'Dima reported a real structural fault; Halim buried the report. Nobody was hurt. They have not discussed it here.',
  QW: 'Worked together for two overlapping years, on friendly terms.', MT: 'A close bond of thirty years.',
  TV: "Tomás is Vero's uncle. He took his sister's side in a family rupture.", MV: 'Mara has known Vero since she was nine.',
  FM: 'Ferran carried messages between people for years; this was known.', FI: 'Ferran brought Iris into their former circle.',
  MI: 'Mara has blamed Iris for twenty-two years; Iris knows what she is blamed for.', PK: 'Lived in the same building for nine years.',
  KJ: "Juno rode Kes's route; they knew each other in passing.", LP: 'Lior previously owed money to the bakery.',
  CY: "Cato was briefly Yara's clinician.", CN: 'Two doctors who met at conferences, on cordial terms.',
  FH: 'Ferran drew for the yard for one season twenty-odd years ago. They recognised each other in Common on day four.',
  PA: 'Originally from the same region; recognised their accents in the first week after the crash.',
};
export function sharedBondsFor(actor: ResidentId) {
  return BONDS.filter((bond) => bond.from === actor || bond.to === actor).flatMap((bond) => {
    const history = SHARED_HISTORY[`${bond.from}${bond.to}`];
    return history ? [{ other: bond.from === actor ? bond.to : bond.from, history }] : [];
  });
}
