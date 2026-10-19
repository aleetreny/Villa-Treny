import { useId, useMemo, useState, type ReactNode } from 'react';
import { Portrait } from '../desk/habitat/Portrait';
import { CHARACTER_IDS, type CharacterId } from '../../lib/debate/characters';
import { percent, type Rate } from '../../lib/lab/stats';
import { given, shortDate } from './shared';

/* Charts follow one rule set: identity comes from portraits and names, never
 * colour alone; magnitudes use one brass hue; every chart has a text table. */

/** Cumulative proportion with its 95% Wilson band and a reference line. */
export function ProportionChart({ points, reference = 0.5, label, referenceLabel }: {
  points: { date: string; proportion: number | null; low: number | null; high: number | null; n: number; k: number }[];
  reference?: number; label: string; referenceLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const valid = points.filter(p => p.proportion !== null);
  const W = 640, H = 220, L = 44, R = 16, T = 14, B = 30;
  const x = (i: number) => valid.length < 2 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (valid.length - 1);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  if (!valid.length) return <p className="lab-muted">The chart appears after the first valid answers are saved.</p>;
  const line = valid.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.proportion!).toFixed(1)}`).join('');
  const band = valid.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.high!).toFixed(1)}`).join('')
    + [...valid].reverse().map((p, j) => `L${x(valid.length - 1 - j).toFixed(1)},${y(p.low!).toFixed(1)}`).join('') + 'Z';
  const active = hover !== null ? valid[hover] : valid.at(-1);
  const activeIndex = hover ?? valid.length - 1;
  return <figure className="lab-chart" aria-labelledby={id}>
    <figcaption id={id}>{label}</figcaption>
    <div className="lab-chart-frame">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. Latest: ${percent(valid.at(-1)!.proportion)} after ${valid.at(-1)!.n} answers.`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={e => { const box = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - box.left) / box.width * W;
          let best = 0; valid.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; }); setHover(best); }}>
        {[0, 0.25, 0.5, 0.75, 1].map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="lab-grid"/><text x={L - 8} y={y(v) + 4} textAnchor="end" className="lab-axis">{v * 100}%</text></g>)}
        <path d={band} className="lab-band"/>
        <line x1={L} x2={W - R} y1={y(reference)} y2={y(reference)} className="lab-reference"/>
        <text x={L + 6} y={y(reference) + 16} className="lab-axis lab-reference-label">{referenceLabel}</text>
        {valid.length > 1 ? <path d={line} className="lab-line"/> : <line x1={x(0)} x2={x(0)} y1={y(valid[0]!.low!)} y2={y(valid[0]!.high!)} className="lab-whisker"/>}
        <circle cx={x(activeIndex)} cy={y(active!.proportion!)} r={5} className="lab-dot"/>
        <text x={L} y={H - 8} className="lab-axis">{shortDate(valid[0]!.date)}</text>
        {valid.length > 1 ? <text x={W - R} y={H - 8} textAnchor="end" className="lab-axis">{shortDate(valid.at(-1)!.date)}</text> : null}
      </svg>
      <p className="lab-chart-readout" aria-live="polite">{shortDate(active!.date)}: {percent(active!.proportion)} heads after {active!.n} valid answers · 95% interval {percent(active!.low)}–{percent(active!.high)}</p>
    </div>
  </figure>;
}

/** One row per resident: an observed rate, its interval, and the baseline. */
export function RateRows({ rows, baseline, baselineLabel, caption }: { rows: { id: CharacterId; value: Rate; note?: ReactNode }[]; baseline: number; baselineLabel: string; caption: string }) {
  return <figure className="lab-rates">
    <figcaption>{caption}</figcaption>
    <div className="lab-rate-scale" aria-hidden="true"><span>0%</span><span style={{ left: baseline * 100 + '%' }}>{baselineLabel}</span><span>100%</span></div>
    <ul>{rows.map(({ id, value, note }) => <li key={id}>
      <span className="lab-rate-who"><Portrait id={id} scale={2}/><span>{given(id)}{note ? <small>{note}</small> : null}</span></span>
      <span className="lab-rate-track" title={value.opportunities ? `${given(id)}: ${value.count} of ${value.opportunities} (${percent(value.rate)})` : 'No observations yet'}>
        <span className="lab-rate-baseline" style={{ left: baseline * 100 + '%' }}/>
        {value.interval ? <span className="lab-rate-interval" style={{ left: value.interval.low * 100 + '%', width: (value.interval.high - value.interval.low) * 100 + '%' }}/> : null}
        {value.rate !== null ? <span className="lab-rate-dot" style={{ left: value.rate * 100 + '%' }}/> : null}
      </span>
      <span className="lab-rate-value">{value.opportunities ? <>{percent(value.rate)}<small>{value.count}/{value.opportunities}</small></> : <small>—</small>}</span>
    </li>)}</ul>
  </figure>;
}

/** 6×6 matrix with values printed in every cell. Rows are the chooser/voter. */
export function Matrix({ caption, rowLabel, colLabel, cell, scale }: {
  caption: string; rowLabel: string; colLabel: string;
  cell: (row: CharacterId, col: CharacterId) => { text: string; value: number | null; title: string } | null;
  scale: (value: number) => { tone: number; side: 'up' | 'down' | 'none' };
}) {
  return <div className="lab-matrix-wrap"><table className="lab-matrix">
    <caption>{caption}</caption>
    <thead><tr><th scope="col"><span className="forum-sr-only">{rowLabel} / {colLabel}</span><span aria-hidden="true" className="lab-matrix-corner">{rowLabel} ↓ · {colLabel} →</span></th>
      {CHARACTER_IDS.map(c => <th scope="col" key={c}><Portrait id={c} scale={1}/><span>{given(c)}</span></th>)}</tr></thead>
    <tbody>{CHARACTER_IDS.map(r => <tr key={r}><th scope="row"><Portrait id={r} scale={1}/><span>{given(r)}</span></th>
      {CHARACTER_IDS.map(c => { const v = cell(r, c);
        if (!v) return <td key={c} className="is-self" aria-label="Not eligible">·</td>;
        const s = v.value === null ? { tone: 0, side: 'none' as const } : scale(v.value);
        return <td key={c} title={v.title} className={'is-' + s.side + (s.side === 'up' && s.tone > 0.55 ? ' is-strong' : '')} style={{ ['--tone' as string]: s.tone.toFixed(3) }}>{v.text}</td>; })}</tr>)}</tbody>
  </table></div>;
}

/** Directed network of today's invitations around a hexagon of portraits. */
export function Network({ edges, focus, onFocus, caption }: { edges: { from: CharacterId; to: CharacterId[] }[]; focus: CharacterId | null; onFocus: (id: CharacterId | null) => void; caption: string }) {
  const pos = useMemo(() => Object.fromEntries(CHARACTER_IDS.map((id, i) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [id, { x: 50 + 40 * Math.cos(a), y: 50 + 39 * Math.sin(a) }]; })) as Record<CharacterId, { x: number; y: number }>, []);
  const chosen = (a: CharacterId, b: CharacterId) => edges.find(e => e.from === a)?.to.includes(b) ?? false;
  const lines = edges.flatMap(e => e.to.map(to => ({ from: e.from, to, mutual: chosen(to, e.from) })));
  return <figure className="lab-network">
    <figcaption className="forum-sr-only">{caption}</figcaption>
    <div className="lab-network-stage">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs><marker id="lab-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0L10,5L0,10Z" className="lab-arrowhead"/></marker></defs>
        {lines.map(({ from, to, mutual }) => {
          if (mutual && from > to) return null;
          const a = pos[from], b = pos[to], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
          // Leave room for the portraits; bend one-way arrows slightly so opposite pairs never overlap.
          const sx = a.x + ux * 11, sy = a.y + uy * 11, ex = b.x - ux * 11, ey = b.y - uy * 11, bend = mutual ? 0 : 5;
          const cx = (sx + ex) / 2 - uy * bend, cy = (sy + ey) / 2 + ux * bend;
          const lit = !focus || from === focus || to === focus;
          return <path key={from + to} d={`M${sx},${sy} Q${cx},${cy} ${ex},${ey}`} className={'lab-edge' + (mutual ? ' is-mutual' : '') + (lit ? '' : ' is-dim')}
            markerEnd="url(#lab-arrow)" markerStart={mutual ? 'url(#lab-arrow)' : undefined}/>;
        })}
      </svg>
      {CHARACTER_IDS.map(id => <button key={id} type="button" className="lab-node" style={{ left: pos[id].x + '%', top: pos[id].y + '%' }}
        aria-pressed={focus === id} onClick={() => onFocus(focus === id ? null : id)}
        aria-label={`${given(id)}: invited ${edges.find(e => e.from === id)?.to.map(given).join(' and ') || 'no answer'}; invited by ${edges.filter(e => e.to.includes(id)).map(e => given(e.from)).join(', ') || 'nobody'}`}>
        <Portrait id={id} scale={2}/><span>{given(id)}</span>
      </button>)}
    </div>
  </figure>;
}

/** Share chosen (or average points) by the slot in which a candidate was listed. */
export function SlotBars({ caption, values, baseline, max, format, counts }: { caption: string; values: (number | null)[]; baseline: number; max: number; format: (v: number | null) => string; counts: number[] }) {
  return <figure className="lab-slots">
    <figcaption>{caption}</figcaption>
    <div className="lab-slot-plot">
      <span className="lab-slot-baseline" style={{ bottom: baseline / max * 100 + '%' }} aria-hidden="true"/>
      {values.map((v, i) => <div key={i} className="lab-slot" title={`Listed ${i + 1}${['st', 'nd', 'rd', 'th', 'th'][i]}: ${format(v)} over ${counts[i]} answers`}>
        <span className="lab-slot-bar" style={{ height: (v ?? 0) / max * 100 + '%' }}/>
      </div>)}
    </div>
    <div className="lab-slot-labels">{values.map((v, i) => <span key={i}><strong>{format(v)}</strong>{i + 1}{['st', 'nd', 'rd', 'th', 'th'][i]} listed</span>)}</div>
  </figure>;
}
