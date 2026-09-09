import { type Page } from '@playwright/test';
import { completedDay } from '../../workers/habitat-runtime/test/fixtures/daily';
import { publicDay } from '../../workers/habitat-runtime/src/debate/daily';
export const day=publicDay(completedDay(),0);
const older={...publicDay(completedDay('2026-09-08'),2),case:{...day.case!,title:'A promise across generations'},domain:'culture' as const};
export async function board(page:Page){
 let recommended=false, count=0;
 await page.route('**/__habitat/v1/debates**',async route=>{const url=new URL(route.request().url());
   if(url.pathname.endsWith('/recommendation')){if(route.request().method()==='PUT'){recommended=route.request().postDataJSON().recommended;count=recommended?1:0;}return route.fulfill({json:{recommended,recommendations:count}});}
   if(url.pathname.endsWith('/2026-09-09'))return route.fulfill({json:{...day,recommendations:count}});
   if(url.pathname.endsWith('/2026-09-08'))return route.fulfill({json:older});
   const entries=[day,older].filter(d=>(!url.searchParams.get('domain')||d.domain===url.searchParams.get('domain'))&&(!url.searchParams.get('q')||JSON.stringify(d.case).toLowerCase().includes(url.searchParams.get('q')!.toLowerCase())));
   return route.fulfill({json:{entries:entries.map(({posts,...card})=>({...card,postCount:posts.length})),nextCursor:null,schedule:{hourUtc:9,enabled:true,model:'gemini-3.8-flash'}}});
 });
}
