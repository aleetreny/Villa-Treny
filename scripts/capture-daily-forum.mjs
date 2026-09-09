/* global document, scrollTo, innerWidth */
// Local visual review only: routes use the saved real evaluation, never inference.
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const input=process.argv[2];if(!input)throw new Error('Provide a saved public edition JSON.');
const day=JSON.parse(await readFile(input,'utf8'));
const folder='.impeccable/review';await mkdir(folder,{recursive:true});
const browser=await chromium.launch();
const evidence=[];
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__habitat/v1/debates**',route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/recommendation'))return route.fulfill({json:{recommended:false,recommendations:0}});if(/\d{4}-\d{2}-\d{2}$/.test(url.pathname))return route.fulfill({json:day});const {posts,...card}=day;return route.fulfill({json:{entries:[{...card,postCount:posts.length}],nextCursor:null,schedule:{hourUtc:9,enabled:true,model:day.model}}});});
  const prefix=viewport.width===1280?'desktop':'mobile';
  for(const [surface,url] of [['board','/'],['archive','/archive'],['profiles','/residents'],['rooms','/rooms']]){
   await page.goto('http://127.0.0.1:5180'+url);await page.locator(surface==='board'?'.forum-case':surface==='archive'?'.forum-archive-list article':surface==='profiles'?'.forum-person-list article':'.room-view__world.is-ready').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,0));
   const screenshot=folder+'/'+(surface==='board'?prefix:prefix+'-'+surface)+'.png';await page.screenshot({path:screenshot});
   evidence.push({viewport,surface,screenshot,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors:[...errors]});
   if(surface==='board'){
    await page.getByRole('button',{name:'Expand board'}).click();await page.screenshot({path:folder+'/'+prefix+'-reading.png'});
    await page.locator('.forum-post').nth(6).evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:folder+'/'+prefix+'-reply.png'});
    await page.locator('.forum-summary').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:folder+'/'+prefix+'-summary.png'});
   }
  }
  await page.close();
 }
 await writeFile(folder+'/capture.json',JSON.stringify({input,evidence},null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();}
