import { expect, test, type Page } from '@playwright/test';
import { completedDay } from '../../workers/habitat-runtime/test/fixtures/daily';
import { publicDay } from '../../workers/habitat-runtime/src/debate/daily';
const day=publicDay(completedDay(),0);
const older={...publicDay(completedDay('2026-09-08'),2),case:{...day.case!,title:'A promise across generations'},domain:'culture' as const};
async function board(page:Page){
 let recommended=false, count=0;
 await page.route('**/__habitat/v1/debates**',async route=>{const url=new URL(route.request().url());
   if(url.pathname.endsWith('/recommendation')){if(route.request().method()==='PUT'){recommended=route.request().postDataJSON().recommended;count=recommended?1:0;}return route.fulfill({json:{recommended,recommendations:count}});}
   if(url.pathname.endsWith('/2026-09-09'))return route.fulfill({json:{...day,recommendations:count}});
   if(url.pathname.endsWith('/2026-09-08'))return route.fulfill({json:older});
   const entries=[day,older].filter(d=>(!url.searchParams.get('domain')||d.domain===url.searchParams.get('domain'))&&(!url.searchParams.get('q')||JSON.stringify(d.case).toLowerCase().includes(url.searchParams.get('q')!.toLowerCase())));
   return route.fulfill({json:{entries:entries.map(({posts,...card})=>({...card,postCount:posts.length})),nextCursor:null,schedule:{hourUtc:9,enabled:true,model:'gemini-3.8-flash'}}});
 });
}
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
