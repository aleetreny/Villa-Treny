import { isArchivedSpeech, type ArchivedSpeech } from './archive-message';
import { isPublicRecordsView } from './public-records';
import type { PublicRecordPublication } from './society/record-types';
// The public edge of the habitat.
//
// A network response is untrusted even when it came from our own Worker. Keep
// that uncertainty here so every component beyond this file continues to read a
// complete HabitatSnapshot, exactly as it did when Genesis was the only source.

import { ROOM_BY_ID, ROOMS, type RoomId } from './rooms';
import { RESIDENTS, type ResidentId } from './residents';
import { isWalkable } from './grid';
import { AXES, type Edge } from './weave';
import { isSocietySnapshot, type SocietySnapshot } from './society';
import { isAgencySnapshot, isCognitionStatus, type AgencySnapshot, type CognitionStatus } from './agency';
import type {
  HabitatSnapshot,
  PersonState,
  RecordEntry,
  RoomState,
} from './snapshot';

const ROOM_IDS: ReadonlySet<string> = new Set(ROOMS.map((room) => room.id));
const RESIDENT_IDS: ReadonlySet<string> = new Set(RESIDENTS.map((resident) => resident.id));

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isRoomId(value: unknown): value is RoomId {
  return typeof value === 'string' && ROOM_IDS.has(value);
}

function isResidentId(value: unknown): value is ResidentId {
  return typeof value === 'string' && RESIDENT_IDS.has(value);
}

function hasUniqueKnownIds(values: readonly unknown[], known: ReadonlySet<string>): boolean {
  return values.every((value) => typeof value === 'string' && known.has(value))
    && new Set(values).size === values.length;
}

function isRoomState(value: unknown): value is RoomState {
  if (!isObject(value) || !hasExactly(value, ['id', 'occupants', 'lit'])) return false;
  return isRoomId(value.id)
    && Array.isArray(value.occupants)
    && hasUniqueKnownIds(value.occupants, RESIDENT_IDS)
    && typeof value.lit === 'boolean';
}

function isPersonState(value: unknown): value is PersonState {
  if (!isObject(value) || !hasExactly(value, ['id', 'room', 'at', 'doing'])) return false;
  if (!isResidentId(value.id) || !isRoomId(value.room) || typeof value.doing !== 'string') {
    return false;
  }
  if (value.doing.trim().length === 0 || !isObject(value.at) || !hasExactly(value.at, ['x', 'y'])) {
    return false;
  }
  const { x, y } = value.at;
  if (!Number.isInteger(x) || !Number.isInteger(y) || (x as number) < 0 || (y as number) < 0) {
    return false;
  }
  const room = ROOM_BY_ID[value.room];
  return isWalkable(room.grid, room.legend, x as number, y as number);
}

function isRecordEntry(value: unknown): value is RecordEntry {
  if (!isObject(value) || !hasExactly(value, ['minute', 'room', 'who', 'text'])) return false;
  return Number.isInteger(value.minute)
    && (value.minute as number) >= 0
    && (value.minute as number) < 24 * 60
    && isRoomId(value.room)
    && Array.isArray(value.who)
    && hasUniqueKnownIds(value.who, RESIDENT_IDS)
    && typeof value.text === 'string'
    && value.text.trim().length > 0;
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

/** Accept only a complete, internally coherent snapshot of the canonical world. */
export function isHabitatSnapshot(value: unknown): value is HabitatSnapshot {
  if (!isObject(value) || !hasExactly(value, ['day', 'watch', 'power', 'rooms', 'people', 'record'])) {
    return false;
  }
  if (!Number.isInteger(value.day) || (value.day as number) < 0) return false;
  if (value.watch !== 1 && value.watch !== 2 && value.watch !== 3 && value.watch !== 4) return false;
  if (typeof value.power !== 'number' || !Number.isFinite(value.power)
    || value.power < 0 || value.power > 1) return false;
  if (!Array.isArray(value.rooms) || value.rooms.length !== ROOMS.length
    || !value.rooms.every(isRoomState)) return false;
  if (!Array.isArray(value.people) || value.people.length !== RESIDENTS.length
    || !value.people.every(isPersonState)) return false;
  if (!Array.isArray(value.record) || !value.record.every(isRecordEntry)) return false;

  const snapshot = value as unknown as HabitatSnapshot;
  if (!hasUniqueKnownIds(snapshot.rooms.map((room) => room.id), ROOM_IDS)) return false;
  if (!hasUniqueKnownIds(snapshot.people.map((person) => person.id), RESIDENT_IDS)) return false;
  // body.at is a logical, walkable anchor; visual capacity belongs to the observer.
  // Several residents may share it without making their saved world invalid.
  for (const room of snapshot.rooms) {
    const present = snapshot.people
      .filter((person) => person.room === room.id)
      .map((person) => person.id);
    if (!sameMembers(room.occupants, present)) return false;
  }
  for (let index = 1; index < snapshot.record.length; index += 1) {
    if (snapshot.record[index]!.minute < snapshot.record[index - 1]!.minute) return false;
  }
  return true;
}

export type HabitatFetchOptions = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
};

/** Fetch once. A failure is represented as null so the caller can keep Genesis. */
export async function fetchHabitatSnapshot(
  runtimeUrl: string,
  options: HabitatFetchOptions = {},
): Promise<HabitatSnapshot | null> {
  if (!runtimeUrl) return null;

  try {
    const endpoint = new URL('/v1/snapshot', runtimeUrl);
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
      signal: options.signal,
    });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return isHabitatSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

export type ObserverState = {
  worldRevision: number;
  snapshot: HabitatSnapshot;
  relationships: readonly Edge[];
  society?: SocietySnapshot;
  agency?: AgencySnapshot;
};

export type ArchiveEntry = RecordEntry & {
  day: number;
  watch: number;
  kind: 'work' | 'need' | 'meeting' | 'power' | 'note';
  /** Original historical room name; the canonical `room` is its present alias. */
  sourceRoom?: string;
  /** Provenance of a recorded society utterance; not verification of its content. */
  speech?: ArchivedSpeech;
};

export type RuntimeStatus = {
  mode: 'running' | 'paused';
  health: 'healthy' | 'degraded';
  pauseReason: string | null;
  lastErrorCode?: string | null;
  lastSuccessfulWatchAtMs?: number | null;
  overdueByMs?: number;
  worldRevision: number;
  residentCapacity: number;
  simTime: { day: number; minute: number };
  nextWatchAtMs: number | null;
  lastRun: { runId: string; committedAtMs: number } | null;
  cognition?: CognitionStatus;
  providers: {
    recentAttempts: Array<{
      provider: string; ok: boolean; kind?: string; detailCode?: string | null;
      recordedAtMs: number;
    }>;
  };
};

export function isObserverState(value: unknown): value is ObserverState {
  if (!isObject(value) || !hasExactly(value, ['worldRevision', 'snapshot', 'relationships', ...(Object.hasOwn(value, 'society') ? ['society'] : []), ...(Object.hasOwn(value, 'agency') ? ['agency'] : [])])
    || !Number.isInteger(value.worldRevision) || (value.worldRevision as number) < 0
    || !isHabitatSnapshot(value.snapshot) || !Array.isArray(value.relationships)
    || value.relationships.length !== RESIDENTS.length * (RESIDENTS.length - 1)
    || (Object.hasOwn(value, 'society') && !isSocietySnapshot(value.society))
    || (Object.hasOwn(value, 'agency') && !isAgencySnapshot(value.agency))) return false;
  const pairs = new Set<string>();
  return value.relationships.every((edge: unknown) => {
    if (!isObject(edge) || !hasExactly(edge, ['from', 'to', 'axes', 'bonded', 'latent'])
      || !isResidentId(edge.from) || !isResidentId(edge.to) || edge.from === edge.to
      || !isObject(edge.axes) || !hasExactly(edge.axes, AXES)
      || typeof edge.bonded !== 'boolean' || typeof edge.latent !== 'boolean') return false;
    const pair = `${edge.from}${edge.to}`;
    if (pairs.has(pair)) return false;
    pairs.add(pair);
    const axes = edge.axes;
    return AXES.every((axis) => typeof axes[axis] === 'number'
      && Number.isFinite(axes[axis]) && axes[axis] >= 0 && axes[axis] <= 100);
  });
}

function isRuntimeStatus(value: unknown): value is RuntimeStatus {
  return isObject(value) && (value.mode === 'running' || value.mode === 'paused')
    && (value.health === 'healthy' || value.health === 'degraded')
    && (value.pauseReason === null || typeof value.pauseReason === 'string')
    && (value.lastErrorCode === undefined || value.lastErrorCode === null || typeof value.lastErrorCode === 'string')
    && (value.lastSuccessfulWatchAtMs === undefined || value.lastSuccessfulWatchAtMs === null || (typeof value.lastSuccessfulWatchAtMs === 'number' && Number.isFinite(value.lastSuccessfulWatchAtMs)))
    && (value.overdueByMs === undefined || (typeof value.overdueByMs === 'number' && Number.isFinite(value.overdueByMs) && value.overdueByMs >= 0))
    && Number.isInteger(value.worldRevision) && (value.worldRevision as number) >= 0
    && value.residentCapacity === RESIDENTS.length
    && isObject(value.simTime) && Number.isInteger(value.simTime.day)
    && Number.isInteger(value.simTime.minute)
    && (value.nextWatchAtMs === null || typeof value.nextWatchAtMs === 'number')
    && (value.lastRun === null || (isObject(value.lastRun)
      && typeof value.lastRun.runId === 'string' && typeof value.lastRun.committedAtMs === 'number'))
    && (value.cognition === undefined || isCognitionStatus(value.cognition))
    && isObject(value.providers) && Array.isArray(value.providers.recentAttempts)
    && value.providers.recentAttempts.every((attempt: unknown) => isObject(attempt)
      && typeof attempt.provider === 'string' && typeof attempt.ok === 'boolean'
      && typeof attempt.recordedAtMs === 'number');
}

/** Preserve an explicit proxy prefix, unlike the legacy origin-only snapshot API. */
export function habitatEndpoint(base: string, path: string): URL {
  return new URL(path.replace(/^\//, ''), `${base.replace(/\/$/, '')}/`);
}

async function publicRead(base: string, path: string, options: HabitatFetchOptions): Promise<unknown> {
  const result = await (options.fetcher ?? fetch)(habitatEndpoint(base, path), {
    method: 'GET', headers: { accept: 'application/json' }, credentials: 'omit', signal: options.signal,
  });
  if (!result.ok) throw new Error(`The habitat is not responding (${result.status}).`);
  return result.json() as Promise<unknown>;
}

export type RecordArchivePage = { entries: PublicRecordPublication[]; nextCursor: number | null };

/** Optional archive pages are requested by the observer, never by its polling
 * clock. The archive contains only publications explicitly made public. */
export async function fetchHabitatRecords(base: string,
  options: HabitatFetchOptions & { before?: number; limit?: number } = {}): Promise<RecordArchivePage> {
  const limit = options.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 40
    || (options.before !== undefined && (!Number.isSafeInteger(options.before) || options.before < 1))) throw new RangeError('Invalid written-record page');
  const value = await publicRead(base, `/v1/records?limit=${limit}${options.before === undefined ? '' : `&before=${options.before}`}`, options);
  if (!isObject(value) || !hasExactly(value, ['entries', 'nextCursor'])
    || !Array.isArray(value.entries) || value.entries.length > limit
    || !isPublicRecordsView({ publications: value.entries, offers: [], agreements: [] })
    || !(value.nextCursor === null || (typeof value.nextCursor === 'number' && Number.isSafeInteger(value.nextCursor)
      && value.nextCursor > 0 && (options.before === undefined || value.nextCursor < options.before)))) {
    throw new Error('The writing archive could not be read.');
  }
  return value as RecordArchivePage;
}

export async function fetchHabitatObserver(base: string, options: HabitatFetchOptions = {}): Promise<ObserverState> {
  const value = await publicRead(base, '/v1/observer', options);
  if (!isObserverState(value)) throw new Error('The received habitat state is incomplete.');
  return value;
}

export type ObserverUpdate =
  | { unchanged: true; etag: string | null }
  | { unchanged: false; etag: string | null; world: ObserverState };

/** Conditional reads keep a large unchanged world out of the poll response. */
export async function fetchHabitatObserverUpdate(
  base: string, options: HabitatFetchOptions & { etag?: string | null } = {},
): Promise<ObserverUpdate> {
  const result = await (options.fetcher ?? fetch)(habitatEndpoint(base, '/v1/observer'), {
    method: 'GET', headers: { accept: 'application/json', ...(options.etag ? { 'if-none-match': options.etag } : {}) },
    credentials: 'omit', signal: options.signal,
  });
  if (result.status === 304 && options.etag) return { unchanged: true, etag: result.headers.get('etag') ?? options.etag };
  if (!result.ok) throw new Error(`The habitat is not responding (${result.status}).`);
  const value: unknown = await result.json();
  if (!isObserverState(value)) throw new Error('The received habitat state is incomplete.');
  return { unchanged: false, etag: result.headers.get('etag'), world: value };
}

export async function fetchHabitatStatus(base: string, options: HabitatFetchOptions = {}): Promise<RuntimeStatus> {
  const value = await publicRead(base, '/v1/status', options);
  if (!isRuntimeStatus(value)) throw new Error('The habitat clock could not be checked.');
  return value;
}

export async function fetchHabitatArchive(
  base: string, day: number, options: HabitatFetchOptions = {},
): Promise<ArchiveEntry[]> {
  if (!Number.isInteger(day) || day < 100) throw new RangeError('Invalid archive day');
  const value = await publicRead(base, `/v1/archive?day=${day}`, options);
  if (!isObject(value) || value.day !== day || !Array.isArray(value.entries)
    || !value.entries.every((entry: unknown) => isObject(entry)
      && isRecordEntry({ minute: entry.minute, room: entry.room, who: entry.who, text: entry.text })
      && entry.day === day && Number.isInteger(entry.watch) && (entry.watch as number) >= 1
      && (entry.watch as number) <= 4
      && ['work', 'need', 'meeting', 'power', 'note'].includes(entry.kind as string)
      && (entry.sourceRoom === undefined || typeof entry.sourceRoom === 'string')
      && (entry.speech === undefined || isArchivedSpeech(entry.speech, entry as ArchiveEntry)))) {
    throw new Error('The journal for that day could not be read.');
  }
  return value.entries as ArchiveEntry[];
}

/** Browsers expose transport failures as implementation-specific messages. */
export function habitatReadError(reason: unknown, subject: 'world' | 'journal'): string {
  const fallback = subject === 'journal' ? 'The journal could not be read. Check the connection and try again.' : 'The habitat could not be reached. Check the connection and try again.';
  if (!(reason instanceof Error)) return fallback;
  if (reason.name === 'TimeoutError' || reason.name === 'AbortError') return subject === 'journal'
    ? 'Reading the journal timed out. Try again.' : 'Reading the habitat timed out. Try again.';
  if (/fetch|network|load failed/i.test(reason.message)) return fallback;
  return reason.message;
}
