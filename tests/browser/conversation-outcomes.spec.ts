import { expect, test } from '@playwright/test';
import observer from '../fixtures/observer.json' with { type: 'json' };
import status from '../fixtures/status.json' with { type: 'json' };
import receipt from '../../docs/research/release-2026-09-08/first-protocol4-groq-receipt-1542.json' with { type: 'json' };
import { livesFixture } from '../fixtures/lives';
import { isAgencySnapshot, type AgencySnapshot } from '../../src/lib/habitat/agency';
import { RESIDENT_BY_ID } from '../../src/lib/habitat/residents';

test('Quim and Gita’s unpaid proposal appears beside the public claim in Recorded outcome', async ({ page }, testInfo) => {
  // Existing synthetic observer plus two already-public turns and their actual
  // open offer. This local fixture is not a new production snapshot or replay.
  const agency = livesFixture().agency;
  agency.conversations = [{ id: 'conversation:59', participants: ['G', 'Q'], status: 'open', nextSpeaker: 'G',
    expiresAtMs: 1788961544279, turns: [
      { id: 'turn:201', speaker: 'G', text: "I'll take the repair shift; could you transfer the cells you mentioned?", atMs: 1788879819981 },
      { id: receipt.publicConsequence.turn.id, speaker: 'Q', text: receipt.publicConsequence.turn.text, atMs: receipt.publicConsequence.turn.atMs },
    ] }];
  agency.offers = [receipt.publicConsequence.offer as AgencySnapshot['offers'][number]];
  agency.agreements = []; agency.coverage.waitingForReply = ['G'];
  expect(isAgencySnapshot(agency)).toBe(true);
  const before = JSON.stringify(agency), world = { ...observer, snapshot: { ...observer.snapshot, day: 107 }, agency };
  const unexpected: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || request.method() !== 'GET') {
      unexpected.push(request.url()); return route.abort();
    }
    if (url.pathname.endsWith('/v1/observer')) return route.fulfill({ json: world });
    if (url.pathname.endsWith('/v1/status')) return route.fulfill({ json: { ...status, nextWatchAtMs: Date.now() + 3_600_000 } });
    if (url.pathname.endsWith('/v1/archive')) return route.fulfill({ json: { day: 107, entries: [] } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?legacy=1'); await expect(page.locator('.ns-head')).toContainText('Connected');
  await page.getByRole('button', { name: 'Lives', exact: true }).click();
  await page.getByLabel('Read about').selectOption('Q');
  const conversation = page.locator('.ns-conversation'), outcome = conversation.getByRole('region', { name: 'Recorded outcome' });
  await expect(conversation.locator('blockquote').last()).toHaveText(receipt.publicConsequence.turn.text);
  await expect(outcome).toContainText(`Proposed: ${RESIDENT_BY_ID.Q.name} would give 2 cells to ${RESIDENT_BY_ID.G.name}.`);
  await expect(outcome).toContainText(`Awaiting ${RESIDENT_BY_ID.G.name}’s acceptance.`);
  await expect(outcome).toContainText('No transfer is recorded for this proposal.');
  await expect(outcome).not.toContainText('Transferred:'); await expect(outcome).not.toContainText('Payment recorded:');
  await outcome.locator('summary').click(); await expect(outcome).toContainText('offer:266');
  await outcome.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('quim-gita-recorded-outcome.png') });
  await conversation.locator('.ns-conversation__head').getByRole('button', { name: RESIDENT_BY_ID.Q.name, exact: true }).click();
  await page.getByRole('button', { name: 'Back to notebook', exact: true }).click();
  await expect(page.getByLabel('Read about')).toHaveValue('Q'); await expect(outcome).toContainText('offer:266');
  expect(JSON.stringify(agency)).toBe(before); expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
