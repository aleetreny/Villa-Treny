import type { JsonValue } from './contracts';

/** A provider-independent hard bound, including system and output schema.
 * This is a byte budget, deliberately not a claimed exact token count. The
 * router reserves the byte-fallback upper bound; token tests measure Qwen.
 */
export const MAX_PROMPT_BYTES = 6_500;
const encoder = new TextEncoder();
export const promptBytes = (system: string, user: string, schema: JsonValue): number =>
  encoder.encode([system, user, JSON.stringify(schema)].join('\n')).byteLength;

const object = (value: JsonValue | undefined): Record<string, JsonValue> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = (value: JsonValue | undefined): JsonValue[] => Array.isArray(value) ? value : [];

function brief(value: JsonValue, limit = 220): JsonValue {
  if (typeof value === 'string') return [...value].slice(0, limit).join('');
  if (Array.isArray(value)) return value.slice(0, 8).map((entry) => brief(entry, limit));
  if (value !== null && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, brief(entry, limit)]),
  );
  return value;
}

/** Select facts deterministically; never synthesize another person's thoughts. */
export function packPromptContext(system: string, original: Record<string, JsonValue>, schema: JsonValue): string {
  const context = brief(original) as Record<string, JsonValue>;
  const economy = object(context.economy);
  const debts = list(object(original.economy).obligations).map(object)
    .sort((a, b) => Number(a.dueDay ?? a.dueOnDay ?? 0) - Number(b.dueDay ?? b.dueOnDay ?? 0));
  if (debts.length) {
    economy.obligations = debts.slice(0, 4).map((debt) => Object.fromEntries(
      ['id', 'lender', 'borrower', 'remaining', 'amount', 'repaid', 'dueDay', 'dueOnDay', 'status']
        .filter((key) => debt[key] !== undefined).map((key) => [key, brief(debt[key]!)]),
    ));
    economy.obligationSummary = {
      count: debts.length,
      shown: Math.min(4, debts.length),
      order: 'earliest due first',
    };
  }
  context.economy = economy;
  for (const key of ['privateKnowledge', 'knowledge', 'knownFacts']) {
    if (original[key] !== undefined) context[key] = list(original[key]).map((fact) => brief(fact, 160));
  }
  // List truncation must not remove the action vocabulary. Only concrete target
  // examples are bounded; the engine validates every supplied intention again.
  context.possibleActions = list(original.possibleActions).map((action) => {
    const value = object(brief(action, 100));
    for (const key of ['targets', 'rooms', 'facts']) if (Array.isArray(value[key])) value[key] = value[key].slice(0, 3);
    return value;
  });
  context.memory = list(original.memory).slice(-4).map((fact) => brief(fact));
  const remembered = new Set(list(context.memory).map((fact) => object(fact).outcome));
  context.recentHistory = list(original.recentHistory).filter((entry) => !remembered.has(object(entry).text)).slice(-3).map((entry) => brief(entry));
  const omitted: string[] = [];
  const serialize = () => JSON.stringify({ ...context, ...(omitted.length ? { omittedContext: omitted } : {}) });
  const fits = () => promptBytes(system, serialize(), schema) <= MAX_PROMPT_BYTES;
  // Commitments, self-owned knowledge and available actions take priority over
  // redundant scene detail, historical prose and repeated relationship axes.
  for (const key of ['recentHistory', 'knownBonds', 'relationships', 'surroundings']) {
    if (fits()) return serialize();
    if (context[key] !== undefined) { delete context[key]; omitted.push(key); }
  }
  if (!fits()) {
    const resident = object(context.resident);
    for (const key of ['before', 'formerWork', 'age']) delete resident[key];
    context.resident = brief(resident, 100);
    context.memory = list(context.memory).slice(-2).map((fact) => brief(fact, 100));
    economy.terms = brief(economy.terms ?? '', 160);
  }
  if (!fits()) {
    // The complete fact remains in persistent state. Its ID/provenance survives
    // packing so a safe, authorized transfer can still refer to the same fact.
    for (const key of ['privateKnowledge', 'knowledge', 'knownFacts']) {
      if (context[key] !== undefined) context[key] = list(context[key]).map((fact) => brief(fact, 80));
    }
  }
  if (!fits()) {
    for (const key of ['privateKnowledge', 'knowledge', 'knownFacts']) {
      if (context[key] !== undefined) context[key] = list(context[key]).map((fact) => {
        const value = { ...object(fact) };
        if (typeof value.text === 'string') value.text = [...value.text].slice(0, 32).join('');
        return value;
      });
    }
  }
  if (!fits()) throw new RangeError('Required cognition context exceeds its byte budget.');
  return serialize();
}
