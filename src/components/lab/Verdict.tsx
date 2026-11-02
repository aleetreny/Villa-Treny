import { useState } from 'react';
import { Portrait } from '../desk/habitat/Portrait';
import { CHARACTER_IDS, type CharacterId } from '../../lib/debate/characters';
import { readVotes, readerRecord, saveVote } from '../../lib/debate/reader-votes';
import { useHistories, useHistory, useLabDay } from '../../lib/lab/client';
import { verdictInputSchema, verdictResultSchema, type Ballot, type LabDay, type LabRun, type VerdictResult } from '../../lib/lab/contracts';
import { ballotsOf, verdictOf, verdictSummary } from '../../lib/lab/aggregate';
import { TIE_RULES } from '../../lib/lab/verdict';
import { Matrix, SlotBars } from './charts';
import { Availability, DateNav, ErrorNotice, LabHeader, Loading, Method, SampleNote, dateLabel, given, selectedDate } from './shared';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];
export function VotingRules() {
  return <Method title="How the verdict works">
    <p>After the conversation ends, each resident ranks the other five by the logic, relevance and persuasiveness of their arguments. Nobody can rank themselves, and no juror sees another juror’s ballot. A first place earns 5 points, then 4, 3, 2 and 1, so each resident can receive at most 25.</p>
    <p>Ties are settled by these rules, in order:</p><ol>{TIE_RULES.map(r => <li key={r}>{r}</li>)}</ol>
    <p>Residents who spoke twice had more chances to persuade. Each verdict records how many times everyone spoke and who opened, so this can be checked over time. A verdict reflects the model’s judgement of fictional arguments; it is not a measure of who is right.</p>
  </Method>;
}

/** The verdict for one stored jury run. */
export function VerdictPanel({ run, compact = false, pick = null }: { run: LabRun; compact?: boolean; pick?: CharacterId | null }) {
  const result = verdictResultSchema.safeParse(run.result);
  const ballots = ballotsOf(run) as Partial<Record<CharacterId, Ballot>>;
  const input = verdictInputSchema.safeParse(run.input);
  const recorded = Object.keys(ballots).length;
  if (!result.success) return <div className="lab-verdict">
    <p className="lab-notice" role="status">{run.status === 'running' ? `The jury is voting: ${recorded} of 6 ballots recorded.` : `No verdict: only ${recorded} of 6 valid ballots were recorded, and a partial jury would be unfair.`}</p>
    {recorded ? <BallotTable ballots={ballots}/> : null}
  </div>;
  const { standings, winners, tieNote } = result.data;
  return <div className="lab-verdict">
    <div className="lab-winner">
      <div className="lab-winner-portraits">{winners.map(id => <Portrait key={id} id={id} scale={compact ? 3 : 4}/>)}</div>
      <div><p className="lab-kicker">{winners.length > 1 ? 'Joint winners' : 'Strongest arguments'}</p>
        <p className="lab-winner-name">{winners.map(given).join(' & ')}</p>
        <p className="lab-muted">{standings[0]!.points} of 25 points{tieNote ? ' · ' + tieNote : ''}</p></div>
    </div>
    <ol className="lab-standings" aria-label="Points received">
      {standings.map(s => <li key={s.id} className={s.id === pick ? 'is-reader-pick' : undefined}>
        <span className="lab-rank">{s.rank}</span>
        <span className="lab-rate-who"><Portrait id={s.id} scale={2}/><span>{given(s.id)}{input.success ? <small>spoke {input.data.participation[s.id] === 2 ? 'twice' : 'once'}</small> : null}
          {s.decidedBy !== 'points' && standings.some(o => o.id !== s.id && o.points === s.points) ? <span className="lab-tie">{s.decidedBy === 'joint' ? 'tied' : 'tie settled by ' + s.decidedBy}</span> : null}</span></span>
        <span className="lab-bar" title={`${given(s.id)}: ${s.points} points; ${s.positions.map((n, i) => `${n}× ${ORDINAL[i]}`).join(', ')}`}>
          {s.positions.map((n, i) => n ? <span key={i} className={'lab-bar-seg is-' + i} style={{ width: (n * (5 - i)) / 25 * 100 + '%' }}/> : null)}
        </span>
        <span className="lab-points">{s.points}<small>pts</small></span>
      </li>)}
    </ol>
    {input.success ? <ParticipationNote standings={standings} participation={input.data.participation}/> : null}
    <p className="lab-legend"><span><span className="lab-swatch is-0"/>First places</span><span><span className="lab-swatch is-1"/>Second places</span><span><span className="lab-swatch is-2"/>Lower places</span><span>Bar length: points out of 25</span></p>
    <BallotTable ballots={ballots}/>
  </div>;
}
function ParticipationNote({ standings, participation }: { standings: { id: CharacterId; points: number }[]; participation: Partial<Record<CharacterId, number>> }) {
  const avg = (times: number) => { const xs = standings.filter(s => participation[s.id] === times); return xs.length ? (xs.reduce((a, s) => a + s.points, 0) / xs.length).toFixed(1) : '—'; };
  return <p className="lab-muted lab-participation">Residents who spoke twice averaged {avg(2)} points; those who spoke once, {avg(1)}. Speaking more gives more to judge, so this is tracked as a possible confounder.</p>;
}
function BallotTable({ ballots }: { ballots: Partial<Record<CharacterId, Ballot>> }) {
  return <details className="lab-method"><summary>How each resident ranked the others</summary><div className="lab-table-wrap"><table className="lab-table">
    <thead><tr><th scope="col">Juror</th>{ORDINAL.map(o => <th scope="col" key={o}>{o}</th>)}<th scope="col">Why their first choice</th></tr></thead>
    <tbody>{CHARACTER_IDS.map(v => { const b = ballots[v]; return <tr key={v}><th scope="row">{given(v)}</th>
      {b ? b.ranking.map((c, i) => <td key={i}>{given(c)}</td>) : <td colSpan={5} className="lab-muted">No valid ballot</td>}<td className="lab-reason">{b?.reason ?? ''}</td></tr>; })}</tbody>
  </table></div></details>;
}

/** Shown at the end of each debate. Reads the stored jury only. */
export function VerdictSection({ date, complete }: { date: string; complete: boolean }) {
  // Poll stored state only for the current edition window.
  const [current] = useState(() => new Date(Date.now() - 9 * 3_600_000).toISOString().slice(0, 10));
  const day = useLabDay('verdict', date, date === current);
  const [vote, setVote] = useState<CharacterId | null>(() => readVotes()[date] ?? null), [revealed, setRevealed] = useState(false);
  const result = day.data?.run ? verdictOf(day.data.run) : null;
  // A finished jury waits until the reader has voted or chosen to skip.
  const hidden = !!result && !vote && !revealed;
  return <section className="lab-verdict-section" id="verdict" aria-labelledby="verdict-title">
    <h2 id="verdict-title">The Verdict</h2>
    <p className="lab-muted">The six residents, as jurors, rank one another’s arguments. <a href={'/lab/verdict' + (date ? '?date=' + date : '')}>Verdicts in the Lab</a></p>
    {complete ? <ReaderVote date={date} vote={vote} result={result} hidden={hidden}
      onVote={id => { setVote(id); saveVote(date, id); if (!id) setRevealed(true); }} onReveal={() => setRevealed(true)}/> : null}
    {day.error ? <ErrorNotice message={day.error} retry={day.retry}/> : !day.data ? <Loading what="the verdict"/>
      : day.data.run ? hidden ? null : <><Availability day={day.data} what="jury"/><VerdictPanel run={day.data.run} compact pick={vote}/></>
      : day.data.availability === 'not_recorded' ? <p className="lab-notice" role="status">No jury recorded for this debate.</p>
      : <p className="lab-notice" role="status">{complete ? 'The jury is scheduled and will meet shortly.' : 'The verdict is pending until the conversation is complete.'}</p>}
    <VotingRules/>
  </section>;
}

const PLACE = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
/** The reader as a seventh juror: one pick per debate, kept in this browser only. */
function ReaderVote({ date, vote, result, hidden, onVote, onReveal }: { date: string; vote: CharacterId | null; result: VerdictResult | null; hidden: boolean; onVote: (id: CharacterId | null) => void; onReveal: () => void }) {
  if (!vote) return <div className="lab-reader-vote">
    <h3>Your vote: who made the strongest case?</h3>
    <p className="lab-muted">{hidden ? 'Choose before you see how the residents ranked one another.' : 'Add your own pick to the jury’s.'} Your vote stays in this browser.</p>
    <ul className="lab-reader-options">{CHARACTER_IDS.map(id => <li key={id}><button type="button" aria-pressed={false} onClick={() => onVote(id)}><Portrait id={id} scale={2}/>{given(id)}</button></li>)}</ul>
    {hidden ? <div className="lab-reader-actions"><button type="button" className="text-button" onClick={onReveal}>Skip to the jury’s verdict</button></div> : null}
  </div>;
  const standing = result?.standings.find(s => s.id === vote), agrees = !!result?.winners.includes(vote);
  return <div className="lab-reader-vote">
    <h3>Your vote: {given(vote)}</h3>
    <p className={'lab-reader-result' + (agrees ? ' is-match' : '')} role="status">{!result || !standing ? 'Saved. The jury’s verdict is not available for this debate.'
      : agrees ? `You and the jury agree: ${given(vote)} ${result.winners.length > 1 ? 'shared the win' : 'won'} with ${standing.points} of 25 points.`
      : `The jury ranked ${given(vote)} ${PLACE[standing.rank - 1]} with ${standing.points} points; ${result.winners.map(given).join(' & ')} ${result.winners.length > 1 ? 'shared the win' : 'won'}.`}</p>
    <ReaderRecordLine date={date}/>
    <div className="lab-reader-actions"><button type="button" className="text-button" onClick={() => onVote(null)}>Change my vote</button></div>
  </div>;
}
function ReaderRecordLine({ date }: { date: string }) {
  const history = useHistories(['verdict'] as const);
  const winners = Object.fromEntries((history.data?.verdict ?? []).flatMap(run => { const v = verdictOf(run); return v ? [[run.date, v.winners]] : []; })) as Record<string, CharacterId[]>;
  const record = readerRecord(readVotes(), winners);
  if (record.votes < 2) return null;
  return <p className="lab-reader-record" key={date}>Your record: {record.votes} votes{record.compared ? ` · you agreed with the jury ${record.agreed} of ${record.compared} times` : ''}{record.favourite.length ? ` · you side most with ${record.favourite.map(given).join(' & ')}` : ''}.</p>;
}

export function VerdictPage({ search, today }: { search: string; today: string }) {
  const history = useHistory('verdict'), date = selectedDate(search, today), day = useLabDay('verdict', date, date === today);
  const runs = history.data?.runs ?? [];
  return <section className="lab-page">
    <LabHeader current="verdict" title="The Verdict" question="Who gives the strongest arguments, according to the other residents?">
      <p>Every completed debate ends with a jury of its own six speakers. Each ranks the other five; the totals decide the day’s winner.</p></LabHeader>
    <DateNav base="/lab/verdict" dates={runs.map(r => r.date)} selected={date} today={today}/>
    <h2 className="lab-section-title">{dateLabel(date)} <a className="lab-small-link" href={'/debates/' + date + '#verdict'}>Read the debate</a></h2>
    {day.error ? <ErrorNotice message={day.error} retry={day.retry}/> : !day.data ? <Loading what="the verdict"/> : <VerdictDay day={day.data}/>}
    <VotingRules/>
    {history.error ? <ErrorNotice message={history.error} retry={history.retry}/> : history.data ? <VerdictStats runs={runs}/> : null}
  </section>;
}
function VerdictDay({ day }: { day: LabDay }) {
  if (day.run) return <><Availability day={day} what="jury"/><VerdictPanel run={day.run}/></>;
  return <Availability day={day} what="jury"/>;
}
function VerdictStats({ runs }: { runs: LabRun[] }) {
  const s = verdictSummary(runs);
  return <div className="lab-stats">
    <h2 className="lab-section-title">Over time</h2>
    <SampleNote n={s.verdicts} unit={s.verdicts === 1 ? 'complete verdict' : 'complete verdicts'}/>
    <div className="lab-callout">
      <h3>What else could sway a jury</h3>
      <p><strong>Speaking twice.</strong> {s.participation.twice.n ? (s.participation.twice.points / s.participation.twice.n).toFixed(1) : '—'} average points when a resident spoke twice ({s.participation.twice.n} cases), {s.participation.once.n ? (s.participation.once.points / s.participation.once.n).toFixed(1) : '—'} when they spoke once ({s.participation.once.n} cases). The debate’s turn order decides who speaks twice, so this is not a judgement about the residents themselves.</p>
      <p><strong>Where a name appears in the list.</strong> Each juror sees the five candidates in a recorded order. If position did not matter, every slot would average 3 points.</p>
      <SlotBars caption="Average points given to the candidate listed in each position" values={s.slots.map(x => x.mean)} counts={s.slots.map(x => x.n)} baseline={3} max={5} format={v => v === null ? '—' : v.toFixed(1)}/>
    </div>
    <div className="lab-table-wrap"><table className="lab-table lab-numeric">
      <caption>Wins and average points per verdict</caption>
      <thead><tr><th scope="col">Resident</th><th scope="col">Wins</th><th scope="col">Joint wins</th><th scope="col">Average points</th><th scope="col">Points vs list-position expectation</th></tr></thead>
      <tbody>{CHARACTER_IDS.map(id => <tr key={id}><th scope="row">{given(id)}</th><td>{s.wins[id]}</td><td>{s.jointWins[id]}</td><td>{s.averagePoints[id]?.toFixed(1) ?? '—'}</td>
        <td>{s.adjusted[id].ratio === null ? '—' : <>×{s.adjusted[id].ratio!.toFixed(2)}<small> {s.adjusted[id].observed} vs {s.adjusted[id].expected.toFixed(1)}</small></>}</td></tr>)}</tbody>
    </table></div>
    {s.timeline.length ? <div className="lab-table-wrap"><table className="lab-table lab-numeric lab-timeline">
      <caption>Rank by date (1 is best)</caption>
      <thead><tr><th scope="col">Date</th>{CHARACTER_IDS.map(id => <th scope="col" key={id}>{given(id)}</th>)}</tr></thead>
      <tbody>{[...s.timeline].reverse().slice(0, 30).map(t => <tr key={t.date}><th scope="row"><a href={'/lab/verdict?date=' + t.date}>{dateLabel(t.date)}</a></th>
        {CHARACTER_IDS.map(id => <td key={id} className={t.rank[id] === 1 ? 'is-first' : ''}>{t.rank[id]}</td>)}</tr>)}</tbody>
    </table></div> : null}
    <Matrix caption="Voting affinity: average points each juror (row) gave each resident (column). Under uniform random ballots every cell would average 3."
      rowLabel="Juror" colLabel="Received"
      cell={(r, c) => r === c ? null : { value: s.affinity[r][c].mean, text: s.affinity[r][c].mean?.toFixed(1) ?? '—',
        title: `${given(r)} gave ${given(c)} ${s.affinity[r][c].mean?.toFixed(2) ?? 'no'} points on average over ${s.affinity[r][c].ballots} ballots` }}
      scale={v => ({ tone: Math.min(1, Math.abs(v - 3) / 2), side: v > 3 ? 'up' : v < 3 ? 'down' : 'none' })}/>
    <p className="lab-sample">Darker brass cells are above the uniform average of 3, slate cells below. With a few ballots, a cell can sit far from 3 by chance: a juror who favours a resident on a handful of days has not shown a stable preference.</p>

  </div>;
}
