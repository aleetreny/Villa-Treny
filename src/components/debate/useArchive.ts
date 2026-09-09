import { useEffect, useRef, useState } from 'react';
import { loadArchive, type ArchiveQuery } from '../../lib/debate/client';
import type { DebateArchive } from '../../lib/debate/contracts';

export function useArchive(query?: ArchiveQuery, live = true, enabled = true) {
  const queryKey = JSON.stringify(query ?? {});
  const [data, setData] = useState<DebateArchive | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let controller: AbortController | null = null;
    let active = true;
    let loaded = false;
    const refresh = async () => {
      if (document.hidden) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const value = await loadArchive(JSON.parse(queryKey) as ArchiveQuery, request.signal);
        if (!active || request.signal.aborted) return;
        loaded = true;
        setData(value);
        setError('');
      } catch (e) {
        if (active && !request.signal.aborted) {
          setError(e instanceof Error ? e.message : 'The archive could not be reached.');
        }
      }
    };
    void refresh();
    const timer = live ? setInterval(() => void refresh(), 60_000) : undefined;
    // Initial loads skipped in a background tab must also resume for static archives.
    const visible = () => { if (!document.hidden && (live || !loaded)) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      controller?.abort();
      pageRequest.current?.abort();
      pageRequest.current = null;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [revision, queryKey, live, enabled]);

  const more = async () => {
    if (!data?.nextCursor || pageRequest.current) return;
    const request = new AbortController();
    pageRequest.current = request;
    setLoadingMore(true);
    try {
      const value = await loadArchive({
        ...query, before: data.nextCursor,
        ...(data.nextScore != null ? { score: data.nextScore } : {}),
      }, request.signal);
      if (request.signal.aborted) return;
      setData(old => old ? {
        ...old,
        entries: [...old.entries, ...value.entries.filter(e => !old.entries.some(x => x.id === e.id))],
        nextCursor: value.nextCursor, nextScore: value.nextScore,
      } : value);
      setError('');
    } catch (e) {
      if (!request.signal.aborted) setError(e instanceof Error ? e.message : 'The archive could not be reached.');
    } finally {
      if (pageRequest.current === request) {
        pageRequest.current = null;
        setLoadingMore(false);
      }
    }
  };
  return { data, error, retry: () => setRevision(v => v + 1), more, loadingMore };
}
