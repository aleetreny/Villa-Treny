type Shape = Record<string, unknown>;
const object = (value: unknown): value is Shape => value !== null && typeof value === 'object' && !Array.isArray(value);
const target = (value: Shape): string | undefined => typeof value.$ref === 'string' && value.$ref.startsWith('#/$defs/')
  ? value.$ref.slice(8) : undefined;

/** Optimize storage of an already factored, acyclic local schema. Factoring a
 * parent can make previously profitable child definitions single-use. Inline
 * those aliases again, then give retained references short stable names. No
 * validation constraint, enum value, required field or array order changes. */
export function compactSchemaReferences(schema: Shape): Shape {
  let current = structuredClone(schema);
  for (;;) {
    const definitions = object(current.$defs) ? current.$defs : {};
    const reachable = new Set<string>(), visiting = new Set<string>(), counts = new Map<string, number>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (!object(value)) return;
      const name = target(value);
      if (name) {
        if (Object.keys(value).length !== 1) throw new RangeError('Schema reference siblings are unsupported');
        if (!object(definitions[name])) throw new RangeError('Unknown schema definition');
        if (visiting.has(name)) throw new RangeError('Recursive schema definition');
        counts.set(name, (counts.get(name) ?? 0) + 1);
        if (!reachable.has(name)) {
          reachable.add(name); visiting.add(name); walk(definitions[name]); visiting.delete(name);
        }
      }
      for (const [key, child] of Object.entries(value)) if (key !== '$defs') walk(child);
    };
    walk(current);
    const inline = new Set([...reachable].filter(name => counts.get(name) === 1
      || (object(definitions[name]) && Object.keys(definitions[name]).length === 1 && target(definitions[name]) !== undefined)));
    const rewrite = (value: unknown, visiting = new Set<string>()): unknown => {
      if (Array.isArray(value)) return value.map(child => rewrite(child, visiting));
      if (!object(value)) return value;
      const name = target(value);
      if (name && inline.has(name)) {
        if (visiting.has(name)) throw new RangeError('Recursive schema definition');
        return rewrite(definitions[name], new Set([...visiting, name]));
      }
      return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$defs')
        .map(([key, child]) => [key, rewrite(child, visiting)]));
    };
    current = { ...rewrite(current) as Shape, $defs: Object.fromEntries([...reachable]
      .filter(name => !inline.has(name)).map(name => [name, rewrite(definitions[name])])) };
    if (inline.size === 0) break;
  }
  const definitions = current.$defs as Shape;
  const names = new Map(Object.keys(definitions).map((name, i) => [name, `s${i}`]));
  const rename = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rename);
    if (!object(value)) return value;
    const name = target(value);
    if (name) {
      const replacement = names.get(name);
      if (!replacement) throw new RangeError('Unknown compact schema definition');
      return { ...value, $ref: `#/$defs/${replacement}` };
    }
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$defs').map(([key, child]) => [key, rename(child)]));
  };
  return { ...rename(current) as Shape,
    $defs: Object.fromEntries(Object.entries(definitions).map(([name, body]) => [names.get(name)!, rename(body)])) };
}
