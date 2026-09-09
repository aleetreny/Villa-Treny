import { expect, test } from '@playwright/test';
import { board } from './debate-fixture';
 test.use({browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
 test('reading controls, filters, native room selection and follow work by touch', async({page})=>{
  await board(page);await page.goto('/');
  await page.getByRole('link',{name:'Read the summary',exact:true}).tap();
  await page.locator('.forum-summary-links a').first().tap();
  await page.getByRole('button',{name:'Back to the summary'}).tap();
  await expect(page.locator('.forum-summary')).toBeFocused();
  await page.getByRole('button',{name:'Worth reading'}).tap();
  await expect(page.getByRole('button',{name:'Recommended'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Archive',exact:true}).tap();
  await page.getByLabel('Subject').selectOption('culture');await expect(page.locator('.forum-archive-list article')).toHaveCount(1);
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'The habitat'}).tap();
  await expect(page.locator('.ns-atlas__map')).toHaveAttribute('aria-hidden','true');
  await page.getByLabel('Go to a room').selectOption('common');
  await expect(page.locator('.room-view__world.is-ready')).toBeVisible();
  for(const button of await page.getByRole('group',{name:'Room magnification'}).getByRole('button').all()){
   const rect=(await button.boundingBox())!;expect(rect.width).toBeGreaterThanOrEqual(44);expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button',{name:'Follow Ama'}).tap();
  await expect(page.getByRole('heading',{name:'Records',exact:true})).toBeInViewport();
  await expect(page.locator('.room-view__world.is-ready')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
