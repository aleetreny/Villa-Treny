import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SocietyLedger, ResidentMeans } from '../../components/desk/habitat/SocietyLedger';
import { genesisState } from './engine/state';
import { worldSociety } from './society';
import { RESIDENTS } from './residents';

function recordedSociety() {
  const state = genesisState();
  state.economy.startedOnDay = 106;
  state.bodies.Q.cells = 7.75;
  state.bodies.Q.condition.rested = 12;
  state.economy.workCredits.Q = 3;
  state.economy.debts = [
    { id: '106-1-WQ', lender: 'W', borrower: 'Q', principal: 4, remaining: 2,
      issuedDay: 106, dueDay: 111, status: 'overdue' },
    { id: '106-1-AB', lender: 'A', borrower: 'B', principal: 4, remaining: 0,
      issuedDay: 106, dueDay: 111, status: 'paid' },
  ];
  state.economy.ledger.initialCells = Object.values(state.bodies).reduce((sum, body) => sum + body.cells, 0);
  return worldSociety(state);
}

const onOpen = () => undefined;

describe('the observer reads the committed shared ledger', () => {
  it('does not present invented balances when the runtime has no shared ledger', () => {
    const markup = renderToStaticMarkup(createElement(SocietyLedger, { society: null, day: 112, watch: 3, onOpen }));
    expect(markup).toContain('The shared ledger is not available yet.');
    expect(markup).not.toContain('Opening cells');
    expect(markup).not.toContain('Prepared meals');
    expect(markup).not.toContain('<table');
  });

  it('dates the current account separately from when material accounting began', () => {
    const markup = renderToStaticMarkup(createElement(SocietyLedger, { society: recordedSociety(), day: 112, watch: 3, onOpen }));
    expect(markup).toContain('Current account · Day 112 · Watch III');
    expect(markup).toContain('Recorded since day 106.');
    expect(markup).toContain('current watch when you read an earlier journal');
  });

  it('shows every resident’s recorded account and distinguishes unpaid work from cells', () => {
    const markup = renderToStaticMarkup(createElement(SocietyLedger, { society: recordedSociety(), day: 112, watch: 3, onOpen }));
    for (const person of RESIDENTS) expect(markup).toContain(`>${person.name}</button>`);
    expect(markup).toContain('they are not cells already paid');
    expect(markup).toContain('in proportion to those credits');
    expect(markup).toContain('Opening + minted − consumed − leaked = residents’ cells + treasury');
  });

  it('keeps remaining principal and overdue status, without reopening paid loans', () => {
    const markup = renderToStaticMarkup(createElement(SocietyLedger, { society: recordedSociety(), day: 112, watch: 3, onOpen }));
    const loans = markup.slice(markup.indexOf('<ul class="ns-loans">'), markup.indexOf('</ul>'));
    expect(loans).toContain('Quim Bassols');
    expect(loans).toContain('Wen Jiaming');
    expect(loans).toContain('2 cells remain</b> of 4 borrowed.');
    expect(loans).toContain('Overdue');
    expect(loans).toContain('Due day 111 · Agreed day 106');
    expect(loans).not.toContain('Ama Oyelaran');
    expect(loans).not.toContain('Bex Ferreira');
  });

  it('shows the selected person’s balance, needs and loans from the same account', () => {
    const markup = renderToStaticMarkup(createElement(ResidentMeans, { id: 'Q', society: recordedSociety(), day: 112, watch: 3, onOpen }));
    expect(markup).toContain('Charge cells held</dt><dd>7.75');
    expect(markup).toContain('Work credits today</dt><dd>3');
    expect(markup).toContain('Rest</dt><dd>12 / 100');
    expect(markup).toContain('Wen Jiaming');
    expect(markup).toContain('Overdue');
    expect(markup).not.toContain('No outstanding loans');
  });
});
