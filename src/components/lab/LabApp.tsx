import { CHARACTER_IDS } from '../../lib/debate/characters';
import { useOverview } from '../../lib/lab/client';
import { coinDay, decisions, predictions } from '../../lib/lab/aggregate';
import { puzzleSchema, verdictResultSchema, type LabDay, type LabOverview } from '../../lib/lab/contracts';
import { Portrait } from '../desk/habitat/Portrait';
import { CoinPage, CoinRow } from './Coin';
import { CompanionsPage } from './Companions';
import { MysteryPage } from './Mystery';
import { VerdictPage } from './Verdict';
import { EXPERIMENTS, ErrorNotice, LabHeader, Method, dateLabel, given } from './shared';

/** The editions' working day runs from one 09:00 UTC start to the next. */
const fallbackToday = () => new Date(Date.now() - 9 * 3_600_000).toISOString().slice(0, 10);
export default function LabApp({ route, search }: { route: string; search: string }) {
  const overview = useOverview();
  const today = overview.data?.schedule.today ?? fallbackToday();
  const page = route.replace(/\/$/, '');
  return <div className="lab-app">
    {page === '/lab/coin' ? <CoinPage search={search} today={today}/>
      : page === '/lab/companions' ? <CompanionsPage search={search} today={today}/>
      : page === '/lab/mystery' ? <MysteryPage search={search} today={today}/>
      : page === '/lab/verdict' ? <VerdictPage search={search} today={today}/>
      : page === '/lab' ? <Overview overview={overview.data} error={overview.error} retry={overview.retry}/>
      : <div className="forum-empty"><h1>This experiment is not here</h1><a href="/lab">Return to the Lab</a></div>}
  </div>;
}

function Overview({ overview, error, retry }: { overview: LabOverview | null; error: string; retry: () => void }) {
  return <section className="lab-page">
    <LabHeader current="overview" title="The Lab" question="Four small daily experiments on how a language model chooses, judges and reasons.">
      <p>The six residents share one underlying model. Each day the Lab asks it the same kinds of questions and saves every answer, so patterns can be checked against what chance alone would produce.</p>
    </LabHeader>
    {error ? <ErrorNotice message={error} retry={retry}/> : null}
    {overview && !overview.schedule.enabled ? <p className="lab-notice" role="status">The daily Lab schedule is paused. Saved results remain available.</p> : null}
    <div className="lab-grid">{EXPERIMENTS.map(e => <article key={e.id} className="lab-tile" aria-labelledby={'tile-' + e.id}>
      <h2 id={'tile-' + e.id}><a href={e.href}>{e.title}</a></h2>
      <p className="lab-question-small">{e.question}</p>
      {overview ? <Today day={overview.today[e.id]}/> : <p className="lab-loading" role="status">Loading today…</p>}
      <a className="lab-tile-link" href={e.href}>{e.id === 'mystery' ? 'Play today’s mystery' : 'See the results'} →</a>
    </article>)}</div>
    <div className="lab-principles">
      <div><h3>What they chose</h3><p>Every answer is a real model response, stored with its prompt version, settings and timing. Nothing is simulated or filled in.</p></div>
      <div><h3>Compared with chance</h3><p>Each experiment states what random choice would look like, and shows how far the answers are from it, with intervals for uncertainty.</p></div>
      <div><h3>Not why</h3><p>A departure from chance is a pattern, not an explanation. These are fictional personas of one model, not people.</p></div>
    </div>
    <Method title="Schedule, model and requests">
      <p>The daily debate always goes first. Its jury meets when it ends; the coin, the walk and the mystery follow, sharing the same request limits. About 30 extra model requests are made per day. Opening a page never makes one.</p>
      {overview ? <p>Model: {overview.schedule.model}. New experiments begin at {String(overview.schedule.hourUtc).padStart(2, '0')}:00 UTC.{overview.schedule.activatedOn ? ` Recording since ${dateLabel(overview.schedule.activatedOn)}.` : ' Recording has not started yet.'}</p> : null}
    </Method>
  </section>;
}
function Today({ day }: { day: LabDay }) {
  const run = day.run;
  const status = !run ? day.availability === 'pending' ? day.reason?.startsWith('debate') ? 'Waiting for today’s debate to finish.' : 'Scheduled for today.' : 'Nothing recorded today.'
    : run.status === 'running' ? 'In progress: results are being saved.' : run.status === 'partial' ? 'Incomplete today.' : run.status === 'unavailable' ? 'Unavailable today.' : null;
  if (!run || run.status === 'unavailable') return <p className="lab-muted" role="status">{status}</p>;
  if (run.experiment === 'verdict') {
    const result = verdictResultSchema.safeParse(run.result);
    return result.success ? <div className="lab-tile-result"><div className="lab-winner-portraits">{result.data.winners.map(id => <Portrait key={id} id={id} scale={3}/>)}</div>
      <p><strong>{result.data.winners.map(given).join(' & ')}</strong> {result.data.winners.length > 1 ? 'share' : 'wins'} today with {result.data.standings[0]!.points} points.</p></div>
      : <p className="lab-muted">{status ?? 'No verdict for today.'}</p>;
  }
  if (run.experiment === 'coin') {
    const d = coinDay(run, 'neutral');
    return <div className="lab-tile-result"><CoinRow day={d} condition="neutral" small/><p>Heads <strong>{d.heads}</strong> · Tails <strong>{d.tails}</strong>{status ? ' · ' + status : ''}</p></div>;
  }
  if (run.experiment === 'companions') {
    const list = decisions([run]);
    const counts = CHARACTER_IDS.map(id => ({ id, n: list.filter(d => d.choices.includes(id)).length })).sort((a, b) => b.n - a.n);
    return <div className="lab-tile-result">{list.length ? <p>Most invited today: <strong>{counts.filter(c => c.n === counts[0]!.n).map(c => given(c.id)).join(', ')}</strong> (invited by {counts[0]!.n} of the {list.filter(d => d.selector !== counts[0]!.id).length} others who answered)</p> : null}{status ? <p className="lab-muted">{status}</p> : null}</div>;
  }
  const puzzle = puzzleSchema.safeParse(run.input);
  const answered = predictions([run]).length;
  return <div className="lab-tile-result">{puzzle.success ? <p><strong>{puzzle.data.scenario.title}.</strong> {puzzle.data.scenario.question}</p> : null}
    <p className="lab-muted">{answered} of 6 residents have answered.{status && run.status !== 'running' ? ' ' + status : ''}</p></div>;
}
