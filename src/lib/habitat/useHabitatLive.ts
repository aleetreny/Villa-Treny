import { useCallback, useEffect, useRef, useState } from 'react';
import { runtimeConfig } from '../config';
import {
  fetchHabitatArchive, fetchHabitatObserverUpdate, fetchHabitatStatus, habitatReadError,
  type ArchiveEntry, type ObserverState, type RuntimeStatus,
} from './live';

const PUBLIC_RUNTIME = 'https://aleetreny-habitat-runtime.alejandrotreny100.workers.dev';
const POLL_MS = 45_000;
type Connection = 'connecting' | 'live' | 'stale' | 'offline';

/** Reads only: opening the observer never advances the world or invokes a model. */
export function useHabitatLive() {
  const base = import.meta.env.DEV
    ? `${window.location.origin}/__habitat` : runtimeConfig.habitatRuntimeUrl || PUBLIC_RUNTIME;
  const [world, setWorld] = useState<ObserverState | null>(null);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [lastConnectedAt, setLastConnectedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshId, setRefreshId] = useState(0);
  const connected = useRef(false);
  const etag = useRef<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const archiveDay = selectedDay ?? world?.snapshot.day ?? 100;
  const [archiveResult, setArchiveResult] = useState<{ day: number; entries: ArchiveEntry[] } | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const refresh = useCallback(() => setRefreshId((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    const read = async () => {
      if (fetching || document.hidden) return;
      fetching = true;
      const deadline = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
      // Auxiliary clock failure must never discard a successfully read world.
      const observer = fetchHabitatObserverUpdate(base, { signal: deadline, etag: etag.current }).then((update) => {
        if (controller.signal.aborted) return;
        etag.current = update.etag;
        if (!update.unchanged) setWorld((previous) => !previous || update.world.worldRevision >= previous.worldRevision ? update.world : previous);
        connected.current = true;
        setLastConnectedAt(Date.now());
        setConnection('live');
        setError(null);
      }).catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setConnection(connected.current ? 'stale' : 'offline');
        setError(habitatReadError(reason, 'world'));
      });
      const clock = fetchHabitatStatus(base, { signal: deadline }).then((next) => {
        if (controller.signal.aborted) return;
        setStatus(next);
        setStatusError(null);
      }).catch(() => {
        if (controller.signal.aborted) return;
        setStatus(null);
        setStatusError('The world clock could not be checked.');
      });
      await Promise.all([observer, clock]);
      fetching = false;
    };
    const interval = window.setInterval(() => { void read(); }, POLL_MS);
    const visible = () => { if (!document.hidden) void read(); };
    document.addEventListener('visibilitychange', visible);
    void read();
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [base, refreshId]);

  const revision = world?.worldRevision;
  useEffect(() => {
    if (revision === undefined) return;
    const controller = new AbortController();
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setArchiveLoading(true);
      setArchiveError(null);
      try {
        const entries = await fetchHabitatArchive(base, archiveDay, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (active) setArchiveResult({ day: archiveDay, entries });
      } catch (reason) {
        if (active) setArchiveError(habitatReadError(reason, 'journal'));
      } finally {
        if (active) setArchiveLoading(false);
      }
    });
    return () => { active = false; controller.abort(); };
  }, [base, archiveDay, revision, refreshId]);

  const currentDay = world?.snapshot.day ?? 100;
  const setArchiveDay = useCallback((day: number) => {
    setSelectedDay(day === currentDay ? null : Math.max(100, Math.min(currentDay, day)));
  }, [currentDay]);

  return {
    base,
    snapshot: world?.snapshot ?? null, relationships: world?.relationships ?? [], society: world?.society ?? null, agency: world?.agency ?? null,
    status, statusError, connection, lastConnectedAt, error, refresh, archiveDay, setArchiveDay,
    archive: archiveResult?.day === archiveDay ? archiveResult.entries : [],
    archiveLoading, archiveError,
  };
}
