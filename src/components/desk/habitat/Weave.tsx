// THE WEAVE.
//
// The one instrument that lives outside the world. The agents cannot perceive it
// and cannot touch it, so it costs no simulation at all: it only reads state. Its
// Spanish name, LA TRAMA, means both the weave and the plot, which is exactly
// what it is.
//
// Three views of the same six hundred directed edges, because no single one of
// them tells the truth on its own. The graph shows the community at a glance and
// hides the detail. The matrix shows the detail and hides the community — and
// shows asymmetry for free, because the upper triangle does not match the lower.
// The strings show one person's whole life of bonds at once, which is the only
// view where a line that simply stops means what it means.
//
// What the observer can see here and the residents cannot: five dense groups with
// four bridges, and nothing that explains why.

import { memo, useMemo, useState } from 'react';
import { Portrait } from './Portrait';
import { SPACE, layout } from '../../../lib/habitat/graph';
import { RESIDENTS, RESIDENT_BY_ID, type ResidentId } from '../../../lib/habitat/residents';
import {
  AXES, edges, pairKey, type Axis, type Edge, type When,
} from '../../../lib/habitat/weave';

import { matrixStep, axisGap } from '../../../lib/habitat/observer-matrix';

const BOARDING = edges('embarkation');
const BOARDING_PAIRS = new Map(BOARDING.map((edge) => [`${edge.from}${edge.to}`, edge]));

type View = 'graph' | 'matrix' | 'strings';

const AXIS_LABEL: Record<Axis, string> = {
  trust: 'trust',
  affection: 'affection',
  admiration: 'admiration',
  debt: 'debt',
  resentment: 'resentment',
  desire: 'desire',
};

const VIEW_LABEL = { graph: 'Graph', matrix: 'Matrix', strings: 'Bonds' } as const;

/** Warm for what draws people together, cold for what holds them apart. */
function axisHue(axis: Axis): number {
  return {
    trust: 190, affection: 22, admiration: 48, debt: 280, resentment: 356, desire: 320,
  }[axis];
}

function tone(axis: Axis, value: number): string {
  const v = Math.max(0, Math.min(100, value));
  return `hsl(${axisHue(axis)} ${28 + v * 0.4}% ${8 + v * 0.42}%)`;
}

export const Weave = memo(function Weave({ onOpen, relationships, day = 100 }: {
  onOpen: (id: ResidentId) => void;
  relationships?: readonly Edge[];
  day?: number;
}) {
  const [view, setView] = useState<View>('graph');
  const [axis, setAxis] = useState<Axis>('trust');
  const [when, setWhen] = useState<When>('now');
  const [focus, setFocus] = useState<ResidentId>('J');
  const [[matrixFrom, matrixTo], setMatrixPair] = useState<[ResidentId, ResidentId]>(['A', 'B']);

  const nodes = useMemo(() => layout(when), [when]);
  const current = useMemo(() => relationships?.length ? relationships : edges('now'), [relationships]);
  const all = useMemo(() => when === 'now' ? current : BOARDING, [current, when]);
  const byPair = useMemo(() => {
    const m = new Map<string, Edge>();
    for (const e of all) m.set(`${e.from}${e.to}`, e);
    return m;
  }, [all]);

  const currentPairs = useMemo(() => new Map(current.map((edge) => [`${edge.from}${edge.to}`, edge])), [current]);
  const matrixEdge = byPair.get(`${matrixFrom}${matrixTo}`)!;
  const matrixBack = byPair.get(`${matrixTo}${matrixFrom}`)!;

  const ids = RESIDENTS.map((r) => r.id);

  return (
    <section className="weave" aria-label="The Weave: relationships among the twenty-five">
      <header className="weave__bar">
        <span className="weave__title">THE WEAVE</span>
        <div className="weave__views" role="group" aria-label="Relationship view">
          {(['graph', 'matrix', 'strings'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={v === view ? 'weave__tab is-on' : 'weave__tab'}
              onClick={() => setView(v)}
              aria-pressed={v === view}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        <label className="weave__pick">
          <span>Feeling</span>
          <select value={axis} onChange={(e) => setAxis(e.target.value as Axis)}>
            {AXES.map((a) => <option key={a} value={a}>{AXIS_LABEL[a]}</option>)}
          </select>
        </label>
        {view !== 'strings' ? <label className="weave__pick">
          <span>When</span>
          <select value={when} onChange={(e) => setWhen(e.target.value as When)}>
            <option value="embarkation">On boarding</option>
            <option value="now">Day {day}</option>
          </select>
        </label> : null}
      </header>

      {view === 'graph' ? (
        <div className="weave__stage">
          <svg viewBox={`-4 -4 ${SPACE + 8} ${SPACE + 8}`} className="weave__svg">
            {all
              .filter((e) => e.from < e.to)
              .map((e) => {
                const back = byPair.get(`${e.to}${e.from}`)!;
                const a = nodes.find((n) => n.id === e.from)!;
                const b = nodes.find((n) => n.id === e.to)!;
                const v = (e.axes[axis] + back.axes[axis]) / 2;
                if (!e.bonded && v < 34) return null;
                return (
                  <line
                    key={pairKey(e.from, e.to)}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={tone(axis, v)}
                    strokeWidth={0.16 + (v / 100) * 0.9}
                    strokeDasharray={e.latent ? '1.1 0.9' : undefined}
                    opacity={e.bonded ? 0.95 : 0.14}
                  />
                );
              })}
            {nodes.map((n) => {
              const person = RESIDENT_BY_ID[n.id];
              const on = n.id === focus;
              return (
                <g
                  key={n.id}
                  className={on ? 'weave__node is-on' : 'weave__node'}
                  role="button"
                  tabIndex={0}
                  aria-label={`${person.name}, cluster ${person.cluster}`}
                  onClick={() => setFocus(n.id)}
                  onDoubleClick={() => onOpen(n.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); onOpen(n.id); }
                    if (ev.key === ' ') { ev.preventDefault(); setFocus(n.id); }
                  }}
                >
                  <rect x={n.x - 3.6} y={n.y - 3.9} width={7.2} height={7.8} className="weave__dot" />
                  <foreignObject className="weave__portrait" x={n.x - 3} y={n.y - 3.3} width={6} height={6.5}>
                    <Portrait id={n.id} scale={0.25} />
                  </foreignObject>
                  <title>{person.name}</title>
                </g>
              );
            })}
          </svg>
          <button type="button" className="weave__focus" onClick={() => onOpen(focus)}>
            Meet {RESIDENT_BY_ID[focus].name}
          </button>
          <p className="weave__note">
            Positions are an authored reading layout. Lines show the current strength of a feeling;
            the matrix keeps what differs in each direction. Choose a portrait to read their story.
          </p>
        </div>
      ) : null}

      {view === 'matrix' ? (
        <div className="weave__stage weave__stage--matrix">
          <div className="weave__matrix-picks">
            <label className="weave__pick"><span>From</span><select value={matrixFrom} onChange={(event) => { const id = event.target.value as ResidentId; setMatrixPair([id, id === matrixTo ? matrixFrom : matrixTo]); }}>{RESIDENTS.map((person) => <option key={person.id} value={person.id}>{person.id} · {person.name}</option>)}</select></label>
            <label className="weave__pick"><span>To</span><select value={matrixTo} onChange={(event) => { const id = event.target.value as ResidentId; setMatrixPair([id === matrixFrom ? matrixTo : matrixFrom, id]); }}>{RESIDENTS.map((person) => <option key={person.id} value={person.id}>{person.id} · {person.name}</option>)}</select></label>
          </div>
          <svg viewBox="-9 -9 118 118" className="weave__svg" aria-label="Directed relationship matrix. Use arrow keys to move between feelings.">
            {ids.map((from, r) => ids.map((to, c) => {
              if (from === to) {
                return <rect key={`${from}${to}`} x={c * 4} y={r * 4} width={4} height={4} className="weave__self" />;
              }
              const e = byPair.get(`${from}${to}`)!;
              return (
                <rect
                  key={`${from}${to}`}
                  role="button" tabIndex={from === matrixFrom && to === matrixTo ? 0 : -1}
                  data-pair={`${from}${to}`} aria-pressed={from === matrixFrom && to === matrixTo}
                  aria-label={`${RESIDENT_BY_ID[from].name} to ${RESIDENT_BY_ID[to].name}: ${axis} ${e.axes[axis]}`}
                  onClick={() => setMatrixPair([from, to])}
                  onKeyDown={(event) => {
                    if (event.key.startsWith('Arrow')) {
                      event.preventDefault();
                      const pair = matrixStep(from, to, event.key);
                      setMatrixPair(pair);
                      event.currentTarget.ownerSVGElement?.querySelector<SVGRectElement>(`[data-pair="${pair.join('')}"]`)?.focus();
                    } else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setMatrixPair([from, to]); }
                  }}
                  x={c * 4} y={r * 4} width={4} height={4}
                  fill={tone(axis, e.axes[axis])}
                  stroke={e.latent ? 'rgba(255,214,64,.8)' : 'none'}
                  strokeWidth={e.latent ? 0.5 : 0}
                >
                  <title>
                    {`${RESIDENT_BY_ID[from].name} → ${RESIDENT_BY_ID[to].name}: `
                      + `${AXIS_LABEL[axis]} ${e.axes[axis]}`}
                  </title>
                </rect>
              );
            }))}
            {ids.map((id, i) => (
              <text key={`r${id}`} x={-1.4} y={i * 4 + 2.9} className="weave__axislabel">{id}</text>
            ))}
            {ids.map((id, i) => (
              <text key={`c${id}`} x={i * 4 + 2} y={-2.2} className="weave__axislabel weave__axislabel--top">{id}</text>
            ))}
          </svg>
          <p className="weave__matrix-value" aria-live="polite"><button type="button" onClick={() => onOpen(matrixFrom)}>{RESIDENT_BY_ID[matrixFrom].name}</button> → <button type="button" onClick={() => onOpen(matrixTo)}>{RESIDENT_BY_ID[matrixTo].name}</button>: {axis} <b>{matrixEdge.axes[axis]}</b>. In return: <b>{matrixBack.axes[axis]}</b>.</p>
          <p className="weave__note">Rows hold; columns receive. Select a cell or use the name lists. Arrow keys move across the matrix.</p>
        </div>
      ) : null}

      {view === 'strings' ? (
        <div className="weave__stage weave__stage--strings">
          <label className="weave__pick weave__pick--wide">
            <span>Whose life</span>
            <select value={focus} onChange={(e) => setFocus(e.target.value as ResidentId)}>
              {RESIDENTS.map((r) => (
                <option key={r.id} value={r.id}>{r.id} · {r.name}</option>
              ))}
            </select>
          </label>
          <ul className="weave__strings">
            {ids.filter((id) => id !== focus).map((other) => {
              const then = BOARDING_PAIRS.get(`${focus}${other}`)!;
              const now = currentPairs.get(`${focus}${other}`)!;
              const back = currentPairs.get(`${other}${focus}`)!;
              const gap = axisGap(now, back, axis);
              return (
                <li key={other} className="weave__string">
                  <button
                    type="button"
                    className="weave__stringwho"
                    onClick={() => onOpen(other)}
                  >
                    <span className="weave__stringinitial">{other}</span>
                    {RESIDENT_BY_ID[other].name}
                  </button>
                  <svg viewBox="0 0 100 8" className="weave__trace" aria-hidden="true">
                    <line x1="0" y1="4" x2="100" y2="4" className="weave__tracebase" />
                    {/* A taper from what they carried aboard to what is there
                        now, so the shape is the change and not the total. */}
                    <path
                      d={(() => {
                        const a = 0.25 + (then.axes[axis] / 100) * 2.6;
                        const b = 0.25 + (now.axes[axis] / 100) * 2.6;
                        return `M6 ${4 - a} L94 ${4 - b} L94 ${4 + b} L6 ${4 + a} Z`;
                      })()}
                      fill={tone(axis, now.axes[axis])}
                      opacity={now.bonded ? 1 : 0.5}
                    />
                    <circle cx="6" cy="4" r=".55" className="weave__tracedot" />
                    <circle cx="94" cy="4" r=".55" className="weave__tracedot" />
                  </svg>
                  <span className="weave__stringval">
                    {now.axes[axis]}
                    {gap > 12 ? <b title={`${axis}: ${now.axes[axis]} held, ${back.axes[axis]} received`}> ≠</b> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="weave__note">
            On the left, boarding. On the right, day {day}. The ≠ sign means
            the selected feeling differs by more than 12 points in the other direction.
          </p>
        </div>
      ) : null}
    </section>
  );
});
