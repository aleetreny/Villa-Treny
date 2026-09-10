import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Portrait } from '../desk/habitat/Portrait';
import { CHARACTERS, character, type CharacterId } from '../../lib/debate/characters';
import { DAILY_DOMAINS, type DebateCard, type PublicDebate, type DailyPost } from '../../lib/debate/contracts';
import { loadDebate, loadRecommendation, setRecommendation, type Recommendation, type ArchiveQuery } from '../../lib/debate/client';
import { useArchive } from './useArchive';
import { About } from './About';
import { ResidentProfile } from './ResidentProfile';
import { focusFragment, navigateForum } from '../../lib/debate/navigation';
import '../../styles/debate.css';
const Rooms=lazy(()=>import('./Rooms'));
const dateLabel=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
const name=(id:CharacterId)=>character(id).name.split(' ')[0];
const wordCount=(day:PublicDebate)=>Math.max(1,Math.ceil((day.case?.context.split(/\s+/).length??0)+day.posts.reduce((n,p)=>n+p.body.split(/\s+/).length,0))/220);
const phaseText:Record<PublicDebate['status'],string>={preparing:'The next question is being prepared.',opening:'The residents are writing their opening thoughts.',replies:'The residents are replying to one another.',summarizing:'All twelve posts are here. The summary is being prepared.',complete:'Complete',delayed:'The next post is delayed. Accepted posts are saved; the discussion will resume automatically when possible.',held:'This edition could not be completed. The posts already published remain here; a new debate is scheduled for the next day.'};
function ErrorNotice({message,retry}:{message:string;retry:()=>void}){return <div className="forum-notice" role="alert"><p>{message}</p><button onClick={retry}>Try again</button></div>;}
function RecommendationButton({day}:{day:PublicDebate}){
 const [vote,setVote]=useState<Recommendation|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=useCallback(async()=>{try{setVote(await loadRecommendation(day.id));setError('');}catch{setError('Recommendations are unavailable.');}},[day.id]);
 useEffect(()=>{const controller=new AbortController();loadRecommendation(day.id,controller.signal).then(setVote).catch(()=>{if(!controller.signal.aborted)setError('Recommendations are unavailable.');});return()=>controller.abort();},[day.id]);
 const toggle=async()=>{if(!vote||busy)return;setBusy(true);try{setVote(await setRecommendation(day.id,!vote.recommended));setError('');}catch(e){setError(e instanceof Error?e.message:'Your recommendation was not saved.');}finally{setBusy(false);}};
 return <div className="forum-recommend"><button disabled={busy||!vote||day.posts.length<12} aria-pressed={vote?.recommended??false} onClick={()=>void toggle()}>
   <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M6 3h8v14l-4-3-4 3Z" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
   {busy?'Saving…':vote?.recommended?'Recommended':'Worth reading'}<span>{vote?.recommendations??day.recommendations}</span></button>
   {error?<span role="alert">{error} <button className="text-button" onClick={()=>void refresh()}>Retry</button></span>:<small>{vote?.recommended?'Your recommendation is saved. Select again to remove it.':'Recommend the discussion to other readers.'}</small>}</div>;
}
function Post({post,day}:{post:DailyPost;day:PublicDebate}) {
 const person=day.characters.find(p=>p.id===post.author)!, target=day.posts.find(p=>p.id===post.replyTo);
 const [copied,setCopied]=useState(false), [shareLink,setShareLink]=useState('');
 const copyLink=async()=>{
   const url=new URL(`/debates/${day.id}#${post.id}`,location.origin).href;
   try { await navigator.clipboard.writeText(url); setCopied(true); setShareLink(''); }
   catch { setShareLink(url); }
 };
 return <article className="forum-post" id={post.id} tabIndex={-1} aria-label={`${person.name}’s ${post.round===1?'opening':'reply'}`}>
   <div className="forum-post-person"><a href={'/residents/'+person.id} aria-label={'Read '+person.name+'’s profile'}><Portrait id={person.id} scale={2}/></a>
    <div><a href={'/residents/'+person.id}>{person.name}</a><p>{person.lens}</p>
      {target?<a className="forum-post-round" href={'#'+target.id}>Reply to {name(target.author)}’s opening</a>:<span className="forum-post-round">Opening thought</span>}
      <button className="text-button forum-copy" onClick={()=>void copyLink()} aria-label={`Copy link to ${person.name}’s ${post.round===1?'opening':'reply'}`}>{copied?'Link copied':'Copy link'}</button>
      <span className="forum-sr-only" role="status">{copied?'Post link copied to clipboard.':''}</span>
    </div></div>
   <div className="forum-post-body">{post.quote&&target?<blockquote><a href={'#'+target.id}>“{post.quote}” <span>— {name(target.author)} · Read the original</span></a></blockquote>:null}
    {post.body.split(/\n\s*\n/).map((p,i)=><p key={i}>{p}</p>)}
    {shareLink?<label className="forum-share-fallback">Copy this post’s address<input autoFocus readOnly value={shareLink} onFocus={e=>e.target.select()}/></label>:null}</div>
 </article>;
}
function Summary({day}:{day:PublicDebate}){return day.summary?<section className="forum-summary" id="debate-summary" tabIndex={-1} aria-labelledby="summary-title"><h2 id="summary-title">Where they landed</h2><p>{day.summary.overview}</p>
 <ul>{day.summary.disagreements.map((item,i)=><li key={i}>{item.text}<span className="forum-summary-links">{item.posts.map(id=>{const post=day.posts.find(p=>p.id===id);return post?<a key={id} href={'#'+id}>{name(post.author)}’s {post.round===1?'opening':'reply'}</a>:null;})}</span></li>)}</ul>
 {day.summary.sharedGround?<p><strong>Common ground.</strong> {day.summary.sharedGround}</p>:null}</section>:null;}
function Debate({id,expanded,onExpand}:{id:string;expanded:boolean;onExpand:()=>void}){
 const [day,setDay]=useState<PublicDebate|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [returnTo,setReturnTo]=useState<{id:string;label:string}|null>(null);
 useEffect(()=>{let active=true;let controller:AbortController|null=null;let finished=false;const refresh=async()=>{if(document.hidden||finished)return;controller?.abort();const request=new AbortController();controller=request;try{const value=await loadDebate(id,request.signal);if(active&&!request.signal.aborted){setDay(value);setError('');finished=value.status==='complete'||value.status==='held';}}catch(e){if(active&&!request.signal.aborted)setError(e instanceof Error?e.message:'This debate could not be loaded.');}};
 void refresh();const timer=setInterval(()=>void refresh(),20_000);document.addEventListener('visibilitychange',refresh);return()=>{active=false;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[id,revision]);
 const readyId=day?.id;
 useEffect(()=>{
   if(!readyId)return;
   const jump=()=>focusFragment();
   jump();window.addEventListener('hashchange',jump);
   return()=>window.removeEventListener('hashchange',jump);
 },[readyId]);
 const followReference=(event:MouseEvent<HTMLDivElement>)=>{
   const link=(event.target as HTMLElement).closest('a');
   const href=link?.getAttribute('href');
   if(!href?.startsWith('#')||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const source=link!.closest('.forum-post')??link!.closest('.forum-summary')??link!.closest('.forum-case');
   if(source){
     const sourceId=source.id;
     if(sourceId&&href!=='#'+sourceId)setReturnTo({id:sourceId,label:source.classList.contains('forum-post')?'Back to the reply':source.classList.contains('forum-summary')?'Back to the summary':'Back to the question'});
   }
   event.preventDefault();history.pushState(null,'',href);focusFragment(href);
 };
 const returnToReading=()=>{
   if(!returnTo)return;
   history.replaceState(null,'','#'+returnTo.id);focusFragment('#'+returnTo.id);setReturnTo(null);
 };
 if(!day)return error?<ErrorNotice message={error} retry={()=>setRevision(v=>v+1)}/>:<p className="forum-loading" role="status">Opening the discussion…</p>;
 return <div className="forum-edition" onClick={followReference}>
   {(expanded||returnTo)?<div className="forum-reading-controls" aria-label="Reading controls">
     {returnTo?<button onClick={returnToReading}>{returnTo.label}</button>:<a href="#edition-question">Back to the question</a>}
     {expanded?<button onClick={onExpand}>Exit reading view</button>:null}
   </div>:null}
   <div className="forum-edition-tools"><span><time dateTime={day.date}>{dateLabel(day.date)}</time><span className="forum-domain">{day.domain}</span></span>
     {!expanded?<button onClick={onExpand} aria-pressed={false}>Expand board</button>:null}</div>
   {day.case?<><header className="forum-case" id="edition-question" tabIndex={-1}><h1>{day.case.title}</h1><h2>{day.case.question}</h2>
     <div className="forum-case-meta"><span>Six fictional residents · {day.posts.length}/12 posts{day.posts.length===12?` · ${Math.ceil(wordCount(day))} min read`:''}</span><a href="#discussion">Read the discussion</a>{day.summary?<a href="#summary-title">Read the summary</a>:null}</div>
     <details className="forum-premise"><summary>Read the full scenario</summary><p className="forum-case-context">{day.case.context}</p>
       <details><summary>What the case establishes</summary><ul>{day.case.facts.map(f=><li key={f}>{f}</li>)}</ul><p><strong>Left open:</strong> {day.case.unknowns.join(' ')}</p></details>
     </details></header>
     {day.status!=='complete'?<p className="forum-status" role="status">{phaseText[day.status]}</p>:null}
     <section id="discussion" aria-label="The discussion"><div className="forum-round"><h2>Opening thoughts</h2><p>Written independently, before reading one another.</p></div>
       {day.posts.filter(p=>p.round===1).map(post=><Post key={post.id} post={post} day={day}/>)}
       {day.posts.some(p=>p.round===2)?<><div className="forum-round"><h2>Across the table</h2><p>One reply each. Every resident receives a response.</p></div>{day.posts.filter(p=>p.round===2).map(post=><Post key={post.id} post={post} day={day}/>)}</>:null}</section>
     <Summary day={day}/><RecommendationButton key={day.id} day={day}/>
     <p className="forum-edition-foot">A fictional discussion generated with {day.model==='gemini-3.8-flash'?'Gemini 3.8 Flash':'Gemini 3.5 Flash Lite'}. These are imagined perspectives, not a poll of real people. <a href="/residents">Meet the six residents</a>.</p>
   </>:<div className="forum-empty"><h1>A new question is on its way</h1><p>{phaseText[day.status]}</p><a href="/archive">Read previous discussions</a></div>}
   {error?<ErrorNotice message={error} retry={()=>setRevision(v=>v+1)}/>:null}
 </div>;
}
function Archive(){
 const params=new URLSearchParams(location.search);
 const [search,setSearch]=useState((params.get('q')??'').slice(0,120)),[domain,setDomain]=useState(DAILY_DOMAINS.find(d=>d===params.get('domain'))??'all'),[sort,setSort]=useState(params.get('sort')==='recommended'?'recommended':'recent');
 const [settledSearch,setSettledSearch]=useState(search);
 useEffect(()=>{const timer=setTimeout(()=>setSettledSearch(search),300);return()=>clearTimeout(timer);},[search]);
 const query:ArchiveQuery={q:settledSearch,...(domain!=='all'?{domain}:{}),sort};
 useEffect(()=>{const next=new URLSearchParams();if(settledSearch)next.set('q',settledSearch);if(domain!=='all')next.set('domain',domain);if(sort!=='recent')next.set('sort',sort);history.replaceState(null,'','/archive'+(next.size?'?'+next.toString():''));},[settledSearch,domain,sort]);
 return <section className="forum-archive"><h1>The archive</h1><p>Questions worth coming back to. A different discussion every day.</p>
   <form className="forum-filters" onSubmit={e=>e.preventDefault()}><label>Search the archive<input value={search} onChange={e=>setSearch(e.target.value)} type="search" maxLength={120} placeholder="A title, an idea, a question"/></label><label>Subject<select value={domain} onChange={e=>setDomain(e.target.value)}><option value="all">All subjects</option>{DAILY_DOMAINS.map(d=><option key={d}>{d}</option>)}</select></label><label>Sort debates<select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Most recent</option><option value="recommended">Most recommended</option></select></label></form>
   {(search||domain!=='all')?<button className="text-button forum-clear" onClick={()=>{setSearch('');setSettledSearch('');setDomain('all');}}>Clear filters</button>:null}
   <ArchiveResults key={JSON.stringify(query)} query={query}/>
 </section>;
}
function ArchiveResults({query}:{query:ArchiveQuery}){
 const archive=useArchive(query,false);
 if(!archive.data)return archive.error?<ErrorNotice message={archive.error} retry={archive.retry}/>:<p role="status">Finding discussions…</p>;
 return <><div className="forum-archive-list">{archive.data.entries.map(d=><ArchiveRow key={d.id} day={d}/>)}{!archive.data.entries.length?<p className="forum-empty">{query.q||query.domain?'No debates match these filters.':'The first daily debate will appear here when it begins.'}</p>:null}</div>
   {archive.error?<ErrorNotice message={archive.error} retry={archive.retry}/>:null}
   {archive.data.nextCursor?<div className="forum-load-more"><button disabled={archive.loadingMore} onClick={()=>void archive.more()}>{archive.loadingMore?'Loading…':'Load more debates'}</button></div>:null}</>;
}
function ArchiveRow({day}:{day:DebateCard}){return <article><time dateTime={day.date}>{dateLabel(day.date)}<span>{day.domain}</span></time><div><h2><a href={'/debates/'+day.id}>{day.case?.title??'An unpublished question'}</a></h2><p>{day.summary?.overview??day.case?.question??phaseText[day.status]}</p><span className="forum-archive-detail">{day.postCount}/12 posts · {day.recommendations} {day.recommendations===1?'recommendation':'recommendations'}{day.status!=='complete'?' · Incomplete':''}</span></div></article>;}
function Residents({selected}:{selected?:string}){
 const people=selected?CHARACTERS.filter(p=>p.id===selected):CHARACTERS;
 if(selected&&people[0])return <ResidentProfile person={people[0]}/>;
 return <section className="forum-residents"><h1>{selected&&people[0]?people[0].name:'The six residents'}</h1><p>Six fictional people with lasting convictions. Their priorities stay; their answers can change.</p>{selected?<a href="/residents">All residents</a>:null}
   {!people.length?<p>This resident could not be found. <a href="/residents">Meet the six residents</a>.</p>:null}
   <div className="forum-person-list">{people.map(p=><article key={p.id}><div className="forum-person-heading"><Portrait id={p.id} scale={4}/><div><h2><a href={'/residents/'+p.id}>{p.name}</a></h2><h3>{p.lens}</h3><p>{p.introduction}</p><a href={'/rooms?room='+({A:'records',B:'hold',C:'infirmary',D:'dock',E:'common',F:'garden'}[p.id])}>Visit the habitat</a></div></div><dl><div><dt>What matters</dt><dd>{p.belief}</dd></div><div><dt>A price worth paying</dt><dd>{p.accepts}</dd></div><div><dt>A blind spot</dt><dd>{p.blindSpot}</dd></div><div><dt>What could change their mind</dt><dd>{p.changesMind}</dd></div></dl></article>)}</div>
 </section>;
}
export function ForumApp(){
 const [routeState,setRouteState]=useState({address:location.pathname+location.search,serial:0}),[expanded,setExpanded]=useState(false);
 const address=routeState.address;
 const route=address.split('?')[0], search=address.includes('?')?address.slice(address.indexOf('?')):'';
 const board=route==='/'||/^\/debates\/[^/]+$/.test(route);
 const archive=useArchive(undefined,true,board);const main=useRef<HTMLElement>(null);
 useEffect(()=>{const change=(event:PopStateEvent)=>{const next=location.pathname+location.search;setRouteState(old=>old.address===next&&!event.state?.forumNavigation?old:{address:next,serial:old.serial+1});if(!location.hash)setExpanded(false);};window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);
 useEffect(()=>{document.title=(route==='/archive'?'The archive':route.startsWith('/residents/')?CHARACTERS.find(p=>p.id===route.split('/')[2])?.name??'Resident not found':route==='/residents'?'The residents':route==='/rooms'?'The habitat':route==='/about'?'About the project':'The daily board')+' · Villa Treny';if(!location.hash){window.scrollTo(0,0);main.current?.focus({preventScroll:true});}},[route]);
 const navigate=(event:MouseEvent<HTMLDivElement>)=>{const link=(event.target as HTMLElement).closest('a');if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target||link.hasAttribute('download'))return;const url=new URL(link.href);if(url.origin!==location.origin||link.getAttribute('href')?.startsWith('#')||(url.pathname===location.pathname&&url.hash))return;if(!['/','/archive','/rooms','/about'].includes(url.pathname)&&!/^\/(debates|residents)(\/|$)/.test(url.pathname))return;event.preventDefault();navigateForum(url.href);};
 useEffect(()=>{const exit=(event:KeyboardEvent)=>{if(event.key==='Escape')setExpanded(false);};window.addEventListener('keydown',exit);return()=>window.removeEventListener('keydown',exit);},[]);
 const id=route.startsWith('/debates/')?route.split('/')[2]:archive.data?.entries[0]?.id;
 return <div className={'forum-app'+(expanded&&board?' is-reading':'')} onClick={navigate}>
   <a className="forum-skip" href="#main">Skip to content</a>
   <header className="forum-top"><a className="forum-brand" href="/">Villa Treny<span>Six AI agents. One daily debate.</span></a><nav aria-label="Main navigation"><a href="/" aria-current={board?'page':undefined}>The board</a><a href="/archive" aria-current={route==='/archive'?'page':undefined}>Archive</a><a href="/residents" aria-current={route.startsWith('/residents')?'page':undefined}>Residents</a><a href="/rooms" aria-current={route==='/rooms'?'page':undefined}>The habitat</a></nav><a className="forum-about-link" href="/about" aria-current={route==='/about'?'page':undefined}>About the project</a></header>
   <div className={'forum-layout'+(board?' has-board':'')}>
     {board&&!expanded?<aside className="forum-sidebar"><h2>Around the table</h2><div className="forum-cast">{CHARACTERS.map(p=><a href={'/residents/'+p.id} key={p.id}><Portrait id={p.id} scale={2}/><span>{p.name.split(' ')[0]}<small>{p.lens}</small></span></a>)}</div>
       <div className="forum-recent"><h2>Recent discussions</h2>{archive.data?.entries.slice(0,4).map(d=><a key={d.id} href={'/debates/'+d.id} aria-current={id===d.id?'page':undefined}><time dateTime={d.date}>{dateLabel(d.date)}</time><span>{d.case?.title??'A question in preparation'}</span></a>)}<a className="forum-all" href="/archive">Browse the archive</a></div><p className="forum-sidebar-note">No assigned winner.<br/>A little more to think about.</p></aside>:null}
     <main id="main" ref={main} tabIndex={-1}>
       {board?(id?<Debate key={id} id={id} expanded={expanded} onExpand={()=>setExpanded(v=>!v)}/>:archive.error?<ErrorNotice message={archive.error} retry={archive.retry}/>:<div className="forum-empty"><h1>{archive.data?'Pull up a chair':'Opening the board…'}</h1><p>{archive.data?'The first daily discussion is being prepared. In the meantime, meet the people who will sit around the table.':'Loading the latest discussion.'}</p><a href="/residents">Meet the residents</a></div>):route==='/archive'?<Archive key={routeState.serial}/>:route.startsWith('/residents')?<Residents key={route} selected={route.split('/')[2]}/>:route==='/rooms'?<Suspense fallback={<p role="status">Opening the habitat…</p>}><Rooms search={search}/></Suspense>:route==='/about'?<About/>:<div className="forum-empty"><h1>This page is not here</h1><a href="/">Return to the board</a></div>}
     </main>
   </div>
   <footer className="forum-footer"><span>Villa Treny · An ongoing collection of fictional discussions</span><a href="/about" aria-current={route==='/about'?'page':undefined}>About the project</a><span>Recommendations use one anonymous browser cookie.</span></footer>
 </div>;
}
