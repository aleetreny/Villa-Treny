import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';
import { labDaySchema, labHistorySchema, labOverviewSchema, type LabDay, type LabExperiment, type LabHistory, type LabOverview, type LabRun } from './contracts';

/** Read-only Lab client. Every request reads stored results; none can start inference. */
const base = import.meta.env.DEV ? '/__habitat/v1/lab' : '/v1/lab';
export class LabError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const deadline = AbortSignal.timeout(15_000);
  const response = await fetch(base + path, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline, credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (!response.ok) throw new LabError(response.status === 400 ? 'That date or experiment is not in the Lab.' : 'The Lab could not be reached. Please try again.', response.status);
  try { return schema.parse(await response.json()); } catch { throw new LabError('The Lab returned an unreadable response. Please try again.', 502); }
}
export const loadOverview = (signal?: AbortSignal) => get('', labOverviewSchema, signal);
export const loadHistory = (experiment: LabExperiment, signal?: AbortSignal) => get('/' + experiment, labHistorySchema, signal);
export const loadLabDay = (experiment: LabExperiment, date: string, signal?: AbortSignal) => get('/' + experiment + '/' + encodeURIComponent(date), labDaySchema, signal);

export type Loaded<T> = { data: T | null; error: string; retry: () => void };
function useLoad<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, refreshMs = 0): Loaded<T> {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string }>({ key: null, data: null, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!key) return;
    let controller = new AbortController();
    const run = () => { controller.abort(); controller = new AbortController(); const signal = controller.signal;
      load(signal).then(data => { if (!signal.aborted) setState({ key, data, error: '' }); })
        .catch(e => { if (!signal.aborted) setState(old => ({ key, data: old.key === key ? old.data : null, error: e instanceof Error ? e.message : 'The Lab could not be reached.' })); }); };
    run();
    // Optional polling of stored state while results are pending; never triggers inference.
    const timer = refreshMs ? setInterval(() => { if (!document.hidden) run(); }, refreshMs) : null;
    return () => { controller.abort(); if (timer) clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision, refreshMs]);
  const retry = useCallback(() => setRevision(v => v + 1), []);
  return state.key === key ? { data: state.data, error: state.error, retry } : { data: null, error: '', retry };
}
export const useOverview = (): Loaded<LabOverview> => useLoad('overview', loadOverview, 60_000);
export const useHistory = (experiment: LabExperiment): Loaded<LabHistory> => useLoad('history:' + experiment, signal => loadHistory(experiment, signal));
export const useLabDay = (experiment: LabExperiment, date: string | null, pending = false): Loaded<LabDay> =>
  useLoad(date ? experiment + ':' + date : null, signal => loadLabDay(experiment, date!, signal), pending ? 30_000 : 0);

/** Complete histories shared by the findings, resident records and the board
 * teaser, so moving between those pages reads each experiment once per visit. */
const shared = new Map<LabExperiment, { at: number; promise: Promise<LabHistory> }>();
function sharedHistory(experiment: LabExperiment): Promise<LabHistory> {
  const hit = shared.get(experiment);
  if (hit && Date.now() - hit.at < 300_000) return hit.promise;
  const promise = loadHistory(experiment).catch(error => { shared.delete(experiment); throw error; });
  shared.set(experiment, { at: Date.now(), promise });
  return promise;
}
export const useHistories = <E extends LabExperiment>(experiments: readonly E[]): Loaded<Record<E, LabRun[]>> =>
  useLoad('histories:' + experiments.join(','), () => Promise.all(experiments.map(sharedHistory))
    .then(list => Object.fromEntries(experiments.map((e, i) => [e, list[i]!.runs])) as Record<E, LabRun[]>));
