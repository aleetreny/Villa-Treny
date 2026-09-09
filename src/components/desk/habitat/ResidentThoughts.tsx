import type { CognitionStatus } from '../../../lib/habitat/agency';

const thoughtTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
});

export function thoughtStatusLabel(status: CognitionStatus | null | undefined): string {
  if (!status) return 'Thoughts unknown';
  return { starting: 'Thoughts starting', healthy: 'Thoughts active', degraded: 'Thoughts delayed', paused: 'Thoughts paused' }[status.health];
}

export function AgencyTime({ atMs }: { atMs: number }) {
  const date = new Date(atMs);
  if (!Number.isFinite(date.getTime())) return <span>Time unavailable</span>;
  return <time dateTime={date.toISOString()}>{thoughtTime.format(date)}</time>;
}

/** Successful reads and a moving physical clock do not imply resident cognition. */
export function ResidentThoughts({ status }: { status: CognitionStatus | null | undefined }) {
  if (!status) return <p className="ns-ledger__note">Thought activity is not available. The world clock and room data are checked separately.</p>;
  return <div className="ns-thoughts">
    {status.lastErrorCode ? <p>Thought recording is delayed: {status.lastErrorCode.replaceAll('_', ' ')}.</p> : null}
    <p><strong>{status.successfulLastWatch} of {status.total}</strong> residents completed a thought in the past six hours.</p>
    <p>{status.neverThought ? `${status.neverThought} ${status.neverThought === 1 ? 'has' : 'have'} no completed thought recorded yet.` : 'Every resident has completed a thought at least once.'}</p>
    <p>{status.pendingResidents.length} awaiting an opportunity · {status.waitingForReply.length} {status.waitingForReply.length === 1 ? 'resident' : 'residents'} with a reply available.</p>
    <p>{status.lastSuccessfulThoughtAtMs === null ? 'No completed thought has been recorded yet.' : <>Last completed thought: <AgencyTime atMs={status.lastSuccessfulThoughtAtMs} />.</>}</p>
    <p>{status.nextOpportunityAtMs === null ? 'No next opportunity is currently scheduled.' : <>Next opportunity: <AgencyTime atMs={status.nextOpportunityAtMs} />.</>}</p>
    <p className="ns-ledger__note">Thinking is spread across the day within the available allowance. Residents can choose a conversation or work on their own project. A reply may wait for another opportunity.</p>
    <p className="ns-ledger__note">These are thought records, separate from the physical watches and the figures wandering through rooms.</p>
  </div>;
}
