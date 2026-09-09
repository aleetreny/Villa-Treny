import type { RuntimeStatus } from '../../../lib/habitat/live';
import { ResidentThoughts, thoughtStatusLabel } from './ResidentThoughts';

export function worldClockLabel(status: RuntimeStatus | null): string {
  if (!status) return 'Clock unknown';
  if (status.mode === 'paused') return 'World paused';
  if (status.health === 'degraded' || status.lastErrorCode || (status.overdueByMs ?? 0) >= 120_000) return 'World delayed';
  return 'World running';
}

export function LiveStatus({ connection, status, error, statusError, lastConnectedAt, refresh }: {
  connection: 'connecting' | 'live' | 'stale' | 'offline'; status: RuntimeStatus | null;
  error: string | null; statusError: string | null; lastConnectedAt: number | null; refresh: () => void;
}) {
  const connectionLabel = { connecting: 'Connecting', live: 'Connected', stale: 'Connection lost', offline: 'Offline' }[connection];
  const date = (milliseconds: number) => new Date(milliseconds).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return <details className="ns-live" onKeyDown={(event) => { if (event.key === 'Escape' && event.currentTarget.open) { event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
    <summary className="ns-connection" data-state={connection}>{connectionLabel}<span> · {worldClockLabel(status)}</span><span className="ns-connection__thoughts">{thoughtStatusLabel(status?.cognition)}</span></summary>
    <div className="ns-live__body">
      <p>{lastConnectedAt ? `State received ${date(lastConnectedAt)}.` : 'No saved world has been received yet.'}</p>
      {error ? <p>{error} {lastConnectedAt ? 'The last received state remains on screen.' : ''}</p> : null}
      {statusError ? <p>{statusError} Room, journal and relationship data can still arrive independently.</p> : null}
      {status ? <>
        <h3>World clock</h3>
        <p>{status.mode === 'paused' ? 'The world clock is paused.' : status.health === 'degraded' || status.lastErrorCode || (status.overdueByMs ?? 0) >= 120_000 ? 'The world is delayed. Its last watch has not completed successfully.' : 'The world advances on its own schedule, even with this page closed.'}</p>
        {status.pauseReason ? <p>Reason: {status.pauseReason.replaceAll('_', ' ')}.</p> : null}
        {status.lastSuccessfulWatchAtMs ?? status.lastRun?.committedAtMs ? <p>Last completed watch: {date((status.lastSuccessfulWatchAtMs ?? status.lastRun?.committedAtMs)!)}.</p> : null}
        {(status.overdueByMs ?? 0) >= 120_000 ? <p>The scheduled watch is {Math.floor(status.overdueByMs! / 60_000)} minutes overdue.</p> : null}
        {status.nextWatchAtMs && status.mode === 'running' ? <p>Next physical watch: {date(status.nextWatchAtMs)}.</p> : null}
      </> : null}
      <h3>Resident thoughts</h3>
      <ResidentThoughts status={status?.cognition} />
      <button type="button" onClick={refresh}>Check again</button>
    </div>
  </details>;
}
