import { z } from 'zod';

type Shape = Record<string, unknown>;
type Issue = { code: string; path: PropertyKey[]; origin?: string; maximum?: number | bigint; minimum?: number | bigint;
  expected?: string; errors?: Issue[][]; values?: unknown[]; keys?: string[] };
export type StructuralFeedbackIssue = {
  field: string;
  error: 'maxLength' | 'minLength' | 'maxItems' | 'minItems' | 'maximum' | 'minimum' | 'type' | 'required' | 'enum' | 'additionalProperties';
  limit?: number;
  expected?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
};
export type StructuralFeedback = { issues: StructuralFeedbackIssue[]; omitted: boolean };
export const STRUCTURAL_FEEDBACK_LIMITS = { issues: 4, bytes: 600, schemaBytes: 192 * 1024, candidateBytes: 64 * 1024 } as const;
const object = (value: unknown): value is Shape => value !== null && typeof value === 'object' && !Array.isArray(value);
const types = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'] as const;
const encoder = new TextEncoder();

/** The only reported text consists of grammar property names and a fixed error
 * vocabulary. Never copy Zod messages, candidate values, enum values, unknown
 * object keys, descriptions or custom refinement prose into model feedback. */
export function structuralValidationFeedback(issuedSchema: unknown, candidate: unknown): StructuralFeedback | null {
  try {
    if (!object(issuedSchema) || encoder.encode(JSON.stringify(issuedSchema)).length > STRUCTURAL_FEEDBACK_LIMITS.schemaBytes
      || encoder.encode(JSON.stringify(candidate)).length > STRUCTURAL_FEEDBACK_LIMITS.candidateBytes) return null;
    const parsed = z.fromJSONSchema(issuedSchema).safeParse(candidate);
    if (parsed.success) return null;
    let visits = 0;
    const spend = () => { if (++visits > 4096) throw new RangeError('Feedback traversal bound'); };
    const dereference = (shape: Shape): Shape | null => {
      if (!Object.hasOwn(shape, '$ref')) return shape;
      if (typeof shape.$ref !== 'string' || !shape.$ref.startsWith('#/')) return null;
      let value: unknown = issuedSchema;
      for (const component of shape.$ref.slice(2).split('/')) {
        const key = component.replace(/~1/g, '/').replace(/~0/g, '~');
        if (!object(value) || !Object.hasOwn(value, key)) return null;
        value = value[key];
      }
      return object(value) ? value : null;
    };
    const schemasAt = (path: PropertyKey[]): Shape[] => {
      const found: Shape[] = [], seen = new WeakMap<object, Set<number>>();
      const walk = (input: unknown, depth: number) => {
        spend();
        if (!object(input)) return;
        const depths = seen.get(input) ?? new Set<number>();
        if (depths.has(depth)) return;
        depths.add(depth); seen.set(input, depths);
        const shape = dereference(input);
        if (!shape) return;
        if (shape !== input) { walk(shape, depth); return; }
        if (depth === path.length) found.push(shape);
        else {
          const key = path[depth];
          if (typeof key === 'number' && Number.isSafeInteger(key) && key >= 0 && key < 64) {
            if (Array.isArray(shape.prefixItems) && key < shape.prefixItems.length) walk(shape.prefixItems[key], depth + 1);
            else walk(shape.items, depth + 1);
          } else if (typeof key === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key)
            && object(shape.properties) && Object.hasOwn(shape.properties, key)) walk(shape.properties[key], depth + 1);
        }
        for (const union of ['anyOf', 'oneOf', 'allOf'])
          if (Array.isArray(shape[union])) for (const branch of shape[union]) walk(branch, depth);
      };
      walk(issuedSchema, 0); return found;
    };
    const valueAt = (path: PropertyKey[]): { present: boolean; value?: unknown } => {
      let value = candidate;
      for (const key of path) {
        if ((!object(value) && !Array.isArray(value)) || typeof key === 'symbol' || !Object.hasOwn(value, key)) return { present: false };
        value = (value as Record<PropertyKey, unknown>)[key];
      }
      return { present: true, value };
    };
    const normalized = (issue: Issue): StructuralFeedbackIssue | null => {
      spend();
      if (issue.path.length > 6 || issue.path.some(key => typeof key === 'symbol')) return null;
      const schemas = schemasAt(issue.path);
      if (!schemas.length) return null; // Unknown/injected property names are never reflected.
      const field = issue.path.reduce<string>((text, key) => typeof key === 'number' ? `${text}[${key}]`
        : `${text}${text ? '.' : ''}${String(key)}`, '') || '$';
      if (field.length > 100) return null;
      if (issue.code === 'too_big' || issue.code === 'too_small') {
        const big = issue.code === 'too_big', limit = big ? issue.maximum : issue.minimum;
        if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0 || limit > 1_000_000) return null;
        const error = issue.origin === 'string' ? big ? 'maxLength' : 'minLength'
          : issue.origin === 'array' ? big ? 'maxItems' : 'minItems'
          : issue.origin === 'number' ? big ? 'maximum' : 'minimum' : null;
        return error ? { field, error, limit } : null;
      }
      if (issue.code === 'invalid_type') {
        if (!(types as readonly string[]).includes(issue.expected ?? '')) return null;
        return { field, error: valueAt(issue.path).present ? 'type' : 'required', expected: issue.expected as typeof types[number] };
      }
      if (issue.code === 'invalid_value') {
        // Dynamic IDs often use enum without type. Report the primitive type
        // only when every offered enum value has that type, never the values.
        const actual = valueAt(issue.path), values = issue.values;
        const expected = values?.length && values.every(value => typeof value === 'string') ? 'string' : undefined;
        return expected && actual.present && typeof actual.value !== expected ? { field, error: 'type', expected }
          : { field, error: 'enum' };
      }
      if (issue.code === 'unrecognized_keys') return { field, error: 'additionalProperties' };
      return null;
    };
    const keyOf = (issue: StructuralFeedbackIssue) => JSON.stringify(issue);
    const unique = (issues: StructuralFeedbackIssue[]) => [...new Map(issues.map(issue => [keyOf(issue), issue])).values()];
    const branchImpossible = (issues: Issue[], prefix: PropertyKey[]): boolean => issues.some(issue => {
      spend();
      const discriminator = issue.path.at(-1);
      if (issue.code !== 'invalid_value' || !['kind', 'mode', 'choice', 'audience', 'visibility'].includes(String(discriminator))) return false;
      const supplied = valueAt([...prefix, ...issue.path]);
      return supplied.present && Array.isArray(issue.values) && !issue.values.includes(supplied.value);
    });
    const excludedKeys = (issues: Issue[], prefix: PropertyKey[]) => new Set(issues.flatMap(issue => {
      spend();
      return issue.code === 'unrecognized_keys' && Array.isArray(issue.keys)
        ? issue.keys.map(key => JSON.stringify([...prefix, ...issue.path, key])) : [];
    }));
    const collect = (issues: Issue[], prefix: PropertyKey[] = []): StructuralFeedbackIssue[] => unique(issues.flatMap(original => {
      spend();
      // Zod union branch paths are relative to the union's own path.
      const issue = { ...original, path: [...prefix, ...original.path] };
      if (issue.code !== 'invalid_union' || !Array.isArray(issue.errors)) {
        const entry = normalized(issue); return entry ? [entry] : [];
      }
      const possible = issue.errors.filter(branch => !branchImpossible(branch, issue.path));
      const excluded = possible.map(branch => excludedKeys(branch, issue.path));
      // Prefer a branch that accepts all the supplied property names over one
      // requiring additional removals (e.g. P7 lookup-only vs a message). This
      // is strict set containment, not a guessed score or inferred intention.
      const viable = possible.filter((_, i) => !excluded.some((other, j) => j !== i && other.size < excluded[i]!.size
        && [...other].every(key => excluded[i]!.has(key))));
      if (!viable.length) return [];
      // Never suggest fixing requirements of an alternative operation. Only
      // report errors common to every still-possible branch, not a scored guess.
      const branches = viable.map(branch => collect(branch, issue.path)), rest = branches.slice(1).map(branch => new Set(branch.map(keyOf)));
      return branches[0]!.filter(entry => rest.every(branch => branch.has(keyOf(entry))));
    }));
    const all = collect(parsed.error.issues as Issue[]).sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    if (!all.length) return null;
    const result: StructuralFeedback = { issues: all.slice(0, STRUCTURAL_FEEDBACK_LIMITS.issues), omitted: all.length > STRUCTURAL_FEEDBACK_LIMITS.issues };
    while (result.issues.length && encoder.encode(JSON.stringify(result)).length > STRUCTURAL_FEEDBACK_LIMITS.bytes) {
      result.issues.pop(); result.omitted = true;
    }
    return result.issues.length ? result : null;
  } catch { return null; } // Optional feedback never changes acceptance or accounting.
}
