import { expect, test, type Page } from '@playwright/test';
import observer from '../fixtures/observer.json' with { type: 'json' };
import initialStatus from '../fixtures/status.json' with { type: 'json' };
import archives from '../fixtures/archives.json' with { type: 'json' };

async function serveWorld(page: Page, options: { offline?: boolean; statusFailure?: boolean; paused?: boolean; archiveFailure?: boolean } = {}) {
  const mutations: string[] = [];
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') { mutations.push(request.url()); return route.abort(); }
    if (options.offline) return route.abort('failed');
    const url = new URL(request.url());
    if (url.pathname.endsWith('/status')) {
      if (options.statusFailure) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      return route.fulfill({ json: { ...initialStatus, nextWatchAtMs: Date.now() + 3_600_000,
        ...(options.paused ? { mode: 'paused', pauseReason: 'maintenance' } : {}),
      } });
    }
    if (url.pathname.endsWith('/observer')) {
      const etag = '"habitat-observer-26"';
      if (request.headers()['if-none-match'] === etag) return route.fulfill({ status: 304, headers: { etag } });
      return route.fulfill({ json: observer, headers: { etag } });
    }
    if (url.pathname.endsWith('/archive')) {
      if (options.archiveFailure) return route.abort('failed');
      const day = Number(url.searchParams.get('day'));
      return route.fulfill({ json: archives.find((archive) => archive.day === day) ?? { day, entries: [] } });
    }
    return route.fulfill({ status: 404, json: { error: 'Unexpected test API request' } });
  });
  return mutations;
}

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('.ns-head')).toContainText('Connected');
  await expect(page.locator('.room-view__world')).toHaveClass(/is-ready/);
}

test('all 45 rooms load at an integer fit, with only the active scene rendered', async ({ page }) => {
  test.setTimeout(90_000);
  const mutations = await serveWorld(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  await ready(page);
  const select = page.getByLabel('Go to a room');
  const ids = await select.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(ids).toHaveLength(45);
  for (const id of ids) {
    await select.selectOption(id);
    await expect(page.locator('.room-view')).toHaveAttribute('data-room', id);
    await expect(page.locator('.room-view__world')).toHaveClass(/is-ready/);
    await expect(page.locator('.room-view__world > img')).toHaveCount(1);
    const geometry = await page.locator('.room-view__world > img').evaluate((image) => {
      const r = image.getBoundingClientRect();
      const viewport = image.closest('.room-view')!.getBoundingClientRect();
      const native = image as HTMLImageElement;
      return { complete: native.complete, width: native.naturalWidth, zoom: r.width / native.naturalWidth,
        inside: r.left >= viewport.left - 1 && r.right <= viewport.right + 1 && r.top >= viewport.top - 1 && r.bottom <= viewport.bottom + 1,
        rendering: getComputedStyle(image).imageRendering };
    });
    expect(geometry.complete, id).toBe(true);
    expect(geometry.width, id).toBeGreaterThan(0);
    expect(Number.isInteger(geometry.zoom), id).toBe(true);
    expect(geometry.inside, id).toBe(true);
    expect(geometry.rendering, id).toBe('pixelated');
  }
  expect(errors).toEqual([]);
  expect(mutations).toEqual([]);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
});

test('room camera survives Weave and profiles retain their identity', async ({ page }) => {
  await serveWorld(page);
  await ready(page);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoom = await page.getByRole('button', { name: 'Fit room to view' }).textContent();
  await page.getByRole('button', { name: 'Weave', exact: true }).click();
  await expect(page.locator('.weave__node')).toHaveCount(25);
  await page.getByRole('button', { name: 'Matrix', exact: true }).click();
  await expect(page.locator('.weave')).toContainText('Ama');
  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fit room to view' })).toHaveText(zoom!);
  await page.getByRole('button', { name: 'The 25', exact: true }).click();
  await page.getByPlaceholder('Name or room').fill('Quim');
  await expect(page.locator('.ns-roster li')).toHaveCount(1);
  await page.locator('.ns-roster li button').click();
  await expect(page.locator('.hab-dossier__name')).toContainText('Quim');
  await expect(page.locator('.hab-dossier')).toContainText('Lior');
  await expect(page.locator('.hab-dossier')).toContainText('Wen');
  await page.keyboard.press('Escape');
  await expect(page.locator('.hab-dossier')).toHaveCount(0);
  await expect(page.locator('.nightshift')).toBeVisible();
});

test('Matrix arrow keys move focus, skip the diagonal and expose both saved directions', async ({ page }) => {
  await serveWorld(page);
  await ready(page);
  await page.getByRole('button', { name: 'Weave', exact: true }).click();
  await page.getByRole('button', { name: 'Matrix', exact: true }).click();
  const cells = page.locator('.weave__stage--matrix rect[role="button"]');
  await expect(cells).toHaveCount(600);
  const focusStop = page.locator('.weave__stage--matrix rect[tabindex="0"]');
  await expect(focusStop).toHaveCount(1);
  await expect(focusStop).toHaveAttribute('data-pair', 'AB');
  await focusStop.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-pair="AC"]')).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveValue('A');
  await expect(page.getByRole('combobox', { name: 'To', exact: true })).toHaveValue('C');
  const forward = observer.relationships.find((edge) => edge.from === 'A' && edge.to === 'C')!.axes.trust;
  const reverse = observer.relationships.find((edge) => edge.from === 'C' && edge.to === 'A')!.axes.trust;
  await expect(page.locator('.weave__matrix-value')).toContainText(`Ama Oyelaran → Cato Lindqvist: trust ${forward}. In return: ${reverse}.`);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-pair="AB"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-pair="AY"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-pair="BY"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(focusStop).toHaveCount(1);
  await expect(focusStop).toHaveAttribute('data-pair', 'BY');
  await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveValue('B');
  await expect(page.getByRole('combobox', { name: 'To', exact: true })).toHaveValue('Y');
  await page.keyboard.press('Tab');
  await expect(page.locator('.weave__matrix-value button').first()).toBeFocused();
});

test('following a placed resident keeps their whole body visible after zoom and mobile resize', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mutations = await serveWorld(page);
  await ready(page);
  const resident = page.locator('.room-view__resident').first();
  await expect(resident).toBeAttached();
  const id = await resident.getAttribute('data-resident');
  const name = (await resident.getAttribute('aria-label'))!.replace('Open profile of ', '');
  // Select through the roster: a neighboring body can legitimately cover an
  // avatar button, and a queued resident has no visible pose to follow yet.
  await page.getByRole('button', { name: 'The 25', exact: true }).click();
  await page.getByPlaceholder('Name or room').fill(name);
  await expect(page.locator('.ns-roster li')).toHaveCount(1);
  await page.locator('.ns-roster li button').click();
  await page.getByRole('button', { name: `Follow ${name.split(' ')[0]}`, exact: true }).click();
  await expect(page.locator('.ns-follow')).toContainText(`Following ${name.split(' ')[0]}`);
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  while (await zoom.isEnabled()) await zoom.click();
  await expect(page.getByRole('button', { name: 'Fit room to view' })).toHaveText('5×');
  const target = page.locator(`.room-view__resident[data-resident="${id}"]`);
  const geometry = () => target.evaluate((element) => {
    const body = element.getBoundingClientRect();
    const viewport = element.closest('.room-view')!.getBoundingClientRect();
    const scroll = element.closest('.room-view__scroll')!;
    return {
      inside: body.left >= viewport.left - 1 && body.right <= viewport.right + 1
        && body.top >= viewport.top - 1 && body.bottom <= viewport.bottom + 1,
      panned: scroll.scrollLeft > 0 || scroll.scrollTop > 0,
    };
  });
  await expect.poll(geometry).toEqual({ inside: true, panned: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(geometry).toEqual({ inside: true, panned: true });
  await expect(page.locator('.room-view')).toHaveAttribute('data-room', 'common');
  expect(mutations).toEqual([]);
});

test('changing reduced motion freezes and resumes visible wandering without changing the saved world', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mutations = await serveWorld(page);
  await ready(page);
  const frozen = page.getByRole('button', { name: 'Wandering paused by motion preference', exact: true });
  await expect(frozen).toBeDisabled();
  const presentation = () => page.evaluate(() => ({
    rooms: [...document.querySelectorAll('.ns-atlas__room')].map((room) => room.getAttribute('aria-label')),
    bodies: [...document.querySelectorAll<HTMLButtonElement>('.room-view__resident')].map((body) => ({
      id: body.dataset.resident, x: body.dataset.x, y: body.dataset.y,
      image: body.querySelector('canvas')!.toDataURL(),
    })),
  }));
  const initial = await presentation();
  const journal = await page.locator('.ns-record').textContent();
  await page.clock.runFor(120_000);
  expect(await presentation()).toEqual(initial);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.getByRole('button', { name: 'Pause wandering', exact: true })).toBeEnabled();
  await page.clock.runFor(36_000);
  await expect.poll(async () => (await presentation()).rooms).not.toEqual(initial.rooms);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(frozen).toBeDisabled();
  const paused = await presentation();
  await page.clock.runFor(60_000);
  expect(await presentation()).toEqual(paused);
  await expect(page.locator('.ns-clock')).toContainText('106');
  await expect(page.locator('.ns-record')).toHaveText(journal!);
  expect(mutations).toEqual([]);
});

test('offline mobile has an explicit status and no invented journal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await serveWorld(page, { offline: true });
  await page.goto('/');
  await expect(page.locator('.ns-head')).toContainText(/Offline|Unavailable/);
  await expect(page.locator('.ns-record > li')).toHaveCount(0);
  await expect(page.locator('.ns-connection')).toBeVisible();
});

test('a failed status endpoint does not discard a valid observer world', async ({ page }) => {
  await serveWorld(page, { statusFailure: true });
  await page.goto('/');
  await expect(page.locator('.ns-clock')).toContainText('106');
  await expect(page.locator('.room-view__world')).toHaveClass(/is-ready/);
  await expect(page.locator('.ns-head')).toContainText(/unknown|unavailable|unchecked/i);
});

test('paused world is distinguished from an active HTTP connection', async ({ page }) => {
  await serveWorld(page, { paused: true });
  await ready(page);
  await expect(page.locator('.ns-head')).toContainText(/paused/i);
});

test('archive failure is not described as an empty day', async ({ page }) => {
  await serveWorld(page, { archiveFailure: true });
  await ready(page);
  await expect(page.locator('.ns-diary')).toContainText(/could not|unavailable|retry/i);
  await expect(page.locator('.ns-diary')).not.toContainText('No events match');
});

test('failed room image can be retried in place', async ({ page }) => {
  await serveWorld(page);
  await page.route('**/habitat/rooms/common.png*', async (route) => {
    if (!route.request().url().includes('?retry=')) return route.abort('failed');
    return route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: /retry/i }).click();
  await expect(page.locator('.room-view')).toHaveAttribute('data-room', 'common');
  await expect(page.locator('.room-view__world')).toHaveClass(/is-ready/);
});

test('short landscape keeps the notebook reachable', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await serveWorld(page);
  await ready(page);
  await page.getByRole('button', { name: 'The 25', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'The 25', exact: true }).click();
  await expect(page.getByPlaceholder('Name or room')).toBeInViewport();
});
