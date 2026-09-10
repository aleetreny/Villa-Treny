import { expect, test } from '@playwright/test';
import { board, day } from './debate-fixture';
import { CHARACTERS } from '../../src/lib/debate/characters';

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
      const aboutLink = page.locator('.forum-top').getByRole('link', { name: 'About the project' });
      await expect(aboutLink).toBeInViewport();
      const brandBounds = await page.locator('.forum-brand').boundingBox(), aboutBounds = await aboutLink.boundingBox();
      expect(aboutBounds!.x).toBeGreaterThan(brandBounds!.x + brandBounds!.width);
      await aboutLink.click();
      await expect(page).toHaveURL(/\/about$/);
      await expect(page).toHaveTitle('About the project · Villa Treny');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('About the project');
      await expect(page.locator('main')).toBeFocused();
      await expect(page.getByRole('contentinfo').getByRole('link', { name: 'About the project' })).toHaveAttribute('aria-current', 'page');
      await expect(aboutLink).toHaveAttribute('aria-current', 'page');
      await page.reload();
      await expect(page.locator('.forum-about-lead')).toBeInViewport();
      await expect(page.locator('.forum-about-lead')).toContainText('Six independent AI agents debate one question every day.');
      await expect(page.locator('.forum-about-lead')).toContainText('Gemini 3.5 Flash Lite');
      await page.getByText('Schedule, limits and source', { exact: true }).click();
      await expect(page.locator('.forum-about-details')).toHaveAttribute('open', '');
      await expect(page.locator('.forum-about-details')).toContainText('09:00 UTC');
      await expect(page.locator('.forum-about-perspectives a')).toHaveCount(6);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('link', { name: 'Ama', exact: true }).click();
      await expect(page).toHaveURL(/\/residents\/A$/);
      await expect(page.locator('.forum-resident-sheet')).toHaveCount(1);
      await expect(page.locator('.forum-resident-values dt')).toHaveCount(4);
      expect(requests).toEqual([]);
      await page.goBack();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('About the project');
      await page.locator('main').getByRole('link', { name: 'The board', exact: true }).click();
      await expect(page.getByRole('heading', { name: day.case!.title })).toBeVisible();
      expect(errors).toEqual([]);
    });

    for (const width of [320, 390, 1024, 1440, 1920]) {
      test(`individual resident sheets use the available space at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const requests: string[] = [], errors: string[] = [];
        page.on('request', request => { if (request.url().includes('/v1/debates')) requests.push(request.url()); });
        page.on('pageerror', error => errors.push(error.message));
        for (const person of CHARACTERS) {
          await page.goto('/residents/' + person.id);
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(person.name);
          await expect(page).toHaveTitle(person.name + ' · Villa Treny');
          await expect(page.locator('.forum-resident-values dd')).toHaveText([person.belief, person.accepts, person.blindSpot, person.changesMind]);
          await page.evaluate(() => document.fonts.ready);
          const nameFragments = await page.locator('#resident-name').evaluate(heading => {
            const text = heading.firstChild!;
            return [...text.textContent!.matchAll(/\S+/g)].map(word => {
              const range = document.createRange();
              range.setStart(text, word.index!);
              range.setEnd(text, word.index! + word[0].length);
              return range.getClientRects().length;
            });
          });
          expect(nameFragments.every(count => count === 1), 'Names should wrap between words, never inside a surname').toBe(true);
          const sheet = await page.locator('.forum-resident-sheet').boundingBox();
          expect(sheet!.width).toBeGreaterThan(width * .88);
          const identity = await page.locator('.forum-resident-identity').boundingBox(), values = await page.locator('.forum-resident-values').boundingBox();
          if (width > 1100) expect(values!.x).toBeGreaterThanOrEqual(identity!.x + identity!.width - 1);
          else expect(values!.y).toBeGreaterThanOrEqual(identity!.y + identity!.height - 1);
          const fields = await page.locator('.forum-resident-values>div').evaluateAll(nodes => nodes.map(node => {
            const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, bottom: r.bottom, right: r.right };
          }));
          if (width > 760) {
            expect(fields[0].y).toBeCloseTo(fields[1].y, 0);
            expect(fields[2].y).toBeCloseTo(fields[3].y, 0);
            expect(fields[1].x).toBeGreaterThan(fields[0].right);
          } else {
            for (let i = 1; i < fields.length; i++) expect(fields[i].y).toBeGreaterThan(fields[i - 1].bottom);
          }
          const portrait = await page.locator('.forum-resident-identity canvas').evaluate(canvas => {
            const style = getComputedStyle(canvas), rect = canvas.getBoundingClientRect();
            return { width: rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
              height: rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth) };
          });
          expect(Number.isInteger(portrait.width / 24)).toBe(true);
          expect(portrait.height / 26).toBe(portrait.width / 24);
          await expect(page.locator('.forum-top').getByRole('link', { name: 'About the project' })).toBeInViewport();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
        await page.getByRole('link', { name: '← All residents', exact: true }).click();
        await expect(page.locator('.forum-person-list article')).toHaveCount(6);
        expect(requests).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  });
}
