import { expect, test } from '@playwright/test';
import { board, day } from './debate-fixture';
test('board, literal reply links, reading view and persistent recommendations',async({page})=>{
 await board(page);await page.goto('/');await expect(page.getByRole('heading',{name:day.case!.title})).toBeVisible();await expect(page.locator('.forum-post')).toHaveCount(12);await expect(page.getByRole('heading',{name:day.case!.question})).toBeInViewport();await expect(page.locator('.forum-post').first()).toBeInViewport();await page.getByText('Read the full scenario',{exact:true}).click();await expect(page.locator('.forum-case-context')).toHaveText(day.case!.context);await page.getByText('Read the full scenario',{exact:true}).click();
 await page.getByRole('button',{name:'Expand board'}).click();await expect(page.locator('.forum-sidebar')).toHaveCount(0);await expect(page.getByRole('button',{name:'Exit reading view'})).toBeVisible();
 const reply=page.locator('.forum-post blockquote a').first();const href=await reply.getAttribute('href');await reply.click();await expect(page).toHaveURL(new RegExp(href!+'$'));await expect(page.locator('[id="'+href!.slice(1)+'"]')).toBeInViewport();
 const recommend=page.getByRole('button',{name:'Worth reading',exact:false});await recommend.click();await expect(page.getByRole('button',{name:'Recommended'})).toHaveAttribute('aria-pressed','true');await page.reload();await expect(page.getByRole('button',{name:'Recommended'})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Recommended'}).click();await expect(page.getByRole('button',{name:'Worth reading'})).toHaveAttribute('aria-pressed','false');
});
test('archive search, subject, sort, deep links and browser back',async({page})=>{
 await board(page);await page.goto('/archive');await expect(page.locator('.forum-archive-list article')).toHaveCount(2);await page.getByLabel('Search the archive').fill('promise');await expect(page.locator('.forum-archive-list article')).toHaveCount(1);await page.getByLabel('Search the archive').clear();await page.getByLabel('Subject').selectOption('culture');await expect(page.locator('.forum-archive-list article')).toHaveCount(1);await page.getByRole('link',{name:'A promise across generations'}).click();await expect(page.getByRole('heading',{name:'A promise across generations'})).toBeVisible();await page.goBack();await expect(page.getByRole('heading',{name:'The archive'})).toBeVisible();
});
test('six profiles, intact rooms, follow controls and navigation',async({page})=>{
 await board(page);await page.goto('/residents');await expect(page.locator('.forum-person-list article')).toHaveCount(6);await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'The habitat'}).click();await expect(page.locator('.forum-room-roster>div')).toHaveCount(6);await expect(page.locator('.room-view__world img')).toBeVisible();await page.getByRole('button',{name:'Follow Ama'}).click();await expect(page.getByRole('heading',{level:1})).toHaveText('Records');await page.getByLabel('Go to a room').selectOption('common');await expect(page.getByRole('heading',{level:1})).toHaveText('The Common');await page.getByRole('button',{name:'Pause movement'}).click();await expect(page.getByRole('button',{name:'Resume movement'})).toBeVisible();
 const image=page.locator('.room-view__world img');expect(await image.evaluate(e=>getComputedStyle(e).imageRendering)).toBe('pixelated');
});
test('mobile board and profiles remain readable without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await board(page);await page.goto('/');await expect(page.getByRole('heading',{name:day.case!.question})).toBeInViewport();await expect(page.getByRole('link',{name:'Read the discussion',exact:true})).toBeInViewport();await expect(page.getByRole('link',{name:'Read the summary',exact:true})).toBeInViewport();await expect(page.getByRole('heading',{name:day.case!.title})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Residents'}).click();await expect(page.locator('.forum-person-list article')).toHaveCount(6);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('offline errors offer recovery and unpublished editions are honest',async({page})=>{
 await page.route('**/__habitat/v1/debates**',route=>route.fulfill({status:503,json:{error:'offline'}}));await page.goto('/');await expect(page.getByRole('alert')).toContainText('could not be reached');await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();await page.unrouteAll();await page.route('**/__habitat/v1/debates**',route=>route.fulfill({json:{entries:[],nextCursor:null,schedule:{hourUtc:9,enabled:false,model:'gemini-3.8-flash'}}}));await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('heading',{name:'Pull up a chair'})).toBeVisible();
});

test('post references focus their source and return to the reading position', async ({page}) => {
 await board(page); await page.goto('/');
 const reply=page.locator('.forum-post').nth(6);
 const replyId=await reply.getAttribute('id');
 const quote=reply.locator('blockquote a'); const target=await quote.getAttribute('href');
 await quote.click();
 await expect(page.locator('[id="'+target!.slice(1)+'"]')).toBeFocused();
 await expect(page.getByRole('button',{name:'Back to the reply'})).toBeInViewport();
 await page.getByRole('button',{name:'Back to the reply'}).click();
 await expect(reply).toBeFocused(); await expect(page).toHaveURL(new RegExp('#'+replyId+'$'));
 await page.locator('.forum-summary-links a').first().click();
 await page.getByRole('button',{name:'Back to the summary'}).click();
 await expect(page.locator('.forum-summary')).toBeFocused();
 await page.getByRole('button',{name:'Expand board'}).click();
 await page.locator('.forum-post').last().scrollIntoViewIfNeeded();
 await expect(page.getByRole('button',{name:'Exit reading view'})).toBeInViewport();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
});

test('copy post link produces a dated URL and a selectable fallback when clipboard is denied', async ({page}) => {
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async (text:string)=>{sessionStorage.setItem('copied-link',text);}}}));
 await board(page); await page.goto('/');
 const post=page.locator('.forum-post').first(), id=await post.getAttribute('id');
 await post.getByRole('button',{name:/Copy link/}).click();
 const copied=await page.evaluate(()=>sessionStorage.getItem('copied-link'));
 expect(copied).toBe(`http://127.0.0.1:5181/debates/${day.id}#${id}`);
 await expect(post.getByRole('status')).toHaveText('Post link copied to clipboard.');
 await page.goto(copied!); await expect(page.locator('[id="'+id+'"]')).toBeFocused();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Denied');}}}));
 await page.locator('.forum-post').first().getByRole('button',{name:/Copy link/}).click();
 await expect(page.getByLabel('Copy this post’s address')).toHaveValue(copied!);
});

test('room selection, following, stop and browser history retain the correct room', async ({page}) => {
 await board(page); await page.goto('/rooms?room=common');
 await page.getByRole('button',{name:'Pause movement'}).click();
 await page.getByRole('button',{name:'Follow Ama'}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('Records');
 await page.getByRole('button',{name:'Stop following'}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('Records');
 await expect(page).toHaveURL(/room=records$/);
 await page.getByLabel('Go to a room').selectOption('garden');
 await page.goBack(); await expect(page.getByLabel('Go to a room')).toHaveValue('records');
 await page.getByLabel('Go to a room').selectOption('common');
 await expect(page.locator('.room-view__resident').first()).toBeVisible();
 const sprite=page.locator('.room-view__resident').first();
 const metrics=await sprite.evaluate(e=>{const s=getComputedStyle(e);return {width:s.width,height:s.height,padding:s.padding,border:s.borderWidth,background:s.backgroundColor};});
 expect(metrics).toEqual({width:'24px',height:'44px',padding:'0px',border:'0px',background:'rgba(0, 0, 0, 0)'});
 await sprite.hover(); expect(await sprite.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
 await page.evaluate(()=>sessionStorage.setItem('navigation-sentinel','retained'));
 await sprite.click(); await expect(page).toHaveURL(/\/residents\/E$/);
 await page.goBack(); await expect(page.getByLabel('Go to a room')).toHaveValue('common');
 await page.goto('/rooms?room=constructor&follow=missing');
 await expect(page.getByRole('heading',{level:1})).toHaveText('The Common');
});

test('archive loads only its query, validates filters and can clear empty results', async ({page}) => {
 const requests:string[]=[]; page.on('request',request=>{if(request.url().includes('/__habitat/v1/debates'))requests.push(request.url());});
 await board(page); await page.goto('/archive?domain=invalid&sort=invalid');
 await expect(page.locator('.forum-archive-list article')).toHaveCount(2);
 await expect(page.getByLabel('Subject')).toHaveValue('all');
 await expect(page.getByLabel('Sort debates')).toHaveValue('recent'); expect(requests.length).toBeGreaterThan(0); expect(requests.every(url=>new URL(url).search==='?sort=recent')).toBe(true);
 await page.getByLabel('Search the archive').fill('nothingmatches');
 await expect(page.getByText('No debates match these filters.')).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).click();
 await expect(page.locator('.forum-archive-list article')).toHaveCount(2);
 await page.getByLabel('Subject').selectOption('culture'); await expect(page.locator('.forum-archive-list article')).toHaveCount(1);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Archive',exact:true}).click();
 await expect(page.getByLabel('Subject')).toHaveValue('all'); await expect(page.locator('.forum-archive-list article')).toHaveCount(2);
});

test('malformed fragments and unknown pages do not crash the observer', async ({page}) => {
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await board(page);
 await page.goto('/debates/'+day.id+'#%E0%A4%A'); await expect(page.locator('.forum-post')).toHaveCount(12);
 await page.goto('/missing'); await expect(page.getByRole('heading',{name:'This page is not here'})).toBeVisible();
 await page.getByRole('link',{name:'Return to the board'}).click(); await expect(page.locator('.forum-post')).toHaveCount(12);
 expect(errors).toEqual([]);
});

for (const viewport of [{width:320,height:740},{width:390,height:844},{width:768,height:1024},{width:844,height:390},{width:1920,height:1080},{width:2560,height:1440}]) {
 test(`fluid pages and room controls at ${viewport.width}×${viewport.height}`, async ({page}) => {
  await page.setViewportSize(viewport);await board(page);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [url,ready] of [['/','.forum-post'],['/archive','.forum-archive-list article'],['/residents','.forum-person-list article'],['/rooms','.room-view__world.is-ready']]) {
   await page.goto(url);await expect(page.locator(ready).first()).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),url).toBe(true);
   const nav=page.getByRole('navigation',{name:'Main navigation'});
   for(const link of await nav.getByRole('link').all())await expect(link).toBeInViewport();
  }
  const stage=page.locator('.forum-room-stage');expect((await stage.boundingBox())!.width).toBeLessThanOrEqual(viewport.width);
  const zoomIn=page.getByRole('button',{name:'Zoom in',exact:true});if(await zoomIn.isEnabled())await zoomIn.click();
  await page.getByRole('button',{name:'Fit room to view',exact:true}).click();
  expect(errors).toEqual([]);
 });
}
