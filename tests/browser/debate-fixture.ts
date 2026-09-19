import { type Page } from '@playwright/test';
import { completedDay, completedConversation } from '../../workers/habitat-runtime/test/fixtures/daily';
import { publicDay } from '../../workers/habitat-runtime/src/debate/daily';
export const day=publicDay(completedDay(),0);
export const conversation=publicDay(completedConversation(),0);
export async function conversationBoard(page:Page,status:typeof conversation.status='complete'){
 let recommended=false;
 const edition={...conversation,status,summary:status==='complete'?conversation.summary:null};
 await page.route('**/__habitat/v1/debates**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/recommendation')){
   if(route.request().method()==='PUT')recommended=route.request().postDataJSON().recommended;
   return route.fulfill({json:{recommended,recommendations:recommended?1:0}});
  }
  if(path.endsWith('/'+edition.id))return route.fulfill({json:edition});
  return route.fulfill({json:{entries:[{...edition,postCount:edition.posts.length}],nextCursor:null,schedule:{hourUtc:9,enabled:true,model:edition.model}}});
 });
}
const older={...publicDay(completedDay('2026-09-08'),2),protocol:'villa-debate-v3',personaVersion:4,
 characters:day.characters.map(person=>({...person,version:4})),
 posts:completedDay('2026-09-08').posts.map(post=>({...post,body:[post.body,post.body].join(' ').replace(/\n/g,' ')})),
 case:{...day.case!,title:'A promise across generations'},domain:'culture' as const};
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
