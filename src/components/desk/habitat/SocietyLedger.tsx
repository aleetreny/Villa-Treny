import { RESIDENT_BY_ID, type ResidentId } from '../../../lib/habitat/residents';
import type { SocietySnapshot } from '../../../lib/habitat/society';
import type { Debt } from '../../../lib/habitat/engine/economy';

const WATCH = ['', 'I', 'II', 'III', 'IV'] as const;
const amount = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const CONDITIONS = [
  ['rested', 'Rest'], ['fed', 'Food'], ['well', 'Health'],
  ['safe', 'Safety'], ['accompanied', 'Company'],
] as const;

type LedgerProps = {
  society: SocietySnapshot | null;
  day: number;
  watch: number;
  onOpen: (id: ResidentId) => void;
};

function PersonLink({ id, onOpen }: { id: ResidentId; onOpen: LedgerProps['onOpen'] }) {
  return <button type="button" className="ns-ledger__person" onClick={() => onOpen(id)}
    aria-label={`Open ${RESIDENT_BY_ID[id].name}’s profile`}>{RESIDENT_BY_ID[id].name}</button>;
}

function LoanList({ debts, onOpen }: { debts: readonly Debt[]; onOpen: LedgerProps['onOpen'] }) {
  return <ul className="ns-loans">{debts.map((debt) => (
    <li key={debt.id}>
      <p><PersonLink id={debt.borrower} onOpen={onOpen} /> owes <PersonLink id={debt.lender} onOpen={onOpen} />.</p>
      <p><b>{amount.format(debt.remaining)} cells remain</b> of {amount.format(debt.principal)} borrowed.</p>
      <p className="ns-ledger__note"><span className={debt.status === 'overdue' ? 'ns-loans__overdue' : ''}>{debt.status === 'overdue' ? 'Overdue' : 'Open'}</span>
        {' · '}Due day {debt.dueDay} · Agreed day {debt.issuedDay}</p>
    </li>
  ))}</ul>;
}

export function SocietyLedger({ society, day, watch, onOpen }: LedgerProps) {
  const debts = society?.debts.filter((debt) => debt.remaining > 0) ?? [];
  const wallets = society?.balances.reduce((total, person) => total + person.cells, 0) ?? 0;
  return (
    <details className="ns-ledger">
      <summary>Shared stores &amp; obligations</summary>
      {!society ? <p className="ns-ledger__note">The shared ledger is not available yet.</p> : (
        <div className="ns-ledger__body">
          <p className="ns-ledger__date">Current account · Day {day} · Watch {WATCH[watch]}</p>
          <p className="ns-ledger__note">Recorded since day {society.startedOnDay}. This account stays at the current watch when you read an earlier journal.</p>

          <h3>In the shared stores</h3>
          <dl className="ns-account">
            <div><dt>Produce</dt><dd>{amount.format(society.stock.produce)}</dd></div>
            <div><dt>Prepared meals</dt><dd>{amount.format(society.stock.meals)}</dd></div>
            <div><dt>Clean water</dt><dd>{amount.format(society.stock.water)}</dd></div>
            <div><dt>Repair materials</dt><dd>{amount.format(society.stock.materials)}</dd></div>
            <div><dt>Shared maintenance</dt><dd>{amount.format(society.maintenance)} / 100</dd></div>
            <div><dt>Treasury</dt><dd>{amount.format(society.treasury)} cells</dd></div>
          </dl>
          <p className="ns-ledger__note">Water sustains the growing trays and cooking. Produce becomes meals; recovered materials make repairs possible. Repairs raise maintenance as the habitat wears down. Unpowered rooms or low maintenance reduce output; manual repairs use materials and restore less maintenance.</p>
          <p className="ns-ledger__note">Eating uses a meal and water; its charge payment returns to the treasury. Urgently hungry residents can receive a meal even when they cannot pay the full fee.</p>

          <h3>Outstanding loans</h3>
          {debts.length ? <LoanList debts={debts} onOpen={onOpen} /> : <p className="ns-ledger__note">No charge cells are currently owed between residents.</p>}

          <details className="ns-ledger__section">
            <summary>The {society.balances.length} accounts</summary>
            <p className="ns-ledger__note">Charge cells can be used or passed on. Today’s work credits record completed work; they are not cells already paid. At the day’s close, a limited treasury payment is divided in proportion to those credits.</p>
            <table className="ns-balances">
              <caption>Cells held and work credited today</caption>
              <thead><tr><th scope="col">Resident</th><th scope="col">Cells</th><th scope="col">Work credits</th></tr></thead>
              <tbody>{society.balances.map((person) => <tr key={person.id}>
                <th scope="row"><PersonLink id={person.id} onOpen={onOpen} /></th>
                <td>{amount.format(person.cells)}</td><td>{amount.format(person.workCreditsToday)}</td>
              </tr>)}</tbody>
            </table>
          </details>

          <details className="ns-ledger__section">
            <summary>Where the charge went</summary>
            <p className="ns-ledger__note">The opening total records cells already held when this ledger began. Surplus power adds cells; use and leakage remove them. Gifts, loans and pay move cells between holders.</p>
            <dl className="ns-account">
              <div><dt>Opening cells</dt><dd>{amount.format(society.ledger.initialCells)}</dd></div>
              <div><dt>+ Minted from power</dt><dd>{amount.format(society.ledger.minted)}</dd></div>
              <div><dt>− Consumed</dt><dd>{amount.format(society.ledger.burned)}</dd></div>
              <div><dt>− Leaked</dt><dd>{amount.format(society.ledger.leaked)}</dd></div>
              <div className="ns-account__total"><dt>Cells still held</dt><dd>{amount.format(wallets + society.treasury)}</dd></div>
              <div><dt>Held by residents</dt><dd>{amount.format(wallets)}</dd></div>
              <div><dt>Held in treasury</dt><dd>{amount.format(society.treasury)}</dd></div>
            </dl>
            <p className="ns-ledger__note">Opening + minted − consumed − leaked = residents’ cells + treasury. Figures are rounded to two decimal places.</p>
          </details>
        </div>
      )}
    </details>
  );
}

export function ResidentMeans({ id, society, day, watch, onOpen }: LedgerProps & { id: ResidentId }) {
  const balance = society?.balances.find((person) => person.id === id);
  const debts = society?.debts.filter((debt) => debt.remaining > 0 && (debt.borrower === id || debt.lender === id)) ?? [];
  return <article className="hab-block ns-means">
    <h3 className="hab-block__head">Means &amp; needs</h3>
    {!balance ? <p className="hab-block__body--quiet">The shared ledger is not available yet.</p> : <>
      <p className="ns-ledger__date">Day {day} · Watch {WATCH[watch]}</p>
      <dl className="ns-account">
        <div><dt>Charge cells held</dt><dd>{amount.format(balance.cells)}</dd></div>
        <div><dt>Work credits today</dt><dd>{amount.format(balance.workCreditsToday)}</dd></div>
      </dl>
      <p className="ns-ledger__note">Work credits await the day’s settlement; the payment depends on the shared treasury.</p>
      {debts.length ? <LoanList debts={debts} onOpen={onOpen} /> : <p className="ns-ledger__note">No outstanding loans, borrowed or lent.</p>}
      <dl className="ns-account ns-means__conditions">{CONDITIONS.map(([key, label]) => (
        <div key={key}><dt>{label}</dt><dd>{amount.format(balance.conditions[key])} / 100</dd></div>
      ))}</dl>
      <p className="ns-ledger__note">Higher means less immediate need. These conditions put pressure on the choices this person makes.</p>
    </>}
  </article>;
}
