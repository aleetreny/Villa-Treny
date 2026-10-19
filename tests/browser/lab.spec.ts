import { expect, test } from '@playwright/test';
import { TODAY, labRoutes } from './lab-fixture';
import { generatePuzzle } from '../../src/lib/lab/mystery';

const given = { A: 'Ama', B: 'Bex', C: 'Cato', D: 'Dima', E: 'Edda', F: 'Ferran' } as const;

test('the Lab overview links all four experiments and only reads stored results', async ({ page }) => {
  const { methods } = await labRoutes(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'The Lab' }).click();
  await expect(page).toHaveURL(/\/lab$/);
  await expect(page.getByRole('heading', { level: 1, name: 'The Lab' })).toBeVisible();
  for (const title of ['The Verdict', 'The Coin', 'The Two Who Come', 'The Villa Liar']) await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
  await expect(page.locator('.lab-tile').filter({ hasText: 'The Coin' })).toContainText(/Heads \d · Tails \d/);
  await page.getByRole('link', { name: 'The Coin', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'The Coin' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'The Lab' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'The Lab' })).toBeVisible();
  expect(methods.length).toBeGreaterThan(0);
  expect(methods.every(m => m === 'GET')).toBe(true);
});

test('coin results are stratified by condition, with honest invalid counts and date navigation', async ({ page }) => {
  const { history } = await labRoutes(page);
  await page.goto('/lab/coin');
  const neutral = page.locator('.lab-condition').filter({ hasText: 'Neutral requests' });
  await expect(neutral.locator('.lab-flips li')).toHaveCount(6);
  await expect(page.locator('.lab-condition').filter({ hasText: 'With each resident' }).locator('.lab-flips li')).toHaveCount(6);
  const today = history.coin.find(r => r.date === TODAY)!;
  const heads = today.units.filter(u => u.condition === 'neutral' && (u.output as { result?: string } | null)?.result === 'heads').length;
  await expect(neutral.locator('.lab-counts')).toContainText(`Heads ${heads} · Tails ${6 - heads}`);
  await expect(page.locator('.lab-condition-stats')).toHaveCount(3);
  await expect(page.locator('.lab-callout')).toContainText('first-listed word was chosen');
  await expect(page.locator('.lab-condition-stats').first()).toContainText('1 invalid');
  await expect(page.locator('.lab-chart svg')).toHaveCount(3);
  await page.getByRole('link', { name: /Previous day/ }).click();
  await expect(page).toHaveURL(/\/lab\/coin\?date=2026-10-17$/);
  await expect(page.locator('.lab-section-title').first()).toHaveText('17 October 2026');
  await page.getByLabel('Choose a date').selectOption('2026-09-30');
  await expect(page.locator('.lab-notice')).toContainText('No valid answers were recorded');
  await expect(page.getByRole('img', { name: /Invalid answer/ })).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL(/date=2026-10-17$/);
});

test('companion network can be inspected by keyboard and shows correct denominators', async ({ page }) => {
  await labRoutes(page);
  await page.goto('/lab/companions');
  const nodes = page.locator('.lab-node');
  await expect(nodes).toHaveCount(6);
  await expect(page.locator('.lab-edge')).not.toHaveCount(0);
  await nodes.first().focus();
  await page.keyboard.press('Enter');
  await expect(nodes.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.lab-edge.is-dim')).not.toHaveCount(0);
  await expect(page.locator('.lab-decisions li').first()).toContainText('Ama');
  await page.keyboard.press('Enter');
  await expect(page.locator('.lab-edge.is-dim')).toHaveCount(0);
  // 21 days × 5 other choosers: 105 opportunities per resident.
  await expect(page.locator('.lab-rates li').first()).toContainText('/105');
  await expect(page.locator('.lab-matrix td.is-self')).toHaveCount(6);
});

test('the mystery reveals the solver’s answer after a guess and remembers it locally', async ({ page }) => {
  await labRoutes(page);
  await page.goto('/lab/mystery');
  const culprit = generatePuzzle(TODAY).culprit;
  await expect(page.locator('.lab-statements li')).toHaveCount(6);
  await expect(page.locator('.lab-reveal')).toHaveCount(0);
  await expect(page.locator('.lab-predictions')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose a suspect' })).toBeDisabled();
  await page.getByRole('radio', { name: given[culprit] }).check();
  await page.getByRole('button', { name: 'Accuse ' + given[culprit] }).click();
  await expect(page.locator('.lab-reveal')).toBeFocused();
  await expect(page.locator('.lab-result')).toHaveText('You solved it.');
  await expect(page.locator('.lab-reveal .lab-winner-name')).toHaveText(given[culprit]);
  await expect(page.locator('.lab-predictions li')).toHaveCount(6);
  await expect(page.locator('.lab-predictions li').filter({ hasText: 'the culprit' })).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.lab-result')).toHaveText('You solved it.');
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('.lab-reveal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal without guessing' }).click();
  await expect(page.locator('.lab-result')).toContainText('without guessing');
});

test('the verdict closes each debate, with ballots and honest states for history', async ({ page }) => {
  await labRoutes(page);
  await page.goto('/');
  const section = page.locator('#verdict');
  await expect(section.getByRole('heading', { name: 'The Verdict' })).toBeVisible();
  await expect(section.locator('.lab-standings li')).toHaveCount(6);
  await section.getByText('How each resident ranked the others').click();
  await expect(section.locator('.lab-table tbody tr')).toHaveCount(6);
  await expect(section.locator('.lab-table tbody tr').first()).not.toContainText(/^Ama.*Ama/);
  await page.goto('/debates/2026-09-20');
  await expect(page.locator('#verdict')).toContainText('No jury recorded for this debate.');
  await page.goto('/lab/verdict?date=2026-10-03');
  await expect(page.locator('.lab-notice')).toContainText('not completed');
});

test('pending and empty days are labelled rather than filled in', async ({ page }) => {
  await labRoutes(page, { pendingToday: true });
  await page.goto('/lab/coin');
  await expect(page.locator('.lab-notice.is-pending')).toBeVisible();
  await expect(page.getByRole('img', { name: /Waiting/ })).toHaveCount(3);
  await page.goto('/lab/verdict');
  await expect(page.locator('.lab-verdict .lab-notice')).toContainText('3 of 6 ballots');
});
test('an empty Lab says nothing has been recorded', async ({ page }) => {
  await labRoutes(page, { empty: true });
  await page.goto('/lab');
  await expect(page.locator('.lab-tile').first()).toContainText(/Scheduled|Waiting/);
  await page.goto('/lab/companions');
  await expect(page.locator('.lab-sample').first()).toContainText('No valid choices recorded yet');
});

for (const width of [320, 390, 768]) test(`Lab pages fit a ${width}px screen without horizontal scrolling`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await labRoutes(page);
  for (const path of ['/lab', '/lab/coin', '/lab/companions', '/lab/mystery', '/lab/verdict', '/']) {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    await expect(page.locator('main h1')).toHaveCount(1);
  }
});

test('coin animation respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await labRoutes(page);
  await page.goto('/lab/coin');
  expect(await page.locator('.lab-coin').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});
