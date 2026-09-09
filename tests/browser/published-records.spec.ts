import { expect, test } from '@playwright/test';
import observer from '../fixtures/observer.json' with { type: 'json' };
import status from '../fixtures/status.json' with { type: 'json' };
import { acceptCommissionFixture, publicCommissionFixture, publishFixture, recordAct } from '../../src/lib/habitat/society/records-test-fixture';
import { societyPublicView } from '../../src/lib/habitat/society/public';
import { isAgencySnapshot } from '../../src/lib/habitat/agency';
import { RESIDENT_BY_ID } from '../../src/lib/habitat/residents';

test('Lives shows exact public writings and paid commissions, preserves privacy, and reads older pages only on request', async ({ page }, testInfo) => {
  let f = publishFixture(acceptCommissionFixture(publicCommissionFixture()), 'A');
  const originalDraft = f.state.records.drafts[0], oldPublication = societyPublicView(f.state).records!.publications[0];
  f = recordAct(f, 'A', { kind: 'draft', title: 'Filter notes, second version',
    text: 'The first version recorded my visit.\nI still have no water-quality measurements.\n<em>Keep this exact text.</em>',
    refs: [oldPublication.id], parent: { draftId: originalDraft.id, contentHash: originalDraft.contentHash }, audience: 'public', publish: true },
  [{ id: oldPublication.id, audience: 'public' }]);
  f = publishFixture(f, 'A');
  f = recordAct(f, 'C', { kind: 'draft', title: 'PRIVATE_BROWSER_DOCUMENT', text: 'PRIVATE_BROWSER_CONTENT',
    refs: ['memory:PRIVATE_BROWSER_REFERENCE'], parent: null, audience: 'private', publish: false },
  [{ id: 'memory:PRIVATE_BROWSER_REFERENCE', audience: ['C'] }]);
  const full = societyPublicView(f.state), latest = full.records!.publications.at(-1)!;
  const agency = { ...full, records: { ...full.records!, publications: [latest] } };
  expect(isAgencySnapshot(agency)).toBe(true);
  expect(JSON.stringify(agency)).not.toContain('PRIVATE_BROWSER_');
  const before = JSON.stringify({ f, agency });
  const errors: string[] = [], unexpected: string[] = [], archiveRequests: string[] = [];
  let failFirst = true;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || request.method() !== 'GET') {
      unexpected.push(request.url()); return route.abort();
    }
    if (url.pathname.endsWith('/v1/observer')) return route.fulfill({ json: { ...observer, agency } });
    if (url.pathname.endsWith('/v1/status')) return route.fulfill({ json: { ...status, nextWatchAtMs: Date.now() + 3_600_000 } });
    if (url.pathname.endsWith('/v1/archive')) return route.fulfill({ json: { day: 106, entries: [] } });
    if (url.pathname.endsWith('/v1/records')) {
      archiveRequests.push(url.search);
      if (failFirst) { failFirst = false; return route.fulfill({ json: { entries: [{ ...latest, audience: 'C' }], nextCursor: 3 } }); }
      return route.fulfill({ json: url.searchParams.has('before')
        ? { entries: [], nextCursor: null } : { entries: [latest, oldPublication], nextCursor: 3 } });
    }
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?legacy=1'); await expect(page.locator('.ns-head')).toContainText('Connected');
  await page.getByRole('button', { name: 'Lives', exact: true }).click();
  await page.getByLabel('Read about').selectOption('A');
  const writings = page.locator('.ns-publications'), commissions = page.locator('.ns-document-commissions');
  await writings.locator('> summary').click();
  await expect(writings.locator('.ns-publication')).toHaveCount(1);
  await expect(writings.locator('.ns-publication__text')).toHaveText(latest.text);
  await expect(writings.locator('.ns-publication__text em')).toHaveCount(0);
  await expect(writings).toContainText('do not verify their claims or imply approval or payment');
  expect(archiveRequests).toEqual([]);
  await writings.locator('.ns-evidence > summary').click();
  await expect(writings).toContainText(latest.contentHash);
  await expect(writings).toContainText(oldPublication.id);
  await writings.getByRole('button', { name: 'Browse writing archive', exact: true }).click();
  await expect(writings).toContainText('The writing archive could not be read.');
  await expect(writings.locator('.ns-publication')).toHaveCount(1);
  await writings.getByRole('button', { name: 'Browse writing archive', exact: true }).click();
  await expect(writings.locator('.ns-publication')).toHaveCount(2);
  await expect(writings.locator('.ns-publication__text').last()).toHaveText(oldPublication.text);
  await writings.getByRole('button', { name: 'Earlier writings', exact: true }).click();
  await expect(writings).toContainText('Start of the public writing archive reached.');
  expect(archiveRequests).toEqual(['?limit=20', '?limit=20', '?limit=20&before=3']);
  await writings.getByRole('button', { name: RESIDENT_BY_ID.A.name, exact: true }).first().click();
  await page.getByRole('button', { name: 'Back to notebook', exact: true }).click();
  await expect(page.getByLabel('Read about')).toHaveValue('A');
  await expect(writings.locator('.ns-publication')).toHaveCount(2);
  await expect(writings).toHaveAttribute('open', '');
  await expect(page.locator('body')).not.toContainText('PRIVATE_BROWSER_');
  await writings.locator('.ns-publication').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('public-writings.png') });
  await commissions.locator('> summary').click();
  await expect(commissions).toContainText('Publication commission fulfilled');
  await expect(commissions).toContainText('Payment recorded: 3 cells.');
  await expect(commissions).toContainText('It does not endorse the text’s claims.');
  await commissions.locator('li').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('publication-commission.png') });
  expect(JSON.stringify({ f, agency })).toBe(before);
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
});
