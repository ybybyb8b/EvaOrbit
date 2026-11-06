/** Real shared Home + synthetic intercepted data. No cloud business reads or writes. */
import fs from "node:fs/promises";
import path from "node:path";
import {freeLocalPort,navigateLocal} from "./local-navigation-browser.mjs";
import assert from "node:assert/strict";
import {createServer} from "vite";

const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||"playwright");
const server=await createServer({configFile:path.resolve("vite.trackers.config.ts"),server:{host:"127.0.0.1",port:await freeLocalPort(),strictPort:true}});
let browser,context;
await fs.mkdir("tmp",{recursive:true});
await server.listen();
const port=server.httpServer.address().port;
console.log(JSON.stringify({previewPort:port,pid:process.pid,syntheticData:true}));
const accountId="10000000-0000-4000-8000-000000000099",date="2026-10-29",capturedAt="2026-10-29T07:30:00.000Z";
let scenario="mixed",failNext=false;
const taskState=new Map();
const due=[
{id:91,targetType:'subscription',targetId:10,subjectLabel:'Finance',title:'ChatGPT renewal',dueAt:'2026-10-26T12:00:00+08:00',dueHasExplicitTime:true,overdueMs:3*86400000},
{id:92,targetType:'cat',targetId:4,subjectLabel:'Luna',title:'Flea treatment',dueAt:'2026-10-28T09:00:00+08:00',dueHasExplicitTime:true,overdueMs:86400000},
{id:93,targetType:'task',targetId:1,sourceType:'task_reminder',sourceId:3,subjectLabel:'Task',title:'Read the book by your side',dueAt:'2026-10-29T12:00:00+08:00',dueHasExplicitTime:false,overdueMs:0}
];

const event=(id,title,hour,sourceType="calendar")=>({id:sourceType+":"+id,sourceId:id,sourceType,eventType:sourceType+".record",title,detail:"",date,occurredAt:date+"T"+hour+":00+08:00",endAt:date+"T"+(Number(hour.slice(0,2))+1).toString().padStart(2,"0")+":00:00+08:00",hasExplicitTime:true,href:sourceType==="calendar"?"/":"/health",metadata:{status:"confirmed",startAt:date+"T"+hour+":00+08:00",endAt:date+"T"+(Number(hour.slice(0,2))+1).toString().padStart(2,"0")+":00:00+08:00"}});
const day=key=>({date:key,events:key===date?[event(1,"午后散步","15:00"),event(2,"力量训练 · 上肢","11:00","training")]:[],tasks:key===date?[{id:1,title:"读完手边的书",completed:false,dueTime:null,priority:"medium"},{id:2,title:"给植物浇水",completed:true,dueTime:null,priority:"low"},{id:3,title:"准备晚餐食材",completed:false,dueTime:"18:00",priority:"medium"}]:[],meals:key===date?[{mealType:"breakfast",title:"鸡蛋吐司 · 热拿铁",detail:"鸡蛋吐司 · 热拿铁"},{mealType:"lunch",title:"香煎三文鱼 · 时蔬",detail:"香煎三文鱼 · 时蔬"}]:[],journal:key===date?[{id:1,date:key,content:"阳光落在窗边，猫咪睡了一个很长的午觉。",emotion:"neutral",moodScore:null,energyLevel:2,hasFullDiary:false,createdAt:capturedAt,updatedAt:capturedAt}]:[],sleep:key===date?{startAt:"2026-10-27T23:30:00+08:00",endAt:"2026-10-29T07:15:00+08:00",durationMinutes:465,napCount:0,napMinutes:0,records:[{id:1,title:"睡眠",startAt:"2026-10-27T23:30:00+08:00",endAt:"2026-10-29T07:15:00+08:00",durationMinutes:465,notes:""}]}:null,activities:[],activityRecords:[],calendarInterpretation:{categories:[],rules:[]}});
const originalDay=day;
const fixtureDay=key=>{const d=originalDay(key);d.tasks=scenario==="empty"?[]:key!==date?[]:Array.from({length:scenario==="many"?24:4},(_,i)=>({id:i+1,title:i===0?"Read the book by your side":i===1?"Water the plants":i===2?(scenario==="long"?"Prepare dinner ingredients and organise the kitchen shelves before friends arrive — a deliberately long task title":"Prepare dinner ingredients"):i===3?"Sort camera photos":"Task "+(i+1),completed:taskState.get(i+1)??i===1,dueTime:i===2?"18:00":null,priority:"medium"}));return d;};
const resource=(kind,key)=>({format:"eo-home-readonly-v1",accountId,kind,key,capturedAt,data:kind==="day"?fixtureDay(key):kind==="month"?{month:key,days:Object.fromEntries([23,24,26,27,28].map(d=>[key+"-"+d,{count:5,highlighted:d===28}])),periods:[]}:scenario==="empty"||scenario==="normal"?[]:due});
const errors=[],writes=[];

try{
 browser=await chromium.launch({channel:"chrome",headless:true});
 context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 await context.addInitScript(()=>{localStorage.setItem("evaorbit.homeStyle","classic");localStorage.setItem("evaorbit.designTheme","classic");if(!localStorage.getItem("evaorbit.uiLanguage"))localStorage.setItem("evaorbit.uiLanguage","en");localStorage.setItem("evaorbit.chineseFont","canger");localStorage.setItem("evaorbit.englishFont","ibm");localStorage.setItem("evaorbit.appearanceMode","light");localStorage.setItem("evaorbit.colorTheme","editorial");localStorage.setItem("evaorbit.trackerMode","readonly");});
 await context.route("**/eo-api/**",route=>{
  const request=route.request(),url=new URL(request.url());
  if(!["GET","HEAD"].includes(request.method())){
 writes.push({path:url.pathname,method:request.method(),body:request.postDataJSON()});
 if(failNext){failNext=false;return route.fulfill({status:500,json:{error:"Preview failure: try again"}});}
 const m=url.pathname.match(/^\/eo-api\/business\/reminders\/(\d+)\/(complete|skip|snooze)$/);
 if(m){const item=due.find(x=>x.id===Number(m[1]));if(m[2]==="complete"&&item?.targetType==="task")taskState.set(item.targetId,true);return route.fulfill({json:{ok:true}});}
 const t=url.pathname.match(/^\/eo-api\/business\/tasks\/(\d+)$/);if(t){taskState.set(Number(t[1]),request.postDataJSON().completed);return route.fulfill({json:{ok:true}});}
 throw Error("Unexpected preview write "+url.pathname);
}
  if(url.pathname==="/eo-api/workspace-readonly/tasks")return route.fulfill({json:{format:'eo-workspace-readonly-v1',kind:'tasks',accountId,capturedAt,data:{complete:true,tasks:[]}}});
  if(url.pathname==="/eo-api/inbox")return route.fulfill({json:[]});
  if(url.pathname==="/eo-api/subscriptions-readonly")return route.fulfill({json:{format:"eo-subscriptions-readonly-v1",accountId,capturedAt,today:date,items:[],iconSources:{},library:[],libraryIconSources:{}}});
  if(url.pathname==="/eo-api/session")return route.fulfill({json:{authenticated:true,accountId,email:"preview@example.invalid",onlineBusinessProtocol:1,onlineBusinessAccountAllowed:true}});
  const m=url.pathname.match(/^\/eo-api\/home-readonly\/(day|month|due)\/(.+)$/);
  if(m)return route.fulfill({json:resource(m[1],m[2])});
  return route.fulfill({json:[]});
 });
 const page=await context.newPage();page.on("pageerror",e=>errors.push(e.stack??String(e)));await page.clock.setFixedTime(new Date(capturedAt));
 await page.goto("http://127.0.0.1:"+port+"/?classicPreview=paper",{waitUntil:"networkidle"});
 await page.evaluate(async accountId=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction("session","readwrite");tx.objectStore("session").put({accountId,email:"preview@example.invalid"},"current");tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 },accountId);
 await page.reload({waitUntil:"networkidle"});await page.locator(".home-journal-preview").waitFor().catch(async error=>{await page.screenshot({path:"tmp/global-pink-debug.png",fullPage:true});console.log(JSON.stringify({errors,body:await page.locator("body").innerText()}));throw error;});await page.evaluate(()=>document.fonts.ready);

 const root=page.locator('html');
 await page.waitForFunction(()=>document.documentElement.dataset.classicPreview==='paper');
 assert.equal(await page.locator('.home-page > .due-section').count(),0);
 assert.equal(await page.locator('.home-day-grid > article').first().getAttribute('class'),'home-day-pane home-tasks-pane');
 assert.equal(await page.locator('.vintage-task-list > li').count(),6);
 assert.equal(await page.locator('[data-reicon="more"]').evaluateAll(icons=>icons.every(svg=>svg.querySelectorAll('path').length===3&&[...svg.querySelectorAll('path')].every(path=>path.getAttribute('fill')==='currentColor'))),true,'More uses three solid dots without a tile');
 const changes=[];
 for(const palette of ['blue','reference','print'])for(const width of [320,402,1440])for(const mode of ['light','dark']){
  await page.locator('.classic-preview-palette').getByRole('button',{name:palette==='blue'?'Blue grey':palette==='reference'?'Reference red':'Ink & paper',exact:true}).click();
  await page.setViewportSize({width,height:width===1440?1000:874});
  await root.evaluate((e,m)=>{e.dataset.mode=m;e.style.colorScheme=m;},mode);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const stats=await page.evaluate(()=>({canvas:getComputedStyle(document.documentElement).getPropertyValue('--surface-canvas').trim(),title:getComputedStyle(document.querySelector('.home-masthead h1')).color,card:getComputedStyle(document.querySelector('.home-day-pane')).backgroundColor,shadow:getComputedStyle(document.querySelector('.home-day-pane')).boxShadow}));
  assert.equal(stats.canvas,mode==='light'?(palette==='blue'?'#f7f7f5':palette==='reference'?'#faf9f7':'#f8f7f4'):(palette==='print'?'#202020':'#202123'));assert.equal(stats.card,'rgba(0, 0, 0, 0)');assert.equal(stats.shadow,'none');
  assert.equal(await page.locator('.home-overview').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');

  const audit=await page.evaluate(()=>{
    const rgb=value=>{const nums=value.startsWith('#')?value.slice(1).match(/../g).map(v=>parseInt(v,16)):value.match(/[\d.]+/g).map(Number);return nums.slice(0,3);};
    const luminance=value=>rgb(value).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const style=getComputedStyle(document.documentElement),canvas=style.getPropertyValue('--surface-canvas').trim();
    const pairs=[['body',style.getPropertyValue('--text-primary'),canvas],['secondary',style.getPropertyValue('--text-secondary'),canvas],['completed',style.getPropertyValue('--text-tertiary'),canvas],['status',style.getPropertyValue('--accent-strong'),style.getPropertyValue('--surface-due')],['selection',style.getPropertyValue('--accent-strong'),style.getPropertyValue('--surface-tint')]];
    const more=document.querySelector('.vintage-more').getBoundingClientRect();
    return {contrasts:pairs.map(([name,fg,bg])=>({name,ratio:ratio(fg.trim(),bg.trim())})),target:{width:more.width,height:more.height}};
  });
  assert.ok(audit.contrasts.every(item=>item.ratio>=4.5),JSON.stringify({palette,mode,audit}));
  assert.ok(audit.target.width>=44&&audit.target.height>=44);
  if(palette==='print'){
   const material=await page.evaluate(()=>{const style=(e,p)=>getComputedStyle(document.querySelector(e),p);const paper=getComputedStyle(document.body,'::before');const due=style('.vintage-task-list li[data-due="true"]');const tape=style('.vintage-task-list li[data-due="true"]','::before');const nav=style('.mobile-nav');return {texture:paper.backgroundImage,pointer:paper.pointerEvents,blend:paper.mixBlendMode,due:due.backgroundColor,mask:tape.maskImage,ordinary:style('.vintage-task-list li:not([data-due="true"])').backgroundColor,nav:{shadow:nav.boxShadow,radius:nav.borderRadius,blur:nav.backdropFilter},plus:style('.home-quick-log-trigger').width,calendar:style('.home-calendar').borderTopWidth};});
   assert.match(material.texture,/print-paper\.svg/);assert.equal(material.pointer,'none');assert.equal(material.blend,mode==='light'?'multiply':'screen');assert.equal(material.due,'rgba(0, 0, 0, 0)');assert.match(material.mask,/paper-tape-mask\.svg/);assert.equal(await page.locator('.vintage-task-list li[data-due="true"]').evaluateAll(rows=>rows.filter(e=>getComputedStyle(e,'::before').maskImage.includes('paper-tape-mask-torn.svg')).length),1);assert.equal(material.ordinary,'rgba(0, 0, 0, 0)');assert.deepEqual(material.nav,{shadow:'none',radius:'0px',blur:'none'});assert.equal(material.plus,'52px');assert.equal(material.calendar,'0px');
   if(width===402){await page.locator('.home-tasks-pane').screenshot({path:'tmp/classic-tape-tasks-'+mode+'.png'});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'tmp/classic-flat-nav-'+mode+'.png',clip:{x:0,y:754,width:402,height:120}});}
   }
   changes.push({palette,width,mode,...stats,audit});
  await page.screenshot({path:'tmp/classic-'+palette+'-'+mode+'-'+width+'.png',fullPage:true});
  await page.screenshot({path:'tmp/classic-'+palette+'-viewport-'+mode+'-'+width+'.png'});
 }
 await page.setViewportSize({width:402,height:874});
 for(const state of ['empty','long','many']){
  scenario=state;await page.reload({waitUntil:'networkidle'});await page.locator('.home-tasks-pane').waitFor();
  await page.locator('.classic-preview-palette').getByRole('button',{name:'Ink & paper',exact:true}).click();
  await page.setViewportSize({width:320,height:874});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('.vintage-task-list > li').count(),state==='empty'?0:state==='many'?26:6);
  if(state==='long')await page.locator('.home-tasks-pane').screenshot({path:'tmp/classic-print-long-320.png'});
 }
 scenario='mixed';await page.reload({waitUntil:'networkidle'});await page.locator('.home-tasks-pane').waitFor();await page.setViewportSize({width:402,height:874});
 const shell=page.locator('.app-shell');await shell.evaluate(e=>e.style.setProperty('--mobile-bottom-bar-offset','34px'));assert.equal(await page.locator('.mobile-nav').evaluate(e=>getComputedStyle(e).bottom),'34px');await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const end=await page.locator('.home-day-timeline').boundingBox(),bar=await page.locator('.mobile-nav').boundingBox();assert.ok(end.y+end.height<=bar.y,'last content scrolls fully above navigation');
 await shell.evaluate(e=>e.style.removeProperty('--mobile-bottom-bar-offset'));await page.evaluate(()=>window.scrollTo(0,0));
 const controls=page.locator('.classic-preview-controls');
 await controls.getByRole('button',{name:'Original',exact:true}).click();assert.equal(await root.getAttribute('data-classic-preview'),null);assert.equal(await page.locator('.home-page > .due-section').count(),1,'Original Due component is retained');
 await controls.getByRole('button',{name:'Preview',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.classicPreview==='paper');
 await page.getByRole('button',{name:'Show month',exact:true}).click();assert.equal(await page.locator('.home-calendar-grid > button').count(),31);
 await page.getByRole('button',{name:'Show week',exact:true}).click();
 await page.locator('.home-calendar-grid > button[aria-label^="2026-10-28"]').click();
 await page.waitForFunction(()=>document.querySelector('.home-calendar-grid > button.selected')?.getAttribute('aria-label')?.startsWith('2026-10-28'));
 await page.getByRole('button',{name:'Today',exact:true}).click();
 const finance=page.locator('.home-tasks-pane li').filter({hasText:'ChatGPT renewal'});
 await finance.getByRole('button',{name:'Actions for ChatGPT renewal',exact:true}).click();
 assert.equal(await finance.getByRole('button',{name:'Snooze',exact:true}).isEnabled(),true);
 assert.equal(await finance.getByRole('button',{name:'Skip cycle',exact:true}).isEnabled(),true);
 const savedResponse=page.waitForResponse(response=>response.url().endsWith('/reminders/91/complete'));
 await finance.getByRole('button',{name:'Paid',exact:true}).click();await savedResponse;
 await page.waitForFunction(()=>[...document.querySelectorAll('.home-tasks-pane li[data-completed="true"]')].some(e=>e.textContent.includes('ChatGPT renewal')));
 assert.ok(writes.some(w=>w.path.endsWith('/reminders/91/complete')));
 await page.locator('.home-quick-log-trigger').click();await page.locator('.home-quick-log-grid').waitFor();
 await page.locator('.home-quick-log-grid').getByRole('button',{name:'Inbox',exact:true}).click();await page.getByRole('textbox',{name:'Inbox content',exact:true}).waitFor();
 await page.locator('.form-sheet-header button').click();await page.locator('.form-sheet-panel').waitFor({state:'detached'});
 await page.locator('.mobile-nav').getByRole('link',{name:'Settings',exact:true}).click();
 assert.equal(await root.getAttribute('data-classic-preview'),null,'Home preview resets on navigation');
 await page.getByRole('button',{name:/App & Appearance/}).click();

 await page.locator('.mobile-nav a[href="/"]').click();await page.locator('.home-tasks-pane').waitFor();
 await page.locator('.classic-preview-palette').getByRole('button',{name:'Ink & paper',exact:true}).click();
 await navigateLocal(page,'Subscriptions');await page.getByRole('heading',{name:'Subscriptions',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Ink & paper',exact:true}).count(),0);assert.notEqual(await root.getAttribute('data-classic-palette'),'print');
 await page.locator('.mobile-nav a[href="/settings"]').click();await page.getByRole('button',{name:/App & Appearance/}).click();
 await page.getByRole('button',{name:/^中文/}).click();
 await page.goto('http://127.0.0.1:'+port+'/?classicPreview=paper&classicPalette=print',{waitUntil:'networkidle'});
 await page.locator('.home-tasks-pane').waitFor();await page.waitForFunction(()=>document.documentElement.dataset.classicPalette==='print');
 assert.equal(await root.getAttribute('lang'),'zh-CN');
 assert.equal(await page.locator('.home-masthead h1').evaluate(e=>getComputedStyle(e).fontStyle),'normal');
 for(const mode of ['light','dark']){
  await page.setViewportSize({width:320,height:874});await root.evaluate((e,m)=>{e.dataset.mode=m;e.style.colorScheme=m;},mode);await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'tmp/classic-print-zh-'+mode+'-320.png',fullPage:true});
 }
 await page.setViewportSize({width:402,height:874});await page.locator('.mobile-nav a[href="/settings"]').click();
 await page.getByRole('button',{name:/应用与外观/}).click();await page.getByRole('button',{name:/^English/}).click();
 await page.getByRole('button',{name:/^Vintage/}).click();
 assert.equal(await root.getAttribute('data-theme'),'vintage');assert.equal(await root.getAttribute('data-classic-preview'),null);
 await page.locator('.mobile-nav').getByRole('link',{name:'Home',exact:true}).click();
 assert.equal(await page.locator('.classic-preview-controls').count(),0);
 await page.locator('.home-tasks-pane').waitFor();
 assert.equal(await page.locator('.home-tasks-pane').count(),1);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,changes,rollback:true,vintageIsolated:true,calendar:true,universalLog:true,fixtureData:true}));
}finally{await context?.close();await browser?.close();await server.close();console.log(JSON.stringify({stoppedPort:port,serverClosed:!server.httpServer.listening}));}
