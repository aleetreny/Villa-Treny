import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isAgencySnapshot, isCognitionStatus, type AgencySnapshot, type CognitionStatus } from './agency';
import { RESIDENTS } from './residents';
import { isObserverState, fetchHabitatStatus, type RuntimeStatus } from './live';
import { genesisSnapshot } from './snapshot';
import { edges } from './weave';
import { AgencyNotebook, ResidentAgency } from '../../components/desk/habitat/AgencyNotebook';
import { LiveStatus, worldClockLabel } from '../../components/desk/habitat/LiveStatus';
import { AgencyTime, thoughtStatusLabel } from '../../components/desk/habitat/ResidentThoughts';

const now = 1_789_200_000_000;
const onOpen = () => {};

/** Synthetic public records for boundary/UI tests; never used as a UI fallback. */
function fixture(): AgencySnapshot {
  return {
    version: 1, revision: 3, startedAtMs: now - 10_000,
    residents: RESIDENTS.map(({ id }) => ({ id, lastAttemptAtMs: id === 'A' ? now : null, lastSuccessAtMs: id === 'A' ? now : null,
      project: id === 'A' ? { id: 'project:public', visibility: 'public', goal: 'Restore the shared water filter.', status: 'active', completedSteps: 1, totalSteps: 2 }
        : id === 'B' ? { id: 'project:private', visibility: 'private', goal: null, status: 'active', completedSteps: 0, totalSteps: 1 } : null })),
    conversations: [{ id: 'conversation:1', participants: ['A', 'B'], status: 'open', nextSpeaker: 'A', expiresAtMs: now + 60_000,
      turns: [{ id: 'turn:1', speaker: 'A', text: 'Can you inspect the filter with me?', atMs: now - 1000 },
        { id: 'turn:2', speaker: 'B', text: 'I can inspect it, but I cannot promise materials.', atMs: now }] }],
    offers: [{ id: 'offer:1', conversationId: 'conversation:1', proposer: 'B', counterpart: 'A',
      terms: { kind: 'loan', from: 'B', to: 'A', cells: 2, dueDay: 110 }, status: 'open', expiresAtWatch: 433, replaces: null }],
    agreements: [{ id: 'agreement:work', offerId: 'offer:old', participants: ['A', 'C'],
      terms: { kind: 'work', worker: 'A', payer: 'C', cells: 3, verb: 'repair', room: 'workshops', units: 2, dueWatch: 435 },
      status: 'active', progress: 1, acceptedAtMs: now - 3000, completedAtMs: null, debtId: null, evidenceIds: ['economic:repair:1'] }],
    coverage: { total: 25, neverThought: 24, waitingForReply: ['A'] },
  };
}

function cognition(): CognitionStatus {
  return { health: 'degraded', successfulLastWatch: 1, total: 25, neverThought: 24,
    lastSuccessfulThoughtAtMs: now, nextOpportunityAtMs: now + 1000, pendingResidents: ['B', 'C'], waitingForReply: ['A'] };
}

function concurrentFixture(): AgencySnapshot {
  const agency = fixture();
  for (const [speaker, suffix] of [['C', '2'], ['D', '3']] as const) agency.conversations.push({
    id: `conversation:${suffix}`, participants: [speaker, 'A'], status: 'open', nextSpeaker: 'A', expiresAtMs: now + 60_000,
    turns: [{ id: `turn:${suffix}0`, speaker, text: `A separate proposal from ${speaker}.`, atMs: now }],
  });
  return agency;
}

function status(): RuntimeStatus {
  return { mode: 'running', health: 'healthy', pauseReason: null, worldRevision: 3, residentCapacity: 25,
    simTime: { day: 108, minute: 360 }, nextWatchAtMs: now + 360_000, lastRun: { runId: 'physical:1', committedAtMs: now },
    providers: { recentAttempts: [] }, cognition: cognition() };
}

describe('public resident agency boundary', () => {
  it('accepts the full projection next to existing economic/world contracts and preserves older observers', () => {
    const base = { worldRevision: 3, snapshot: genesisSnapshot(), relationships: edges() };
    expect(isAgencySnapshot(fixture())).toBe(true);
    expect(isObserverState(base)).toBe(true);
    expect(isObserverState({ ...base, agency: fixture() })).toBe(true);
  });

  it('rejects private goals, motives, memories and accidental private-mind fields', () => {
    const secret = fixture(); secret.residents.find(({ id }) => id === 'B')!.project!.goal = 'Private reason must not cross the public edge.';
    expect(isAgencySnapshot(secret)).toBe(false);
    const why = fixture(); Object.assign(why.residents[0]!.project!, { why: 'Private motive' });
    expect(isAgencySnapshot(why)).toBe(false);
    const memory = fixture(); Object.assign(memory.residents[0]!, { reflections: [{ text: 'Private thought' }] });
    expect(isAgencySnapshot(memory)).toBe(false);
    expect(isAgencySnapshot({ ...fixture(), minds: {} })).toBe(false);
    const attention = fixture(); Object.assign(attention.conversations[0]!, { attentionThrough: [1, 1] });
    expect(isAgencySnapshot(attention)).toBe(false);
    const selected = fixture(); Object.assign(selected.residents[0]!, { chosenAttention: 'conversation:1' });
    expect(isAgencySnapshot(selected)).toBe(false);
  });

  it('counts a resident once across three available replies and rejects incomplete or duplicated coverage', () => {
    const agency = concurrentFixture();
    expect(isAgencySnapshot(agency)).toBe(true);
    for (const waitingForReply of [[], ['A', 'A'], ['A', 'B'], ['B']] as const)
      expect(isAgencySnapshot({ ...agency, coverage: { ...agency.coverage, waitingForReply } })).toBe(false);
    expect(isCognitionStatus({ ...cognition(), waitingForReply: ['A'] })).toBe(true);
    expect(isCognitionStatus({ ...cognition(), waitingForReply: ['A', 'A'] })).toBe(false);
  });

  it('rejects unknown voices, inconsistent participants, duplicate residents and fictitious progress', () => {
    const voice = fixture(); voice.conversations[0]!.turns[0]!.speaker = 'C';
    expect(isAgencySnapshot(voice)).toBe(false);
    const duplicate = fixture(); duplicate.residents[1]!.id = duplicate.residents[0]!.id;
    expect(isAgencySnapshot(duplicate)).toBe(false);
    const waiting = fixture(); waiting.coverage.waitingForReply = ['B'];
    expect(isAgencySnapshot(waiting)).toBe(false);
    const agreement = fixture(); agreement.agreements[0]!.participants = ['A', 'B'];
    expect(isAgencySnapshot(agreement)).toBe(false);
    const progress = fixture(); progress.agreements[0]!.progress = 2;
    expect(isAgencySnapshot(progress)).toBe(false);
    const clock = fixture(); clock.startedAtMs = Infinity;
    expect(isAgencySnapshot(clock)).toBe(false);
  });

  it('validates cognition separately from physical health and rejects impossible coverage', async () => {
    expect(isCognitionStatus(cognition())).toBe(true);
    expect(isCognitionStatus({ ...cognition(), lastErrorCode: 'context_overflow' })).toBe(true);
    expect(isCognitionStatus({ ...cognition(), lastErrorCode: null })).toBe(true);
    expect(isCognitionStatus({ ...cognition(), successfulLastWatch: 26 })).toBe(false);
    expect(isCognitionStatus({ ...cognition(), pendingResidents: ['Z'] })).toBe(false);
    expect(isCognitionStatus({ ...cognition(), nextOpportunityAtMs: NaN })).toBe(false);
    const fetcher = (async () => new Response(JSON.stringify(status()))) as typeof fetch;
    await expect(fetchHabitatStatus('https://fixture.example', { fetcher })).resolves.toEqual(status());
    const malformed = (async () => new Response(JSON.stringify({ ...status(), cognition: { ...cognition(), total: 24 } }))) as typeof fetch;
    await expect(fetchHabitatStatus('https://fixture.example', { fetcher: malformed })).rejects.toThrow();
  });

  it('rejects integers outside the Date range and renders unknown times defensively', () => {
    const agency = fixture(); agency.startedAtMs = Number.MAX_SAFE_INTEGER;
    expect(isAgencySnapshot(agency)).toBe(false);
    expect(isCognitionStatus({ ...cognition(), nextOpportunityAtMs: Number.MAX_SAFE_INTEGER })).toBe(false);
    expect(renderToStaticMarkup(createElement(AgencyTime, { atMs: Number.MAX_SAFE_INTEGER }))).toContain('Time unavailable');
  });
});

describe('the Lives notebook', () => {
  it('shows each recorded voice with timestamps, the next speaker and genuine work evidence', () => {
    const html = renderToStaticMarkup(createElement(AgencyNotebook, { agency: fixture(), cognition: cognition(), onOpen }));
    expect(html).toContain('Can you inspect the filter with me?');
    expect(html).toContain('I can inspect it, but I cannot promise materials.');
    expect(html).toContain('dateTime=');
    expect(html).toContain('A reply is available to');
    expect(html).toContain('economic:repair:1');
    expect(html).toContain('1 of 2 agreed actions recorded.');
    expect(html).toContain('Awaiting a response');
    expect(html).toContain('would lend');
    expect(html).toContain('Repayment due day 110.');
    expect(html).toContain('Expires at the start of day 108, watch II.');
    expect(html).toContain('Projects · 1 public, 1 private');
    expect(html).toContain('Restore the shared water filter.');
    expect(html).not.toContain('Private motive');
  });

  it('retains all concurrent conversations and describes replies as a choice', () => {
    const agency = concurrentFixture(), before = structuredClone(agency);
    const html = renderToStaticMarkup(createElement(AgencyNotebook, { agency, cognition: cognition(), onOpen }));
    expect(html.match(/class="ns-conversation"/g)).toHaveLength(3);
    for (const conversation of agency.conversations) {
      expect(html).toContain(`<code>${conversation.id}</code>`);
      for (const turn of conversation.turns) expect(html).toContain(turn.text);
    }
    expect(html).toContain('1 resident with a reply available');
    expect(html).toContain('Residents can choose a conversation or work on their own project.');
    expect(html).not.toContain('next to reply');
    expect(html).not.toContain('Waiting for');
    expect(agency).toEqual(before);
  });

  it('keeps accepted work visible after a channel closes without inventing a farewell or cancellation', () => {
    const agency = concurrentFixture(), conversation = agency.conversations[1]!;
    conversation.status = 'closed'; conversation.nextSpeaker = null;
    const terms = agency.agreements[0]!.terms;
    agency.offers.push({ id: 'offer:old', conversationId: conversation.id, proposer: 'C', counterpart: 'A',
      terms, status: 'accepted', expiresAtWatch: 433, replaces: null });
    const before = structuredClone(agency);
    expect(isAgencySnapshot(agency)).toBe(true);
    const html = renderToStaticMarkup(createElement(AgencyNotebook, { agency, cognition: null, onOpen }));
    expect(html).toContain('<small>Closed</small>');
    expect(html).toContain('Work accepted:');
    expect(html).toContain('1 of 2 agreed actions recorded.');
    expect(html).toContain('Completion payment of 3 cells is not recorded.');
    expect(html.match(/A reply is available to/g)).toHaveLength(2);
    expect(html.match(/<blockquote>/g)).toHaveLength(4);
    expect(html).not.toContain('cancelled');
    expect(agency).toEqual(before);
  });

  it('keeps private goals hidden defensively and does not equate steps with achievement', () => {
    const agency = fixture();
    agency.residents.find(({ id }) => id === 'B')!.project!.goal = 'SECRET_GOAL';
    const privateHtml = renderToStaticMarkup(createElement(ResidentAgency, { id: 'B', agency }));
    expect(privateHtml).toContain('This project is private.');
    expect(privateHtml).not.toContain('SECRET_GOAL');
    agency.residents.find(({ id }) => id === 'A')!.project!.status = 'steps_finished';
    const publicHtml = renderToStaticMarkup(createElement(ResidentAgency, { id: 'A', agency }));
    expect(publicHtml).toContain('do not by themselves prove the broader goal was achieved');
  });

  it('renders payment still due distinctly from a fulfilled work agreement', () => {
    const agency = fixture(); agency.agreements[0]!.status = 'payment_due';
    const html = renderToStaticMarkup(createElement(AgencyNotebook, { agency, cognition: null, onOpen }));
    expect(html).toContain('Work completed · payment still due');
    expect(html).not.toContain('Fulfilled');
  });

  it('does not invent conversations, projects or thought coverage when data is missing', () => {
    const html = renderToStaticMarkup(createElement(AgencyNotebook, { agency: null, cognition: null, onOpen }));
    expect(html).toContain('Projects and conversations are not available yet');
    expect(html).toContain('Thought activity is not available');
    expect(html).not.toContain('Can you inspect');
    expect(html).not.toContain('0 of 25');
  });

  it('exposes delayed cognition while the physical world and transport are healthy', () => {
    expect(worldClockLabel(status())).toBe('World running');
    expect(thoughtStatusLabel(cognition())).toBe('Thoughts delayed');
    expect(thoughtStatusLabel(null)).toBe('Thoughts unknown');
    const html = renderToStaticMarkup(createElement(LiveStatus, {
      connection: 'live', status: status(), error: null, statusError: null, lastConnectedAt: now, refresh: () => {},
    }));
    expect(html).toContain('Connected');
    expect(html).toContain('World running');
    expect(html).toContain('Thoughts delayed');
    expect(html).toContain('1 of 25');
    expect(html).toContain('past six hours');
    expect(html).toContain('Next physical watch:');
    expect(html).toContain('Next opportunity:');
  });
});
