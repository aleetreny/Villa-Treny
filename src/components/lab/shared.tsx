import type { ReactNode } from 'react';
import { Portrait } from '../desk/habitat/Portrait';
import { character, type CharacterId } from '../../lib/debate/characters';
import type { LabDay, LabExperiment } from '../../lib/lab/contracts';
import { percent, type Rate } from '../../lib/lab/stats';
import '../../styles/lab.css';

export const given = (id: CharacterId) => character(id).name.split(' ')[0]!;
export const dateLabel = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
export const shortDate = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const EXPERIMENTS: { id: LabExperiment; href: string; title: string; question: string }[] = [
  { id: 'verdict', href: '/lab/verdict', title: 'The Verdict', question: 'Who argued best, according to the other five?' },
  { id: 'coin', href: '/lab/coin', title: 'The Coin', question: 'Does a model say heads as often as tails?' },
  { id: 'companions', href: '/lab/companions', title: 'The Two Who Come', question: 'Whom does each resident invite for a walk?' },
  { id: 'mystery', href: '/lab/mystery', title: 'The Villa Liar', question: 'Can a resident solve a mystery it might be part of?' },
];

export function LabNav({ current }: { current: LabExperiment | 'overview' }) {
  return <nav className="lab-nav" aria-label="Lab experiments">
    <a href="/lab" aria-current={current === 'overview' ? 'page' : undefined}>Overview</a>
    {EXPERIMENTS.map(e => <a key={e.id} href={e.href} aria-current={current === e.id ? 'page' : undefined}>{e.title}</a>)}
  </nav>;
}
export function LabHeader({ current, title, question, children }: { current: LabExperiment | 'overview'; title: string; question: string; children?: ReactNode }) {
  return <header className="lab-header"><LabNav current={current}/>{current === 'overview' ? null : <p className="lab-kicker">The Lab</p>}<h1>{title}</h1><p className="lab-question">{question}</p>{children}</header>;
}
export function Person({ id, scale = 2, note }: { id: CharacterId; scale?: 2 | 3 | 4; note?: ReactNode }) {
  return <span className="lab-person"><Portrait id={id} scale={scale}/><span>{given(id)}{note ? <small>{note}</small> : null}</span></span>;
}

const REASONS: Record<string, string> = {
  scheduled: 'Today’s requests are scheduled. Results appear here as each one is saved.',
  debate_not_started: 'The jury meets after today’s debate is complete.',
  debate_in_progress: 'The jury meets after today’s debate is complete.',
  jury_scheduled: 'The debate is complete. The jury is scheduled.',
  debate_incomplete: 'The debate for this date was not completed, so no jury was held.',
  window_closed: 'This date closed before every request finished. Saved answers are kept; missing ones are marked.',
  attempt_limit: 'This experiment reached its request budget for the day. Saved answers are kept.',
  quota_wait: 'Waiting for model capacity. The daily debate always goes first.',
  authentication: 'The model service was unavailable for this date.', missing_key: 'The model service was unavailable for this date.',
};
export function Availability({ day, what }: { day: LabDay | null; what: string }) {
  if (!day) return null;
  if (day.availability === 'not_recorded') return <p className="lab-notice" role="status">No {what} recorded for {dateLabel(day.date)}.</p>;
  if (day.availability === 'unavailable') return <p className="lab-notice" role="status">{day.run ? 'No valid answers were recorded for this date. ' : ''}{REASONS[day.reason ?? ''] ?? 'Unavailable for this date.'}</p>;
  if (day.availability === 'pending') return <p className="lab-notice is-pending" role="status">{REASONS[day.reason ?? ''] ?? REASONS.scheduled}</p>;
  if (day.run?.status === 'partial') return <p className="lab-notice" role="status">Incomplete. {REASONS[day.reason ?? ''] ?? 'Some requests did not return a valid answer.'}</p>;
  return null;
}
export function ErrorNotice({ message, retry }: { message: string; retry: () => void }) {
  return <div className="forum-notice" role="alert"><p>{message}</p><button onClick={retry}>Try again</button></div>;
}
export const Loading = ({ what }: { what: string }) => <p className="lab-loading" role="status">Opening {what}…</p>;

/** Date archive control: newest first, with previous/next links. */
export function DateNav({ base, dates, selected, today }: { base: string; dates: string[]; selected: string; today: string }) {
  const all = [...new Set([today, ...dates])].sort().reverse();
  const index = all.indexOf(selected);
  const href = (date: string) => date === today ? base : base + '?date=' + date;
  const older = all[index + 1], newer = index > 0 ? all[index - 1] : undefined;
  return <div className="lab-dates">
    {older ? <a href={href(older)} aria-label={'Previous day, ' + dateLabel(older)}>← Earlier</a> : <span aria-hidden="true">← Earlier</span>}
    <label><span className="forum-sr-only">Choose a date</span>
      <select value={selected} onChange={e => { const url = href(e.target.value); history.pushState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate', { state: { forumNavigation: true } })); }}>
        {all.map(d => <option key={d} value={d}>{d === today ? 'Today · ' : ''}{dateLabel(d)}</option>)}
      </select></label>
    {newer ? <a href={href(newer)} aria-label={'Next day, ' + dateLabel(newer)}>Later →</a> : <span aria-hidden="true">Later →</span>}
  </div>;
}
export function selectedDate(search: string, today: string) {
  const date = new URLSearchParams(search).get('date');
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;
}

export function RateText({ value }: { value: Rate }) {
  if (!value.opportunities) return <span className="lab-muted">No observations yet</span>;
  return <span>{value.count} of {value.opportunities} · <strong>{percent(value.rate)}</strong>
    {value.interval ? <span className="lab-muted"> (95% interval {percent(value.interval.low)}–{percent(value.interval.high)})</span> : null}</span>;
}
export function SampleNote({ n, unit }: { n: number; unit: string }) {
  return <p className="lab-sample">{n === 0 ? `No ${unit} recorded yet.` : `${n} ${unit} so far.`} Small samples can look lopsided by chance alone.</p>;
}
export function Method({ title = 'Method and limits', children }: { title?: string; children: ReactNode }) {
  return <details className="lab-method"><summary>{title}</summary><div>{children}</div></details>;
}
