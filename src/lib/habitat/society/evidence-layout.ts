/** Experimental model-input presentation. This module does not select a plan,
 * add an observation, change document access or apply an economic operation.
 * The canonical prepared turn remains the authority for schema and execution.
 */
type ObjectValue = Record<string, unknown>;
const VERSION = 'evidence-first-v1';
const SOURCE = '_evidenceSource';
const object = (value: unknown): value is ObjectValue => value !== null
  && typeof value === 'object' && !Array.isArray(value);
const own = (value: ObjectValue, key: string) => Object.hasOwn(value, key);

function splitPrompt(prompt: string): { prefix: string; context: ObjectValue } {
  const index = prompt.trimStart().startsWith('{') ? 0 : prompt.lastIndexOf('\n{') + 1;
  if (index === 0 && !prompt.trimStart().startsWith('{'))
    throw new RangeError('Missing prepared information');
  const value: unknown = JSON.parse(prompt.slice(index));
  if (!object(value)) throw new RangeError('Expected a prepared JSON object');
  return { prefix: prompt.slice(0, index), context: value };
}

function tagged(value: unknown, source: string, restore: boolean): ObjectValue {
  if (!object(value)) throw new RangeError('Invalid evidence source object');
  if (restore ? value[SOURCE] !== source : own(value, SOURCE))
    throw new RangeError('Invalid evidence source marker');
  if (restore) {
    const { [SOURCE]: _marker, ...rest } = value;
    void _marker;
    return rest;
  }
  return { [SOURCE]: source, ...value };
}

function projectSources(context: ObjectValue, restore: boolean): ObjectValue {
  const next = { ...context };
  for (const [key, source] of [
    ['public', 'current_world_state'],
    ['ownProject', 'personal_plan'],
    ['conversation', 'reported_speech'],
    ['receivedClosure', 'reported_speech'],
  ] as const) {
    if (own(next, key) && next[key] !== null) next[key] = tagged(next[key], source, restore);
  }
  if (own(next, 'ownHistory')) {
    if (!Array.isArray(next.ownHistory)) throw new RangeError('Invalid personal history');
    next.ownHistory = next.ownHistory.map(event => tagged(event, 'recorded_personal_event', restore));
  }
  if (own(next, 'records')) {
    if (!object(next.records) || !Array.isArray(next.records.drafts))
      throw new RangeError('Invalid prepared records');
    next.records = { ...next.records,
      drafts: next.records.drafts.map(draft => tagged(draft, 'authored_text', restore)) };
  }
  return next;
}

/** Facts and permissions precede speech. All original fields, array order,
 * strings, IDs, omissions and reference grants survive unchanged. Markers name
 * provenance, not truth: authored text and reported speech remain claims; a
 * recorded personal event does not certify every proposition it might quote.
 */
export function renderSocietyEvidenceLayout(prompt: string): string {
  const { prefix, context: original } = splitPrompt(prompt);
  if (own(original, '_evidenceLayout')) throw new RangeError('Evidence layout already present');
  const context = projectSources(original, false);
  const tail = ['receivedClosure', 'conversation'];
  const first = ['self', 'public', 'ownHistory', 'ownProject', 'openOffers', 'commitments',
    'receivables', 'records', 'affordances', 'ownKnowledge', 'sharedHistory', 'ownFeelings',
    'memories', 'refIds', 'omitted'];
  const keys = [...new Set([...first, ...Object.keys(context).filter(key => !tail.includes(key)), ...tail])]
    .filter(key => own(context, key));
  return prefix + JSON.stringify({ _evidenceLayout: VERSION,
    ...Object.fromEntries(keys.map(key => [key, context[key]])) });
}

/** Inverse for auditing the information boundary. Object key order is
 * presentation; array order and every original value remain significant.
 */
export function restoreSocietyEvidenceLayout(rendered: string): string {
  const { prefix, context: value } = splitPrompt(rendered);
  if (value._evidenceLayout !== VERSION) throw new RangeError('Unknown evidence layout');
  const { _evidenceLayout: _version, ...context } = value;
  void _version;
  return prefix + JSON.stringify(projectSources(context, true));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function verifySocietyEvidenceLayout(original: string, rendered: string): boolean {
  try {
    const source = splitPrompt(original), restored = splitPrompt(restoreSocietyEvidenceLayout(rendered));
    return rendered === renderSocietyEvidenceLayout(original)
      && source.prefix === restored.prefix && canonical(source.context) === canonical(restored.context);
  } catch {
    return false;
  }
}
