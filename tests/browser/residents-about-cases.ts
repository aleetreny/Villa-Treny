import { expect, test } from '@playwright/test';
import { board, day } from './debate-fixture';

export function residentAndAboutChecks(browserName: 'chromium' | 'webkit') {
  test.describe(browserName, () => {
    for (const [width, columns] of [[390, 1], [1280, 2], [1920, 3]]) {
      test(`resident fields align across ${columns} columns at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/residents');
        await expect(page.locator('.forum-person-list article')).toHaveCount(6);
        await page.evaluate(() => document.fonts.ready);
        const cards = await page.locator('.forum-person-list article').evaluateAll(articles => articles.map(article => {
          const rect = article.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            fields: [...article.querySelectorAll('.forum-person-heading h2, .forum-person-heading h3, .forum-person-heading p, .forum-person-heading>div>a, dt, dd')]
              .map(field => { const bounds = field.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom }; }),
          };
        }));
        for (let start = 0; start < cards.length; start += columns) {
          const row = cards.slice(start, start + columns);
          for (const card of row) {
            expect(card.top).toBeCloseTo(row[0].top, 0);
            expect(card.fields).toHaveLength(12);
            card.fields.forEach((field, index) => {
              expect(field.top, `row ${start}, field ${index}`).toBeCloseTo(row[0].fields[index].top, 0);
              expect(field.top).toBeGreaterThanOrEqual(index ? card.fields[index - 1].bottom - 1 : card.top);
              expect(field.bottom).toBeLessThanOrEqual(card.bottom);
            });
          }
          if (start) expect(row[0].top).toBeGreaterThan(cards[start - 1].bottom);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });
    }

    test('project explanation is reachable, addressable and links to the actual forum', async ({ page }) => {
      if (browserName === 'webkit') await page.setViewportSize({ width: 390, height: 844 });
      const requests: string[] = [], errors: string[] = [];
      page.on('request', request => { if (request.url().includes('/__habitat/v1/debates')) requests.push(request.url()); });
      page.on('pageerror', error => errors.push(error.message));
      await board(page);
      await page.goto('/residents');
      await page.getByRole('contentinfo').getByRole('link', { name: 'About the project' }).click();
      await expect(page).toHaveURL(/\/about$/);
      await expect(page).toHaveTitle('About the project · Villa Treny');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('About the project');
      await expect(page.locator('main')).toBeFocused();
      await expect(page.getByRole('contentinfo').getByRole('link', { name: 'About the project' })).toHaveAttribute('aria-current', 'page');
      await page.reload();
      await expect(page.getByRole('heading', { name: 'How it keeps going' })).toBeVisible();
      await expect(page.locator('.forum-about-perspectives a')).toHaveCount(6);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('link', { name: 'Ama', exact: true }).click();
      await expect(page).toHaveURL(/\/residents\/A$/);
      await expect(page.locator('.forum-person-list article')).toHaveCount(1);
      await expect(page.locator('.forum-person-list dt')).toHaveCount(4);
      expect(requests).toEqual([]);
      await page.goBack();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('About the project');
      await page.locator('main').getByRole('link', { name: 'The board', exact: true }).click();
      await expect(page.getByRole('heading', { name: day.case!.title })).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
