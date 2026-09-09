import { expect, test, type Page } from '@playwright/test';
import observer from '../fixtures/observer.json' with { type: 'json' };
import status from '../fixtures/status.json' with { type: 'json' };
import archives from '../fixtures/archives.json' with { type: 'json' };
import { RESIDENT_BY_ID } from '../../src/lib/habitat/residents';
import { FIRST_MESSAGE, LIVES_TIME, NEXT_MESSAGE, PRIVATE_GOAL, PRIVATE_MEMORY, PRIVATE_REASON,
  PUBLIC_GOAL, REPLY_MESSAGE, UPDATED_GOAL, livesFixture } from '../fixtures/lives';

async function serveLives(page: Page) {
  const fixture = livesFixture();
  const state = {
    world: { ...observer, agency: fixture.agency },
    status: { ...status, cognition: fixture.cognition, nextWatchAtMs: LIVES_TIME + 3_600_000 },
    observerReads: 0, mutations: [] as string[], foreignRequests: [] as string[],
  };
  // Every API route is fulfilled locally. An unexpected remote request is blocked.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      state.foreignRequests.push(url.origin); return route.abort();
    }
    return route.continue();
  });
  await page.route('**/v1/**', async (route) => {
    if (route.request().method() !== 'GET') { state.mutations.push(route.request().url()); return route.abort(); }
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/observer')) {
      state.observerReads++;
      const etag = `"fixture-lives-${state.world.worldRevision}"`;
      if (route.request().headers()['if-none-match'] === etag) return route.fulfill({ status: 304, headers: { etag } });
      return route.fulfill({ json: state.world, headers: { etag } });
    }
    if (url.pathname.endsWith('/status')) return route.fulfill({ json: state.status });
    if (url.pathname.endsWith('/archive')) {
      const day = Number(url.searchParams.get('day'));
      return route.fulfill({ json: archives.find((archive) => archive.day === day) ?? { day, entries: [] } });
    }
    return route.fulfill({ status: 404, json: { error: 'Unexpected local fixture route' } });
  });
  return state;
}

async function openLives(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?legacy=1');
  await expect(page.locator('.ns-head')).toContainText('Connected');
  await page.getByRole('button', { name: 'Lives', exact: true }).click();
  await expect(page.getByLabel('Read about')).toBeVisible();
}

test('Lives shows both voices and public projects while private goals, reasons and memories stay absent', async ({ page }) => {
  const state = await serveLives(page);
  for (const secret of [PRIVATE_GOAL, PRIVATE_REASON, PRIVATE_MEMORY]) expect(JSON.stringify(state.world.agency)).not.toContain(secret);
  await openLives(page);
  const lives = page.locator('.ns-lives');
  await lives.locator('.ns-projects > summary').click();
  await expect(lives).toContainText(PUBLIC_GOAL);
  await expect(lives).toContainText('1 public, 1 private');
  const dialogue = lives.locator('.ns-conversation').filter({ hasText: FIRST_MESSAGE });
  await expect(dialogue.locator('blockquote')).toHaveText([FIRST_MESSAGE, REPLY_MESSAGE]);
  await expect(dialogue.locator('.ns-conversation__turns li').nth(0)).toContainText(RESIDENT_BY_ID.A.name);
  await expect(dialogue.locator('.ns-conversation__turns li').nth(1)).toContainText(RESIDENT_BY_ID.B.name);
  await dialogue.getByRole('button', { name: RESIDENT_BY_ID.B.name, exact: true }).first().click();
  await expect(page.locator('.hab-dossier')).toContainText('This project is private.');
  for (const secret of [PRIVATE_GOAL, PRIVATE_REASON, PRIVATE_MEMORY]) await expect(page.locator('body')).not.toContainText(secret);
  expect(state.mutations).toEqual([]); expect(state.foreignRequests).toEqual([]);
});

test('resident filters and expanded details survive profile close and notebook changes', async ({ page }) => {
  const state = await serveLives(page); await openLives(page);
  const lives = page.locator('.ns-lives'), filter = page.getByLabel('Read about');
  await filter.selectOption('B');
  await lives.locator('.ns-projects > summary').click();
  await lives.locator('.ns-agreements > summary').click();
  await lives.locator('.ns-conversation > .ns-evidence > summary').click();
  await expect(lives.locator('.ns-conversation')).toHaveCount(1);
  await expect(lives).toContainText('No agreements in this selection.');
  await lives.locator('.ns-conversation__head').getByRole('button', { name: RESIDENT_BY_ID.B.name, exact: true }).click();
  await expect(page.locator('.hab-dossier__name')).toHaveText(RESIDENT_BY_ID.B.name);
  await page.getByRole('button', { name: 'Back to notebook', exact: true }).click();
  await expect(filter).toHaveValue('B');
  for (const selector of ['.ns-projects', '.ns-agreements', '.ns-conversation > .ns-evidence']) await expect(lives.locator(selector)).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await page.getByRole('button', { name: 'Lives', exact: true }).click();
  await expect(filter).toHaveValue('B');
  await expect(lives.locator('.ns-conversation > .ns-evidence')).toHaveAttribute('open', '');
  await expect(lives).toContainText('Expires at the start of day 108, watch II.');
  expect(state.mutations).toEqual([]); expect(state.foreignRequests).toEqual([]);
});

test('a fresh thought updates Lives between watches without altering the physical journal or filter', async ({ page }) => {
  await page.clock.install({ time: LIVES_TIME });
  const state = await serveLives(page); await openLives(page);
  await page.getByLabel('Read about').selectOption('A');
  await page.locator('.ns-projects > summary').click();
  const clock = await page.locator('.ns-clock').textContent();
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(page.locator('.ns-record > li').first()).toBeAttached();
  const journal = await page.locator('.ns-record').textContent();
  await page.getByRole('button', { name: 'Lives', exact: true }).click();
  const updated = livesFixture(true);
  state.world = { ...state.world, worldRevision: state.world.worldRevision + 1, agency: updated.agency };
  state.status = { ...state.status, worldRevision: state.world.worldRevision, cognition: updated.cognition };
  await page.clock.fastForward(45_001);
  await expect(page.locator('.ns-conversations')).toContainText(NEXT_MESSAGE);
  await expect(page.getByLabel('Read about')).toHaveValue('A');
  await expect(page.locator('.ns-projects')).toHaveAttribute('open', '');
  await expect(page.locator('.ns-projects')).toContainText(UPDATED_GOAL);
  await expect(page.locator('.ns-clock')).toHaveText(clock!);
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(page.locator('.ns-record')).toHaveText(journal!);
  expect(state.observerReads).toBeGreaterThan(1);
  expect(state.mutations).toEqual([]); expect(state.foreignRequests).toEqual([]);
});

for (const badPart of ['agency', 'cognition'] as const) test(`an invalid ${badPart} timestamp cannot blank the application after a successful read`, async ({ page }) => {
  await page.clock.install({ time: LIVES_TIME });
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const state = await serveLives(page); await openLives(page);
  if (badPart === 'agency') state.world = { ...state.world, worldRevision: state.world.worldRevision + 1,
    agency: { ...state.world.agency, startedAtMs: Number.MAX_SAFE_INTEGER } };
  else state.status.cognition = { ...state.status.cognition, nextOpportunityAtMs: Number.MAX_SAFE_INTEGER };
  await page.clock.fastForward(45_001);
  await expect.poll(() => state.observerReads).toBeGreaterThan(1);
  await expect(page.locator('#root > .nightshift')).toBeVisible();
  await expect(page.locator('.ns-clock')).toContainText('106');
  await expect(page.locator('.ns-conversations')).toContainText(FIRST_MESSAGE);
  await expect(page.locator('body')).not.toContainText('Invalid Date');
  if (badPart === 'agency') await expect(page.locator('.ns-head')).toContainText('Connection lost');
  else await expect(page.locator('.ns-head')).toContainText('Thoughts unknown');
  expect(errors).toEqual([]); expect(state.mutations).toEqual([]); expect(state.foreignRequests).toEqual([]);
});

for (const width of [320, 390]) test(`mobile ${width}px keeps the full header and Lives controls inside the viewport`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const state = await serveLives(page); await openLives(page);
  const bounds = await page.locator('.ns-head').evaluate((header) => {
    const h = header.getBoundingClientRect();
    return [...header.querySelectorAll('h1,.ns-clock,.ns-connection,.ns-close')].map((element) => {
      const r = element.getBoundingClientRect();
      return { label: element.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        headerBottom: h.bottom, width: innerWidth, clipsText: element.scrollWidth > element.clientWidth + 1 };
    });
  });
  for (const item of bounds) {
    expect(item.left, item.label!).toBeGreaterThanOrEqual(0);
    expect(item.right, item.label!).toBeLessThanOrEqual(item.width + 1);
    expect(item.bottom, item.label!).toBeLessThanOrEqual(item.headerBottom + 1);
    expect(item.clipsText, item.label!).toBe(false);
  }
  await expect(page.locator('.ns-connection')).toBeVisible();
  await expect(page.locator('.ns-connection__thoughts')).toBeVisible();
  await page.getByLabel('Read about').selectOption('B');
  await expect(page.locator('.ns-conversation')).toHaveCount(1);
  expect(state.mutations).toEqual([]); expect(state.foreignRequests).toEqual([]);
});
