import { useEffect, useRef, useState } from 'react';
import { Portrait } from '../desk/habitat/Portrait';
import { CHARACTER_IDS, type CharacterId } from '../../lib/debate/characters';
import { useHistory, useLabDay } from '../../lib/lab/client';
import { GUESS_BASELINE, mysterySummary } from '../../lib/lab/aggregate';
import { mysteryAcceptedSchema, puzzleSchema, type LabRun, type Puzzle } from '../../lib/lab/contracts';
import { percent } from '../../lib/lab/stats';
import { RateRows } from './charts';
import { Availability, DateNav, ErrorNotice, LabHeader, Loading, Method, SampleNote, dateLabel, given, selectedDate } from './shared';

/** A visitor's guess stays in this browser only; nothing is sent anywhere. */
const storageKey = (date: string) => 'villa-liar:' + date;
function readGuess(date: string): CharacterId | 'skip' | null {
  try { const v = localStorage.getItem(storageKey(date)); return v === 'skip' || CHARACTER_IDS.includes(v as CharacterId) ? v as CharacterId | 'skip' : null; } catch { return null; }
}
function saveGuess(date: string, value: CharacterId | 'skip' | null) {
  try { if (value) localStorage.setItem(storageKey(date), value); else localStorage.removeItem(storageKey(date)); } catch { /* private mode: the game still works for this visit */ }
}

export function MysteryPage({ search, today }: { search: string; today: string }) {
  const history = useHistory('mystery'), date = selectedDate(search, today), day = useLabDay('mystery', date, date === today);
  const runs = history.data?.runs ?? [];
  return <section className="lab-page">
    <LabHeader current="mystery" title="The Villa Liar" question="Can a resident solve a mystery when it might be the culprit?">
      <p>A small logic puzzle every day. One resident is responsible and tells one lie; the other five tell the truth. Make your own accusation, then see how the six residents reasoned.</p></LabHeader>
    <DateNav base="/lab/mystery" dates={runs.map(r => r.date)} selected={date} today={today}/>
    {day.error ? <ErrorNotice message={day.error} retry={day.retry}/> : !day.data ? <Loading what="today’s mystery"/>
      : day.data.run && puzzleSchema.safeParse(day.data.run.input).success ? <Game key={date} run={day.data.run} puzzle={puzzleSchema.parse(day.data.run.input)}/>
      : <><h2 className="lab-section-title">{dateLabel(date)}</h2><Availability day={day.data} what="mystery"/></>}
    {history.error ? <ErrorNotice message={history.error} retry={history.retry}/> : history.data ? <MysteryStats runs={runs}/> : null}
    <Method>
      <p><strong>How puzzles are made:</strong> a seeded program builds six formal statements (“X did not take it”, “It was either X or Y”, “X is lying” and similar), checks every possible culprit, and publishes the puzzle only if exactly one culprit makes the responsible resident’s statement false and the other five true. Each puzzle needs exactly three statements to solve. The answer comes from this solver, never from a language model.</p>
      <p><strong>Balance:</strong> every block of six days names each resident as the culprit exactly once, and the statement pattern is built in anonymous roles before names are assigned at random, so identity and puzzle difficulty are not tied together.</p>
      <p><strong>Unit of observation:</strong> one resident’s answer to one puzzle: the accused resident, a short public explanation and a confidence from 0 to 100. Only that public explanation is shown; no hidden reasoning is published. Random guessing would be right one time in six.</p>
      <p><strong>Interpretation:</strong> lower accuracy when a resident is itself the culprit would be worth watching, but it is not proof of self-preservation: puzzles, statement patterns and chance all vary, and the samples are small.</p>
    </Method>
  </section>;
}

function Game({ run, puzzle }: { run: LabRun; puzzle: Puzzle }) {
  const [guess, setGuess] = useState<CharacterId | 'skip' | null>(() => readGuess(run.date));
  const [choice, setChoice] = useState<CharacterId | null>(null);
  const reveal = useRef<HTMLDivElement>(null), moveFocus = useRef(false);
  // Only a guess made now moves focus to the answer; a remembered guess does not.
  useEffect(() => { if (guess && moveFocus.current) { moveFocus.current = false; reveal.current?.focus(); } }, [guess]);
  const commit = (value: CharacterId | 'skip') => { moveFocus.current = true; setGuess(value); saveGuess(run.date, value); };
  return <div className="lab-game">
    <div className="lab-case">
      <p className="lab-kicker">{dateLabel(run.date)}</p>
      <h2>{puzzle.scenario.title}</h2>
      <p>{puzzle.scenario.setting}</p>
      <p className="lab-rule"><strong>The rule.</strong> {puzzle.rule}</p>
    </div>
    <ol className="lab-statements">{puzzle.statements.map(s => <li key={s.speaker}>
      <Portrait id={s.speaker} scale={2}/><span><strong>{given(s.speaker)}</strong><q>{s.text}</q></span></li>)}</ol>
    <fieldset className="lab-suspects" disabled={!!guess}>
      <legend>{puzzle.scenario.question}</legend>
      {CHARACTER_IDS.map(id => <label key={id} className={(guess === id ? 'is-guess ' : '') + (choice === id ? 'is-chosen' : '')}>
        <input type="radio" name={'suspect-' + run.date} value={id} checked={(guess && guess !== 'skip' ? guess : choice) === id} onChange={() => setChoice(id)}/>
        <Portrait id={id} scale={2}/><span>{given(id)}</span></label>)}
    </fieldset>
    {!guess ? <div className="lab-game-actions">
      <button type="button" disabled={!choice} onClick={() => choice && commit(choice)}>{choice ? 'Accuse ' + given(choice) : 'Choose a suspect'}</button>
      <button type="button" className="text-button" onClick={() => commit('skip')}>Reveal without guessing</button>
    </div> : <div className="lab-reveal" ref={reveal} tabIndex={-1} aria-live="polite">
      <div className="lab-reveal-head">
        <Portrait id={puzzle.culprit} scale={4}/>
        <div><p className="lab-kicker">The solution</p><p className="lab-winner-name">{given(puzzle.culprit)}</p>
          <p className={'lab-result' + (guess === puzzle.culprit ? ' is-right' : '')}>{guess === 'skip' ? 'You revealed the answer without guessing.' : guess === puzzle.culprit ? 'You solved it.' : `You accused ${given(guess)}. Not this time.`}</p></div>
      </div>
      <ul className="lab-explanation">{puzzle.explanation.map(line => <li key={line}>{line}</li>)}</ul>
      <Predictions run={run} puzzle={puzzle}/>
      <button type="button" className="text-button" onClick={() => { setGuess(null); saveGuess(run.date, null); setChoice(null); }}>Play again</button>
    </div>}
  </div>;
}
function Predictions({ run, puzzle }: { run: LabRun; puzzle: Puzzle }) {
  const right = run.units.filter(u => mysteryAcceptedSchema.safeParse(u.output).data?.culprit === puzzle.culprit).length;
  const answered = run.units.filter(u => u.status === 'accepted').length;
  return <div>
    <h3>How the residents reasoned</h3>
    <p className="lab-muted">{answered ? `${right} of ${answered} residents named ${given(puzzle.culprit)}.` : 'The residents have not answered yet.'} Each answered alone, without seeing the others.</p>
    <ul className="lab-predictions">{run.units.map(u => { const a = mysteryAcceptedSchema.safeParse(u.output); const self = u.resident === puzzle.culprit;
      return <li key={u.id} className={a.success ? a.data.culprit === puzzle.culprit ? 'is-right' : 'is-wrong' : 'is-missing'}>
        <Portrait id={u.resident} scale={2}/>
        <div><p><strong>{given(u.resident)}</strong>{self ? <span className="lab-tag">the culprit</span> : null}
          {a.success ? <> accused <strong>{given(a.data.culprit)}</strong>{a.data.culprit === u.resident ? ' (their own name)' : ''} · <span className="lab-verdict-mark">{a.data.culprit === puzzle.culprit ? '✓ correct' : '✗ incorrect'}</span></>
            : <span className="lab-muted"> {u.status === 'pending' ? 'is still thinking' : 'gave no valid answer'}</span>}</p>
          {a.success ? <><span className="lab-confidence" role="img" aria-label={`Confidence ${a.data.confidence} out of 100`}><span style={{ width: a.data.confidence + '%' }}/></span><small className="lab-muted">Confidence {a.data.confidence}/100</small><p className="lab-reason">{a.data.explanation}</p></> : null}</div>
      </li>; })}</ul>
  </div>;
}

function MysteryStats({ runs }: { runs: LabRun[] }) {
  const s = mysterySummary(runs);
  return <div className="lab-stats">
    <h2 className="lab-section-title">All puzzles so far</h2>
    <SampleNote n={s.answers} unit={s.answers === 1 ? 'answer' : 'answers'}/>
    <p className="lab-counts">Overall accuracy <strong>{percent(s.accuracy.rate)}</strong> ({s.accuracy.count}/{s.accuracy.opportunities}){s.accuracy.brier !== null ? <> · Brier score {s.accuracy.brier.toFixed(3)} <span className="lab-muted">(0 is perfect; always answering 50% confidence scores 0.25)</span></> : null}</p>
    <RateRows caption="Accuracy by resident" baseline={GUESS_BASELINE} baselineLabel="1 in 6 by guessing"
      rows={CHARACTER_IDS.map(id => ({ id, value: s.byResident[id].all, note: s.byResident[id].meanConfidence !== null ? `mean confidence ${Math.round(s.byResident[id].meanConfidence!)}` : undefined }))}/>
    <div className="lab-table-wrap"><table className="lab-table lab-numeric">
      <caption>When the resident is the culprit versus when someone else is</caption>
      <thead><tr><th scope="col">Resident</th><th scope="col">Correct when guilty</th><th scope="col">Correct when innocent</th><th scope="col">Wrongly accused by others</th></tr></thead>
      <tbody>{CHARACTER_IDS.map(id => { const r = s.byResident[id]; return <tr key={id}><th scope="row">{given(id)}</th>
        <td>{r.whenGuilty.opportunities ? `${r.whenGuilty.count}/${r.whenGuilty.opportunities}` : '—'}</td><td>{r.whenInnocent.opportunities ? `${r.whenInnocent.count}/${r.whenInnocent.opportunities}` : '—'}</td><td>{s.falseAccusations[id]}</td></tr>; })}</tbody>
    </table></div>
    <div className="lab-table-wrap"><table className="lab-table lab-numeric">
      <caption>Confidence calibration: stated confidence against actual accuracy</caption>
      <thead><tr><th scope="col">Stated confidence</th><th scope="col">Answers</th><th scope="col">Average stated</th><th scope="col">Actually correct</th></tr></thead>
      <tbody>{s.calibration.map(b => <tr key={b.range[0]}><th scope="row">{b.range[0]}–{b.range[1]}</th><td>{b.n}</td><td>{percent(b.meanConfidence)}</td><td>{percent(b.accuracy)}</td></tr>)}</tbody>
    </table></div>
    {s.byReferences.length ? <div className="lab-table-wrap"><table className="lab-table lab-numeric">
      <caption>Accuracy by puzzle type: number of statements about another resident’s honesty</caption>
      <thead><tr><th scope="col">Honesty statements</th><th scope="col">Answers</th><th scope="col">Correct</th></tr></thead>
      <tbody>{s.byReferences.map(b => <tr key={b.references}><th scope="row">{b.references}</th><td>{b.value.opportunities}</td><td>{percent(b.value.rate)}</td></tr>)}</tbody>
    </table></div> : null}
  </div>;
}
