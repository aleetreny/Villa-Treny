import { RESIDENT_BY_ID, type ResidentId } from './residents';

export type ArchivedSpeech = { speaker: ResidentId; turnId: string };
type SpeechEntry = { kind: string; text: string; who: readonly ResidentId[] };

/** Read-only provenance from the actual identifier assigned when a society
 * turn is archived. A quotation or a money claim alone never identifies speech.
 * The saved happening, its ID and all historical bytes remain unchanged. */
export function archivedSpeech(habitatId: string, happeningId: string, entry: SpeechEntry): ArchivedSpeech | undefined {
  const prefix = `${habitatId}:mind:`;
  if (!habitatId || !happeningId.startsWith(prefix) || entry.kind !== 'meeting') return undefined;
  const match = /^([A-Y]):(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*):g:(?:0|[1-9][0-9]*):(turn:(?:0|[1-9][0-9]*))$/.exec(happeningId.slice(prefix.length));
  if (!match || entry.who.length !== 2 || entry.who[0] === entry.who[1]) return undefined;
  const speaker = match[1] as ResidentId;
  if (!entry.who.includes(speaker) || !entry.text.startsWith(`${speaker}: `) || entry.text.length <= 3) return undefined;
  return { speaker, turnId: match[2]! };
}

/** Public metadata is validated with the containing entry rather than trusted
 * as an instruction to relabel an unrelated event. Older APIs may omit it. */
export function isArchivedSpeech(value: unknown, entry: SpeechEntry): value is ArchivedSpeech {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Object.keys(candidate).length === 2 && typeof candidate.speaker === 'string'
    && Object.hasOwn(RESIDENT_BY_ID, candidate.speaker) && typeof candidate.turnId === 'string'
    && /^turn:(?:0|[1-9][0-9]*)$/.test(candidate.turnId) && entry.kind === 'meeting'
    && entry.who.length === 2 && entry.who[0] !== entry.who[1]
    && entry.who.includes(candidate.speaker as ResidentId)
    && entry.text.startsWith(`${candidate.speaker}: `) && entry.text.length > 3;
}
