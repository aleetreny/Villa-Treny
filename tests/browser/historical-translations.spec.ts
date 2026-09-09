import { expect, test } from '@playwright/test';
import observer from '../fixtures/observer.json' with { type: 'json' };
import status from '../fixtures/status.json' with { type: 'json' };
import matrix from '../../docs/research/release-2026-09-08/public-dialogue-translations-115.json' with { type: 'json' };
import fourth from '../../docs/research/release-2026-09-08/public-dialogue-translation-turn-280.json' with { type: 'json' };
import fifth from '../../docs/research/release-2026-09-08/public-dialogue-translation-turn-324.json' with { type: 'json' };
import sixth from '../../docs/research/release-2026-09-08/public-dialogue-translation-turn-419.json' with { type: 'json' };
import { livesFixture } from '../fixtures/lives';
import { isAgencySnapshot } from '../../src/lib/habitat/agency';
import { RESIDENT_BY_ID, type ResidentId } from '../../src/lib/habitat/residents';

const entries = [...matrix.entries, ...fourth.entries, ...fifth.entries, ...sixth.entries];

// These six messages are already public. All other observer state is the
// existing synthetic fixture; no private backup or remote service is loaded.
test('Journal and Lives show the same labelled historical translations while API fixture text stays original', async ({ page }, testInfo) => {
  const agency = livesFixture().agency;
  agency.conversations = [{ id: 'conversation:115', participants: ['P', 'V'], status: 'open', nextSpeaker: 'P',
    expiresAtMs: Math.max(...entries.map(entry => entry.atMs)) + 3_600_000, turns: entries.map(entry => ({ id: entry.turnId,
      speaker: entry.speaker as ResidentId, text: entry.sourceText, atMs: entry.atMs })) }];
  agency.offers = []; agency.agreements = []; agency.coverage.waitingForReply = ['P'];
  expect(isAgencySnapshot(agency)).toBe(true);
  const archive = { day: 107, entries: entries.map(entry => ({ day: entry.journal.day, watch: entry.journal.watch, minute: entry.journal.minute,
    room: entry.journal.room, who: entry.journal.who, text: entry.journal.sourceText, kind: 'meeting',
    speech: { speaker: entry.speaker, turnId: entry.turnId } })) };
  const original = JSON.stringify({ agency, archive });
  const world = { ...observer, snapshot: { ...observer.snapshot, day: 107, watch: 4 }, agency };
  const unexpected: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || request.method() !== 'GET') {
      unexpected.push(request.url()); return route.abort();
    }
    if (url.pathname.endsWith('/v1/observer')) return route.fulfill({ json: world });
    if (url.pathname.endsWith('/v1/status')) return route.fulfill({ json: { ...status,
      simTime: { day: 107, minute: 1080 }, nextWatchAtMs: Date.now() + 3_600_000 } });
    if (url.pathname.endsWith('/v1/archive')) return route.fulfill({ json: archive });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?legacy=1');
  await expect(page.locator('.ns-head')).toContainText('Connected');
  const journal = page.locator('.ns-record');
  await expect(journal.locator('> li')).toHaveCount(entries.length);
  await expect(journal.getByText('Pilar said', { exact: true })).toHaveCount(3);
  await expect(journal.getByText('Vero said', { exact: true })).toHaveCount(3);
  await expect(page.getByText('Spoken messages are residents’ claims. Recorded outcomes show what actually changed.', { exact: true })).toBeVisible();
  for (const entry of entries) await expect(journal).toContainText(entry.journal.translation);
  await expect(journal.getByText('English translation', { exact: true })).toHaveCount(entries.length);
  await expect(journal.getByText('English translation', { exact: true }).first()).toBeVisible();
  for (const entry of entries) await expect(journal).not.toContainText(entry.sourceText);
  const newJournalEntry = journal.locator('> li').filter({ hasText: sixth.entries[0].journal.translation });
  await expect(newJournalEntry).toContainText('18:00');
  await newJournalEntry.scrollIntoViewIfNeeded();
  await expect(newJournalEntry.getByText('English translation', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('journal-translations.png') });
  await page.getByRole('button', { name: 'Lives', exact: true }).click();
  const lives = page.locator('.ns-conversations');
  await expect(lives.locator('blockquote')).toHaveText(entries.map(entry => entry.translation));
  await expect(lives.getByText('English translation', { exact: true })).toHaveCount(entries.length);
  await expect(lives.getByText('English translation', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Read about').selectOption('P');
  await lives.locator('.ns-conversation__head').getByRole('button', { name: RESIDENT_BY_ID.P.name, exact: true }).click();
  await page.getByRole('button', { name: 'Back to notebook', exact: true }).click();
  await expect(page.getByLabel('Read about')).toHaveValue('P');
  await expect(lives.locator('blockquote')).toHaveText(entries.map(entry => entry.translation));
  await lives.locator('.ns-conversation__turns > li').last().scrollIntoViewIfNeeded();
  await expect(lives.locator('.ns-conversation__turns > li').last().getByText('English translation', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('lives-translations.png') });
  expect(JSON.stringify({ agency, archive })).toBe(original);
  expect(unexpected).toEqual([]); expect(errors).toEqual([]);
});
