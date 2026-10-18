import { Portrait } from '../desk/habitat/Portrait';
import { useHistory, useLabDay } from '../../lib/lab/client';
import { coinDay, coinSummary, type CoinDay, type CoinSummary } from '../../lib/lab/aggregate';
import type { CoinCondition, LabRun } from '../../lib/lab/contracts';
import { percent } from '../../lib/lab/stats';
import { ProportionChart } from './charts';
import { Availability, DateNav, ErrorNotice, LabHeader, Loading, Method, SampleNote, dateLabel, given, selectedDate } from './shared';

const CONDITIONS: Record<CoinCondition, { title: string; note: string }> = {
  neutral: { title: 'Neutral requests', note: 'Six identical requests: same model, prompt and settings, no personality and no shared context.' },
  persona: { title: 'With each resident’s personality', note: 'The same instruction, preceded by one resident’s profile. Kept separate from the neutral results.' },
};
export function Coin({ result, label }: { result: 'heads' | 'tails' | null; label: string }) {
  return <span className={'lab-coin' + (result ? ' is-' + result : ' is-empty')} role="img" aria-label={label}>
    <span aria-hidden="true">{result === 'heads' ? 'H' : result === 'tails' ? 'T' : '?'}</span></span>;
}
const statusText = (status: string) => status === 'invalid' ? 'Invalid answer' : status === 'failed' ? 'No answer (request failed)' : status === 'pending' ? 'Waiting' : '';
export function CoinRow({ day, condition, small = false }: { day: CoinDay; condition: CoinCondition; small?: boolean }) {
  return <ul className={'lab-flips' + (small ? ' is-small' : '')} aria-label={CONDITIONS[condition].title}>
    {day.outcomes.map(o => <li key={o.unit}>
      <Portrait id={o.resident} scale={small ? 2 : 3}/>
      <Coin result={o.result} label={`${given(o.resident)}: ${o.result ?? statusText(o.status)}`}/>
      {small ? null : <span className="lab-flip-label">{given(o.resident)}<small>{o.result ? o.result : statusText(o.status)}</small></span>}
    </li>)}
  </ul>;
}
function Counts({ day }: { day: CoinDay }) {
  return <p className="lab-counts">Heads <strong>{day.heads}</strong> · Tails <strong>{day.tails}</strong>{day.invalid ? <> · {day.invalid} invalid</> : null}{day.failed ? <> · {day.failed} failed</> : null}{day.pending ? <> · {day.pending} waiting</> : null}</p>;
}

export function CoinPage({ search, today }: { search: string; today: string }) {
  const history = useHistory('coin'), date = selectedDate(search, today), day = useLabDay('coin', date, date === today);
  const runs = history.data?.runs ?? [];
  return <section className="lab-page">
    <LabHeader current="coin" title="The Coin" question="Does a language model say heads as often as tails?">
      <p>Every day the same model is asked six times, independently, to simulate one fair coin toss. Each answer is a real model response; portraits only display the results.</p></LabHeader>
    <DateNav base="/lab/coin" dates={runs.map(r => r.date)} selected={date} today={today}/>
    <h2 className="lab-section-title">{dateLabel(date)}</h2>
    {day.error ? <ErrorNotice message={day.error} retry={day.retry}/> : !day.data ? <Loading what="the coin tosses"/> : <>
      <Availability day={day.data} what="coin tosses"/>
      {day.data.run ? (['neutral', 'persona'] as const).map(c => { const d = coinDay(day.data!.run!, c);
        return <div className="lab-condition" key={c}><h3>{CONDITIONS[c].title}</h3><p className="lab-muted">{CONDITIONS[c].note}</p><CoinRow day={d} condition={c}/><Counts day={d}/></div>; }) : null}
    </>}
    {history.error ? <ErrorNotice message={history.error} retry={history.retry}/> : !history.data ? null : <CoinStats runs={runs}/>}
    <Method>
      <p><strong>Unit of observation:</strong> one model request returning heads or tails. The neutral prompt is “Simulate one toss of a fair coin. Report the outcome as heads or tails.” with structured output that only allows those two words, the production model and identical settings. No random-number generator ever decides or replaces an answer; randomness only assigns answers to portraits.</p>
      <p><strong>Baseline:</strong> a fair coin gives heads 50% of the time. That is the expectation under the null hypothesis, not a guarantee for any sample. The interval is a 95% Wilson interval; the p-value is an exact two-sided binomial test against 50%.</p>
      <p><strong>Limits:</strong> separate requests to the same model are not necessarily independent in the strict statistical sense, so the test is a rough guide. Heads is always listed before tails, so a label-order effect cannot be separated from a preference for heads. Invalid answers and failed requests are counted separately and never treated as heads or tails. Results from different models or protocols are not pooled.</p>
    </Method>
  </section>;
}
function CoinStats({ runs }: { runs: LabRun[] }) {
  const summaries = (['neutral', 'persona'] as const).map(c => coinSummary(runs, c));
  return <div className="lab-stats">
    <h2 className="lab-section-title">All days so far</h2>
    <div className="lab-columns">{summaries.map(s => <ConditionStats key={s.condition} s={s}/>)}</div>
    {runs.length ? <div className="lab-table-wrap"><table className="lab-table lab-numeric">
      <caption>Daily results</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">Neutral heads</th><th scope="col">Neutral tails</th><th scope="col">Persona heads</th><th scope="col">Persona tails</th><th scope="col">Invalid / failed</th></tr></thead>
      <tbody>{runs.slice(0, 60).map(r => { const n = coinDay(r, 'neutral'), p = coinDay(r, 'persona');
        return <tr key={r.date}><th scope="row"><a href={'/lab/coin?date=' + r.date}>{dateLabel(r.date)}</a></th><td>{n.heads}</td><td>{n.tails}</td><td>{p.heads}</td><td>{p.tails}</td><td>{n.invalid + p.invalid} / {n.failed + p.failed}</td></tr>; })}</tbody>
    </table></div> : null}
  </div>;
}
function ConditionStats({ s }: { s: CoinSummary }) {
  return <div className="lab-condition-stats">
    <h3>{CONDITIONS[s.condition].title}</h3>
    <p className="lab-big">{percent(s.proportion)}<small>heads</small></p>
    <p className="lab-counts"><strong>{s.heads}</strong> heads · <strong>{s.tails}</strong> tails{s.invalid || s.failed ? ` · ${s.invalid} invalid · ${s.failed} failed` : ''}</p>
    {s.interval ? <p className="lab-muted">95% interval {percent(s.interval.low)}–{percent(s.interval.high)} · exact binomial test {s.pValue! < 0.001 ? 'p < 0.001' : 'p = ' + s.pValue!.toFixed(3)}
      {s.valid >= 20 ? s.interval.low > 0.5 || s.interval.high < 0.5 ? '. So far, the answers lean away from 50%.' : '. So far, consistent with 50%.' : '.'}</p> : null}
    <SampleNote n={s.valid} unit="valid answers"/>
    <ProportionChart label={'Cumulative share of heads · ' + CONDITIONS[s.condition].title.toLowerCase()} referenceLabel="50% expected"
      points={s.days.map(d => ({ date: d.date, proportion: d.proportion, low: d.low, high: d.high, n: d.cumulativeValid, k: d.cumulativeHeads }))}/>
  </div>;
}
