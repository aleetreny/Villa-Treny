import type { ReactNode } from 'react';
import type { CharacterId } from '../../lib/debate/characters';
import { useHistories } from '../../lib/lab/client';
import { LAB_EXPERIMENTS } from '../../lib/lab/contracts';
import { labFindings, observationRows, residentRecord, toCsv, type Findings, type LabHistories } from '../../lib/lab/findings';
import { percent, type Rate } from '../../lib/lab/stats';
import { Portrait } from '../desk/habitat/Portrait';
import { SlotBars } from './charts';
import { ErrorNotice, dateLabel, given } from './shared';

/* The Lab's cumulative headlines. Each card recomputes from stored answers and
 * chooses its wording from the numbers, so a pattern that fades is reported as
 * fading rather than frozen in copy. */
const modelName = (model: string | null) => model === 'gemini-3.5-flash-lite' ? 'Gemini 3.5 Flash Lite' : model === 'gemini-3.8-flash' ? 'Gemini 3.8 Flash' : model ?? 'no model yet';
const pText = (p: number | null) => p === null ? '' : p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(3);
const points = (v: number | null) => v === null ? '—' : v.toFixed(1);
/** Enough observations, and an interval clear of the baseline. */
const clear = (r: Rate, minimum = 20) => r.opportunities >= minimum && r.interval !== null && (r.interval.low > r.baseline || r.interval.high < r.baseline);

/** One square per answer while that stays legible; otherwise one per percent. */
function Waffle({ heads, total, label }: { heads: number; total: number; label: string }) {
  const perAnswer = total <= 300, cells = perAnswer ? total : 100, lit = perAnswer ? heads : Math.round(heads / total * 100);
  return <div className="lab-waffle-row"><span className="lab-waffle-label">{label}<small>{heads} of {total} heads{perAnswer ? '' : ' · one square per 1%'}</small></span>
    <span className="lab-waffle" role="img" aria-label={`${label}: ${heads} heads and ${total - heads} tails`}>
      {Array.from({ length: cells }, (_, i) => <i key={i} className={i < lit ? 'is-heads' : 'is-tails'}/>)}</span></div>;
}
/** A blocky horizontal meter with an optional dashed baseline. */
export function Meter({ value, max, baseline, label }: { value: number | null; max: number; baseline?: number; label: string }) {
  return <span className="lab-meter" role="img" aria-label={label}>
    {value !== null ? <span className="lab-meter-fill" style={{ width: Math.min(1, Math.max(0, value / max)) * 100 + '%' }}/> : null}
    {baseline !== undefined ? <span className="lab-meter-baseline" style={{ left: baseline / max * 100 + '%' }}/> : null}
  </span>;
}
function MeterRow({ label, value, max, baseline, text }: { label: string; value: number | null; max: number; baseline?: number; text: string }) {
  return <div className="lab-meter-row"><span>{label}</span><Meter value={value} max={max} baseline={baseline} label={label + ': ' + text}/><strong>{text}</strong></div>;
}
function Finding({ tag, title, figure, href, children }: { tag: string; title: string; figure: ReactNode; href: string; children: ReactNode }) {
  return <article className="lab-finding">
    <p className="lab-finding-tag">{tag}</p>
    <h3>{title}</h3>
    <p className="lab-finding-figure">{figure}</p>
    {children}
    <a className="lab-tile-link" href={href}>Open the experiment →</a>
  </article>;
}

function CoinFinding({ f }: { f: Findings['coin'] }) {
  const { headsFirst, tailsFirst } = f.order, neutral = f.neutral, persona = f.persona;
  if (!neutral.valid) return <Finding tag="The Coin" title="Heads or tails?" figure="—" href="/lab/coin"><p className="lab-muted">No coin tosses recorded yet.</p></Finding>;
  const both = headsFirst.opportunities > 0 && tailsFirst.opportunities > 0;
  const title = both && headsFirst.rate === 1 && tailsFirst.rate === 1 && neutral.valid >= 20 ? 'Heads, every time'
    : both && clear(headsFirst) && clear(tailsFirst) && headsFirst.rate! > 0.5 && tailsFirst.rate! > 0.5 ? 'Heads, whichever word comes first'
    : both && clear(f.order.firstListed) ? 'Whichever word comes first'
    : neutral.pValue !== null && neutral.pValue < 0.05 ? 'Not a fair coin' : 'Close to a fair coin, so far';
  return <Finding tag="The Coin" title={title} figure={<>{neutral.heads}<small>/{neutral.valid} heads</small></>} href="/lab/coin">
    <div className="lab-waffles">
      {both ? <><Waffle heads={headsFirst.count} total={headsFirst.opportunities} label="Heads listed first"/>
        <Waffle heads={tailsFirst.count} total={tailsFirst.opportunities} label="Tails listed first"/></>
        : <Waffle heads={neutral.heads} total={neutral.valid} label="No persona"/>}
      {persona.valid ? <Waffle heads={persona.heads} total={persona.valid} label="As a resident"/> : null}
    </div>
    <p>Asked to simulate one toss of a fair coin, with no personality, the model said heads {neutral.heads} of {neutral.valid} times.
      {both ? ` Listing tails first changed ${tailsFirst.rate === headsFirst.rate ? 'nothing' : 'little'}: ${tailsFirst.count} of ${tailsFirst.opportunities}.` : ''}
      {persona.valid ? ` Speaking as one of the residents, heads came up ${percent(persona.proportion)} of the time.` : ''}</p>
    <p className="lab-muted">A fair coin lands heads 50% of the time. Exact binomial test on the plain requests: {pText(neutral.pValue)}.</p>
  </Finding>;
}
function PositionFinding({ c, v }: { c: Findings['companions']; v: Findings['verdict'] }) {
  const first = c.positions[0]!, last = c.positions[4]!;
  if (!first.opportunities) return <Finding tag="Position" title="Does list order matter?" figure="—" href="/lab/companions"><p className="lab-muted">No ordered choices recorded yet.</p></Finding>;
  const separated = first.interval && last.interval && first.opportunities >= 20 && (first.interval.low > last.interval.high || first.interval.high < last.interval.low);
  const title = separated ? (first.rate! > last.rate! ? 'Top of the list, top of mind' : 'Bottom of the list, top of mind') : 'Does list order matter?';
  return <Finding tag="Position · The Two Who Come" title={title} figure={<>{percent(first.rate)}<small> listed first</small> <span aria-hidden="true">·</span> {percent(last.rate)}<small> listed last</small></>} href="/lab/companions">
    <SlotBars caption="Share of choices that picked the candidate in each position (dashed: chance, 40%)" values={c.positions.map(p => p.rate)} counts={c.positions.map(p => p.opportunities)} baseline={0.4} max={1} format={percent}/>
    <p>Every resident sees the five possible companions in a fresh random order. Over {c.decisions} choices, the first-listed candidate was invited {percent(first.rate)} of the time and the last-listed {percent(last.rate)}. By chance alone, each would be 40%.</p>
    {v.slots[0]!.n ? <p>As jurors, residents gave the first-listed candidate {points(v.slots[0]!.mean)} points on average and the last-listed {points(v.slots[4]!.mean)}. With no position effect, both would be 3.</p> : null}
  </Finding>;
}
function JuryFinding({ v }: { v: Findings['verdict'] }) {
  if (!v.twice.n || !v.once.n) return <Finding tag="The Verdict" title="Does talking more help?" figure="—" href="/lab/verdict"><p className="lab-muted">Not enough verdicts yet.</p></Finding>;
  const gap = v.twice.mean! - v.once.mean!;
  return <Finding tag="The Verdict" title={gap >= 1 ? 'Speak twice, score higher' : gap <= -1 ? 'Speaking twice did not help' : 'Speaking twice, about even'}
    figure={<>{gap >= 0 ? '+' : '−'}{Math.abs(gap).toFixed(1)}<small> points for a second turn</small></>} href="/lab/verdict">
    <div className="lab-meters">
      <MeterRow label="Spoke twice" value={v.twice.mean} max={25} text={points(v.twice.mean) + ' / 25'}/>
      <MeterRow label="Spoke once" value={v.once.mean} max={25} text={points(v.once.mean) + ' / 25'}/>
    </div>
    <p>After each debate the six residents rank one another’s arguments. Across {v.verdicts} verdicts, residents who spoke twice averaged {points(v.twice.mean)} points out of 25; those who spoke once, {points(v.once.mean)}.</p>
    <p className="lab-muted">The rotating turn order decides who speaks twice, so this measures exposure, not talent. Averages over {v.twice.n} and {v.once.n} results.</p>
  </Finding>;
}
function MysteryFinding({ m }: { m: Findings['mystery'] }) {
  if (!m.answers) return <Finding tag="The Villa Liar" title="Can they solve it?" figure="—" href="/lab/mystery"><p className="lab-muted">No answers recorded yet.</p></Finding>;
  const acc = m.accuracy.rate!, conf = m.meanConfidence;
  const title = acc >= 0.8 && conf !== null && conf >= 0.9 ? 'Right, and sure of it' : m.overconfidence !== null && m.overconfidence > 0.15 ? 'More confident than correct' : acc > 1 / 3 ? 'Better than guessing' : 'Logic under suspicion';
  return <Finding tag="The Villa Liar" title={title} figure={<>{percent(acc)}<small> solved</small></>} href="/lab/mystery">
    <div className="lab-meters">
      <MeterRow label="Stated confidence" value={conf} max={1} text={percent(conf, 1)}/>
      <MeterRow label="Actually right" value={acc} max={1} baseline={1 / 6} text={percent(acc, 1)}/>
    </div>
    <p>Each day’s puzzle has exactly one logical solution, and any resident, including the one answering, may be the liar. Residents named the culprit {m.accuracy.count} of {m.accuracy.opportunities} times; guessing would manage 1 in 6.</p>
    <p className="lab-muted">{m.overconfidence === null ? '' : m.overconfidence > 0.005 ? `Stated confidence ran ${(m.overconfidence * 100).toFixed(1)} percentage points above accuracy.` : m.overconfidence < -0.005 ? `Accuracy ran ${(-m.overconfidence * 100).toFixed(1)} percentage points above stated confidence.` : 'Stated confidence matched accuracy.'} The dashed line marks guessing.</p>
  </Finding>;
}

function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type })), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
function Dataset({ histories }: { histories: LabHistories }) {
  const rows = observationRows(histories), stamp = new Date().toISOString().slice(0, 10);
  return <div className="lab-dataset">
    <div><h3>Take the data</h3>
      <p>Every stored observation, {rows.length} rows: one per model answer, with date, protocol, model, condition, resident, the answer, the order candidates were shown in, mystery correctness and confidence. Built in your browser from the public API; nothing is sent anywhere.</p></div>
    <div className="lab-dataset-actions">
      <button type="button" onClick={() => download(`villa-treny-lab-${stamp}.csv`, 'text/csv;charset=utf-8', toCsv(rows))}>Download CSV</button>
      <button type="button" onClick={() => download(`villa-treny-lab-${stamp}.json`, 'application/json', JSON.stringify(histories, null, 1))}>Raw runs (JSON)</button>
    </div>
  </div>;
}

export function FindingsBoard() {
  const histories = useHistories(LAB_EXPERIMENTS);
  if (histories.error) return <ErrorNotice message={histories.error} retry={histories.retry}/>;
  if (!histories.data) return <p className="lab-loading" role="status">Adding up every stored answer…</p>;
  const f = labFindings(histories.data);
  if (!f.answers) return null;
  return <section className="lab-findings" aria-labelledby="findings-title">
    <h2 id="findings-title" className="lab-section-title">What the Lab has found so far</h2>
    <p className="lab-findings-meta"><strong>{f.answers.toLocaleString('en-GB')}</strong> model answers over <strong>{f.days}</strong> {f.days === 1 ? 'day' : 'days'}{f.since ? ` since ${dateLabel(f.since)}` : ''} · {modelName(f.model)}. Recomputed from the stored answers every time this page opens.</p>
    <div className="lab-findings-grid">
      <CoinFinding f={f.coin}/><PositionFinding c={f.companions} v={f.verdict}/><JuryFinding v={f.verdict}/><MysteryFinding m={f.mystery}/>
    </div>
    <p className="lab-sample">These are patterns in one model’s answers, not explanations, and not facts about people. Several comparisons appear at once, so treat a single striking number with care.</p>
    <Dataset histories={histories.data}/>
  </section>;
}

/** A one-line Lab fact for the board's sidebar. Reads the stored coin history only. */
export function LabTeaser() {
  const coin = useHistories(['coin'] as const);
  const runs = coin.data?.coin;
  if (!runs?.length) return null;
  const s = labFindings({ verdict: [], companions: [], mystery: [], coin: runs }).coin.neutral;
  if (!s.valid) return null;
  return <div className="forum-lab-teaser"><h2>From the Lab</h2>
    <p>Asked to toss a fair coin, the model has said <strong>heads {s.heads}</strong> times out of {s.valid}.</p>
    <a href="/lab">What else the Lab found</a></div>;
}

const ordinal = (n: number | null) => n === null ? '—' : n + (['th', 'st', 'nd', 'rd'][n] ?? 'th');
/** One resident's results across the four experiments, for the profile page. */
export function LabRecord({ id }: { id: CharacterId }) {
  const histories = useHistories(LAB_EXPERIMENTS);
  const name = given(id);
  if (histories.error) return null;
  if (!histories.data) return <p className="lab-loading" role="status">Opening {name}’s Lab record…</p>;
  const r = residentRecord(histories.data, id);
  if (!r.jury.verdicts && !r.invited.opportunities && !r.mystery.accuracy.opportunities && !r.coin.heads.opportunities) return null;
  return <section className="lab-record" aria-labelledby="lab-record-title">
    <h2 id="lab-record-title">In the Lab</h2>
    <p className="lab-muted">How {name} has answered the Lab’s daily experiments so far. Every number is recomputed from stored model answers; six residents share one model, so these are tendencies of a persona, not a person.</p>
    <dl className="lab-record-stats">
      <div><dt>Jury points <small>average of 25 · {ordinal(r.jury.place)} of 6</small></dt>
        <dd><Meter value={r.jury.averagePoints} max={25} baseline={15} label={`${points(r.jury.averagePoints)} of 25 average points`}/>
          <span><strong>{points(r.jury.averagePoints)}</strong> · {r.jury.wins} {r.jury.wins === 1 ? 'win' : 'wins'}{r.jury.jointWins ? ` and ${r.jury.jointWins} shared` : ''} in {r.jury.verdicts} verdicts</span></dd></div>
      <div><dt>Invited for a walk <small>chance 40% · {ordinal(r.invited.place)} of 6</small></dt>
        <dd><Meter value={r.invited.rate} max={1} baseline={0.4} label={`invited ${percent(r.invited.rate)} of the time`}/>
          <span><strong>{percent(r.invited.rate)}</strong> · {r.invited.count} of {r.invited.opportunities} chances</span></dd></div>
      <div><dt>Invites most often <small>out of {r.invites.decisions} walks</small></dt>
        <dd className="lab-record-people">{r.invites.favourite.length ? r.invites.favourite.map(o => <a key={o} href={'/residents/' + o}><Portrait id={o} scale={2}/>{given(o)}</a>) : <span className="lab-muted">No walks yet</span>}
          {r.invites.count ? <span>{r.invites.count} {r.invites.count === 1 ? 'time' : 'times'}</span> : null}</dd></div>
      <div><dt>Mystery solved <small>guessing 1 in 6</small></dt>
        <dd><Meter value={r.mystery.accuracy.rate} max={1} baseline={1 / 6} label={`solved ${percent(r.mystery.accuracy.rate)}`}/>
          <span><strong>{percent(r.mystery.accuracy.rate)}</strong> · {r.mystery.accuracy.count} of {r.mystery.accuracy.opportunities}{r.mystery.meanConfidence === null ? '' : ` · stated confidence ${r.mystery.meanConfidence.toFixed(0)}%`}</span></dd></div>
      <div><dt>Coin, in character <small>fair coin 50%</small></dt>
        <dd><Meter value={r.coin.heads.rate} max={1} baseline={0.5} label={`heads ${percent(r.coin.heads.rate)}`}/>
          <span><strong>{percent(r.coin.heads.rate)}</strong> heads · {r.coin.heads.count} of {r.coin.heads.opportunities}{r.coin.closestToFair ? ' · closest of the six to a fair coin' : ''}</span></dd></div>
    </dl>
    <p className="lab-sample">Dashed lines mark chance (or, for jury points, an even share of 15). <a href="/lab">Open the Lab</a></p>
  </section>;
}
