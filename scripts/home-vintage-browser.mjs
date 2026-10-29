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
 await context.addInitScript(()=>{localStorage.setItem("evaorbit.homeStyle","vintage");localStorage.setItem("evaorbit.uiLanguage","en");localStorage.setItem("evaorbit.chineseFont","canger");localStorage.setItem("evaorbit.englishFont","ibm");localStorage.setItem("evaorbit.appearanceMode","light");localStorage.setItem("evaorbit.colorTheme","editorial");localStorage.setItem("evaorbit.trackerMode","readonly");});
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
  if(url.pathname==="/eo-api/session")return route.fulfill({json:{authenticated:true,accountId,email:"preview@example.invalid",onlineBusinessProtocol:1,onlineBusinessAccountAllowed:true}});
  const m=url.pathname.match(/^\/eo-api\/home-readonly\/(day|month|due)\/(.+)$/);
  if(m)return route.fulfill({json:resource(m[1],m[2])});
  return route.fulfill({json:[]});
 });
 const page=await context.newPage();page.on("pageerror",e=>errors.push(e.stack??String(e)));await page.clock.setFixedTime(new Date(capturedAt));
 await page.goto("http://127.0.0.1:"+port,{waitUntil:"networkidle"});
 await page.evaluate(async accountId=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction("session","readwrite");tx.objectStore("session").put({accountId,email:"preview@example.invalid"},"current");tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 },accountId);
 await page.reload({waitUntil:"networkidle"});await page.locator(".home-journal-preview").waitFor().catch(async error=>{await page.screenshot({path:"tmp/global-pink-debug.png",fullPage:true});console.log(JSON.stringify({errors,body:await page.locator("body").innerText()}));throw error;});await page.evaluate(()=>document.fonts.ready);
 const root=page.locator('html');
 await page.locator('.home-tasks-pane').waitFor();
 assert.equal(await page.locator('.home-day-grid > article').first().getAttribute('class'),'home-day-pane home-tasks-pane');
 assert.equal(await page.locator('.home-page > .due-section').count(),0);
 assert.equal(await page.locator('.vintage-task-list > li').count(),6,'shared task and reminder appear once');
 assert.equal(await page.locator('.vintage-task-title').filter({hasText:'Read the book by your side'}).count(),1);assert.equal(await page.locator('.vintage-source').count(),0);assert.equal(await page.locator('.vintage-task-title').filter({hasText:'Luna · Flea treatment'}).count(),1);
 assert.equal(await page.locator('.vintage-task-title strong').first().evaluate(e=>getComputedStyle(e).fontSize),'13px');
 assert.equal(await page.locator('.vintage-task-title strong').first().evaluate(e=>getComputedStyle(e).lineHeight),'16.9px');assert.equal(await page.locator('.vintage-task-meta').first().evaluate(e=>getComputedStyle(e).marginTop),'1px');
 const bodyFont=await page.locator('.vintage-task-title strong').first().evaluate(e=>getComputedStyle(e).fontFamily);assert.match(bodyFont,/Canger Huaxin/);assert.match(await page.locator('.home-date-weekday').first().evaluate(e=>getComputedStyle(e).fontFamily),/Canger Huaxin/);assert.doesNotMatch(await page.locator('.home-date-pill strong').first().evaluate(e=>getComputedStyle(e).fontFamily),/^"EO Canger Huaxin"/);
 const families=await page.locator('.home-masthead h1').evaluate(e=>getComputedStyle(e).fontFamily);
 const audit=[];
 for(const mode of ['light','dark'])for(const width of [320,402,1440]){
  await root.evaluate((e,mode)=>{e.dataset.mode=mode;e.style.colorScheme=mode;},mode);await page.setViewportSize({width,height:width===1440?1000:874});await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(180);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const days=page.locator('.home-calendar-grid > button');assert.equal(await days.count(),7);
  const capsule=await days.first().locator('.home-date-pill').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,shadow:getComputedStyle(e).boxShadow}));assert.notEqual(capsule.bg,'rgba(0, 0, 0, 0)');assert.notEqual(capsule.shadow,'none');
  const metrics=await days.evaluateAll(els=>els.map(e=>{const outer=e.querySelector('.home-date-pill').getBoundingClientRect(),inner=e.querySelector('strong').getBoundingClientRect();return{x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width,disc:inner.width,centerError:Math.max(Math.abs(inner.x+inner.width/2-outer.x-outer.width/2),Math.abs(inner.y+inner.height/2-outer.y-outer.width/2)),rimX:inner.x-outer.x,rimY:inner.y-outer.y,sh:getComputedStyle(e.querySelector('strong')).boxShadow};}));
  assert.ok(metrics.every(m=>m.centerError<.6&&Math.abs(m.rimX-m.rimY)<.6));
  const log=await page.locator('.home-quick-log-trigger').boundingBox(),nav=await page.locator('.mobile-nav').boundingBox();const links=await page.locator('.mobile-nav a').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return r.x+r.width/2;}));assert.ok(Math.abs(log.x+log.width/2-width/2)<.6);assert.ok(Math.abs((links[0]+links[1])/2-width/2)<.6);assert.ok(log.y<nav.y);
  assert.ok(metrics.every(m=>m.width>=30&&m.disc>=25));
  const top=await page.locator('.mobile-nav').boundingBox();await page.screenshot({path:`tmp/vintage-global-${mode}-${width}.png`,fullPage:true});await page.screenshot({path:`tmp/vintage-global-viewport-${mode}-${width}.png`});
  const selectedStyle=await page.locator('.mobile-nav a.active').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,dot:getComputedStyle(e,'::after').width}));assert.equal(selectedStyle.bg,'rgba(0, 0, 0, 0)');assert.equal(selectedStyle.dot,'4px');
  const glassWidth=await page.locator('.vintage-nav-outline').evaluate(e=>e.viewBox.baseVal.width);assert.ok(Math.abs(glassWidth-nav.width)<.6);
  if(width===402){const ring=await page.locator('.home-quick-log-trigger').evaluate(e=>{const a=getComputedStyle(e,'::before'),b=getComputedStyle(e,'::after');return {discLeft:a.left,discTop:a.top,ringLeft:b.left,ringTop:b.top};});assert.equal(ring.discLeft,ring.discTop);assert.equal(ring.ringLeft,ring.ringTop);const blur=await page.locator('.vintage-nav-material').evaluate(e=>getComputedStyle(e).backdropFilter);assert.match(blur,/blur\(3px\)/);await page.locator('.home-calendar-grid').screenshot({path:`tmp/vintage-global-calendar-${mode}.png`});await page.locator('.home-tasks-pane').screenshot({path:`tmp/vintage-global-tasks-${mode}.png`});await page.screenshot({path:`tmp/vintage-global-bar-${mode}.png`,clip:{x:0,y:Math.floor(nav.y-24),width,height:874-Math.floor(nav.y-24)}});}
  await page.evaluate(()=>window.scrollTo(0,600));await page.waitForTimeout(80);const scrolled=await page.locator('.mobile-nav').boundingBox();if(width<=720)assert.equal(Math.round(top.y),Math.round(scrolled.y));
  await page.screenshot({path:`tmp/vintage-global-scroll-${mode}-${width}.png`});
  if(width===402){const nav=await page.locator('.mobile-nav').boundingBox();await page.evaluate(({nav,mode})=>{const el=document.createElement('div');el.id='glass-stress';Object.assign(el.style,{position:'fixed',zIndex:'50',left:nav.x+'px',top:(nav.y-12)+'px',width:nav.width+'px',height:'76px',font:'18px/25px sans-serif',color:mode==='dark'?'#ffffff':'#111111',background:mode==='dark'?'#25272b':'#fff'});el.textContent='UNDERLYING CONTENT 12345 · Words behind frosted glass must disappear into soft shapes. Repeat underlying content 67890.';document.body.append(el);},{nav,mode});await page.waitForTimeout(100);await page.screenshot({path:`tmp/vintage-global-stress-${mode}.png`,clip:{x:0,y:Math.floor(nav.y-24),width:402,height:874-Math.floor(nav.y-24)}});await page.locator('#glass-stress').evaluate(e=>e.remove());}
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(80);const last=await page.locator('.home-day-timeline').boundingBox(),bar=await page.locator('.mobile-nav').boundingBox();assert.ok(last.y+last.height<bar.y,'last content clears navigation');
  audit.push({mode,width,metrics,overflow:false});
 }
 await page.setViewportSize({width:402,height:874});await root.evaluate(e=>{e.dataset.mode='light';e.style.colorScheme='light';});await page.evaluate(()=>window.scrollTo(0,0));
 const selected=page.locator('.home-calendar-grid > button.selected');const box=await selected.boundingBox();const before=await selected.locator('strong').evaluate(e=>({shadow:getComputedStyle(e).boxShadow,rect:JSON.stringify(e.getBoundingClientRect())}));
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(150);const pressed=await selected.locator('strong').evaluate(e=>({shadow:getComputedStyle(e).boxShadow,rect:JSON.stringify(e.getBoundingClientRect())}));assert.notEqual(pressed.shadow,before.shadow);assert.equal(pressed.rect,before.rect);await page.screenshot({path:'tmp/vintage-global-calendar-pressed.png'});await page.mouse.up();
 const logTrigger=page.locator('.home-quick-log-trigger');const logBefore=await logTrigger.boundingBox();const logShadow=await logTrigger.evaluate(e=>getComputedStyle(e,'::before').boxShadow);await page.mouse.move(logBefore.x+36,logBefore.y+36);await page.mouse.down();await page.waitForTimeout(140);assert.deepEqual(await logTrigger.boundingBox(),logBefore);assert.notEqual(await logTrigger.evaluate(e=>getComputedStyle(e,'::before').boxShadow),logShadow);await page.screenshot({path:'tmp/vintage-global-log-pressed.png'});await page.mouse.up();await page.locator('.home-quick-log-grid').waitFor();assert.ok(await page.locator('.home-quick-log-grid button').count()>5);await page.screenshot({path:'tmp/vintage-global-log-picker.png'});await page.locator('.home-quick-log-grid').getByRole('button',{name:'Inbox',exact:true}).click();await page.getByRole('textbox',{name:'Inbox content',exact:true}).waitFor();await page.locator('.form-sheet-header button').click();await page.locator('.form-sheet-panel').waitFor({state:'detached'});assert.deepEqual(await logTrigger.boundingBox(),logBefore);
 const shell=page.locator('.app-shell');await shell.evaluate(e=>e.style.setProperty('--mobile-bottom-bar-offset','34px'));assert.equal(await page.locator('.mobile-nav').evaluate(e=>getComputedStyle(e).bottom),'34px');assert.equal(await logTrigger.evaluate(e=>getComputedStyle(e).bottom),'38px');await shell.evaluate(e=>e.style.removeProperty('--mobile-bottom-bar-offset'));
 await page.getByRole('button',{name:'Show month',exact:true}).click();assert.equal(await page.locator('.home-calendar-grid > button').count(),31);await page.getByRole('button',{name:'Show week',exact:true}).click();
 await page.locator('.home-calendar-grid > button[aria-label^="2026-10-28"]').click();await page.waitForFunction(()=>document.querySelector('.home-calendar-grid > button.selected')?.getAttribute('aria-label')?.startsWith('2026-10-28'));await page.getByRole('button',{name:'Today',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.home-calendar-grid > button.selected')?.getAttribute('aria-label')?.startsWith('2026-10-29'));
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await selected.locator('strong').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await page.emulateMedia({reducedMotion:'no-preference'});
 const taskPane=page.locator('.home-tasks-pane');
 const finance=taskPane.locator('li').filter({hasText:'ChatGPT renewal'});await finance.getByRole('button',{name:'Actions for ChatGPT renewal',exact:true}).click();
 failNext=true;await finance.getByRole('button',{name:'Paid',exact:true}).click();await page.getByText(/Preview failure: try again/).first().waitFor();assert.equal(await finance.count(),1);
 await finance.getByRole('button',{name:'Paid',exact:true}).click();await finance.waitFor({state:'detached'});
 const cat=taskPane.locator('li').filter({hasText:'Luna · Flea treatment'});await cat.getByRole('button',{name:'Actions for Luna · Flea treatment',exact:true}).click();await cat.getByRole('button',{name:'Snooze',exact:true}).click();await cat.getByRole('button',{name:'Tomorrow',exact:true}).click();await cat.waitFor({state:'detached'});
 const reminderTask=taskPane.locator('li').filter({hasText:'Read the book by your side'});await reminderTask.getByRole('button',{name:'Actions for Read the book by your side',exact:true}).click();await reminderTask.getByRole('button',{name:'Skip',exact:true}).click();await reminderTask.getByRole('button',{name:'Skip',exact:true}).waitFor({state:'detached'});
 const normal=taskPane.getByRole('checkbox',{name:'Complete Prepare dinner ingredients',exact:true});await normal.click();await page.waitForFunction(()=>document.querySelector('input[aria-label="Complete Prepare dinner ingredients"]')?.checked===true);assert.equal(await normal.isChecked(),true);
 assert.ok(writes.some(w=>w.path.endsWith('/reminders/91/complete')));assert.ok(writes.some(w=>w.path.endsWith('/reminders/92/snooze')&&w.body.choice==='tomorrow'));assert.ok(writes.some(w=>w.path.endsWith('/reminders/93/skip')));assert.ok(writes.some(w=>w.path.endsWith('/tasks/3')&&w.body.completed===true));
 for(const state of ['empty','normal','many','long']){
  scenario=state;await page.reload({waitUntil:'networkidle'});await page.locator('.home-tasks-pane').waitFor();
  const n=state==='empty'?0:state==='many'?26:state==='long'?6:4;assert.equal(await page.locator('.vintage-task-list > li').count(),n);
  if(state==='many'){const size=await page.locator('.vintage-task-list').evaluate(e=>({h:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY}));assert.equal(size.overflow,'visible');assert.ok(size.h>1000);}
  await page.screenshot({path:'tmp/vintage-global-tasks-'+state+'.png',fullPage:true});
  if(state==='long'){for(const mode of ['light','dark']){await root.evaluate((e,m)=>{e.dataset.mode=m;e.style.colorScheme=m;},mode);await page.setViewportSize({width:320,height:874});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'tmp/vintage-global-long-'+mode+'-320.png',fullPage:true});}await page.setViewportSize({width:402,height:874});await root.evaluate(e=>{e.dataset.mode='light';e.style.colorScheme='light';});}
 }
 scenario='mixed';await page.reload({waitUntil:'networkidle'});await page.locator('.home-tasks-pane').waitFor();
 // Use the actual appearance controls to switch and roll back, leaving cloud preferences alone.
 await page.locator('.mobile-nav').getByRole('link',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:/App & Appearance/}).click();
 assert.equal(await page.locator('.mobile-nav a.active').innerText(),'Settings');assert.ok(Math.abs((await page.locator('.home-quick-log-trigger').boundingBox()).x+36-201)<.6);
 for(const mode of ['light','dark']){await root.evaluate((e,m)=>{e.dataset.mode=m;e.style.colorScheme=m;},mode);const nav=await page.locator('.mobile-nav').boundingBox();await page.screenshot({path:`tmp/vintage-global-settings-bar-${mode}.png`,clip:{x:0,y:Math.floor(nav.y-24),width:402,height:874-Math.floor(nav.y-24)}});}
 // Vintage remains global on Settings, Trackers and Universal Log, independent of Classic color.
 for(const width of [320,402,1440])for(const mode of ['light','dark']){
  await page.setViewportSize({width,height:width===1440?1000:874});
  await root.evaluate((e,m)=>{e.dataset.mode=m;e.style.colorScheme=m;},mode);
  const tokens=await root.evaluate(e=>{const c=getComputedStyle(e);return {design:e.dataset.designTheme,color:e.dataset.theme,canvas:c.getPropertyValue('--surface-canvas').trim(),accent:c.getPropertyValue('--accent-primary').trim()};});
  assert.equal(tokens.design,'vintage');assert.equal(tokens.color,'vintage');assert.equal(tokens.canvas,mode==='dark'?'#202124':'#f2f3f5');
  assert.equal(await page.locator('.appearance-classic-colors').count(),0);
  assert.match(await page.locator('.appearance-theme-settings').evaluate(e=>getComputedStyle(e).fontFamily),/Canger Huaxin/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.appearance-design-themes').scrollIntoViewIfNeeded();
  await page.screenshot({path:'tmp/vintage-global-settings-'+mode+'-'+width+'.png',fullPage:true});
 }
 await page.setViewportSize({width:402,height:874});
 await root.evaluate(e=>{e.dataset.mode='light';e.style.colorScheme='light';});
 const oldTheme=await root.getAttribute('data-classic-color-theme');const beforeWrites=writes.length;
 await page.getByRole('button',{name:/^Classic.*Original design/}).click();await page.locator('.mobile-nav').getByRole('link',{name:'Home',exact:true}).click();await page.locator('.due-section').waitFor();assert.equal(await page.locator('.home-tasks-pane').count(),0);assert.equal(await root.getAttribute('data-theme'),oldTheme);assert.equal(await page.locator('.home-masthead h1').evaluate(e=>getComputedStyle(e).fontFamily),families);
 await page.locator('.mobile-nav').getByRole('link',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:/App & Appearance/}).click();await page.getByRole('button',{name:/^Vintage/}).click();await page.locator('.mobile-nav').getByRole('link',{name:'Home',exact:true}).click();await page.locator('.home-tasks-pane').waitFor();assert.equal(writes.length,beforeWrites);
 assert.equal(await page.evaluate(()=>localStorage.getItem('evaorbit.designTheme')),'vintage');
 await page.reload({waitUntil:'networkidle'});await page.locator('.home-tasks-pane').waitFor();assert.equal(await root.getAttribute('data-theme'),'vintage');
 // Use real navigation so Home is unmounted during global-theme checks.
 for(const [label,selector] of [['Trackers','.local-trackers'],['Tasks','.tasks-page'],['Inbox','.inbox-page']]){
  await navigateLocal(page,label);await page.locator(selector).waitFor();
  assert.equal(await page.locator('.home-page').count(),0,'Home must be unmounted');
  for(const mode of ['light','dark'])for(const width of [320,402,1440]){
   await page.setViewportSize({width,height:width===1440?1000:874});
   await root.evaluate((e,m)=>{e.dataset.mode=m;e.style.colorScheme=m;},mode);
   assert.equal(await root.getAttribute('data-theme'),'vintage');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const canvas=await root.evaluate(e=>getComputedStyle(e).getPropertyValue('--surface-canvas').trim());assert.equal(canvas,mode==='dark'?'#202124':'#f2f3f5');
   await page.screenshot({path:'tmp/vintage-global-'+label.toLowerCase()+'-'+mode+'-'+width+'.png',fullPage:true});
  }
  await page.setViewportSize({width:402,height:874});
 }
 await navigateLocal(page,'Settings');await page.getByRole('button',{name:/App & Appearance/}).click();
 for(const [label,color] of [['Field Green','editorial'],['Rosewood','rosewood'],['Almond Blue','powderblue'],['Mist Violet','mistviolet']]){
  await page.getByRole('button',{name:/^Classic.*Original design/}).click();
  await page.locator('.appearance-classic-colors').getByRole('button',{name:new RegExp('^'+label)}).click();
  assert.equal(await root.getAttribute('data-theme'),color);
  await page.getByRole('button',{name:/^Vintage/}).click();assert.equal(await root.getAttribute('data-theme'),'vintage');
  assert.equal(await root.getAttribute('data-classic-color-theme'),color);
  await page.getByRole('button',{name:/^Classic.*Original design/}).click();assert.equal(await root.getAttribute('data-theme'),color);
 }
 await page.getByRole('button',{name:/^Vintage/}).click();
 for(const mode of ['light','dark']){
  await root.evaluate((e,m)=>{e.dataset.mode=m;e.style.colorScheme=m;},mode);await page.locator('.appearance-design-themes').scrollIntoViewIfNeeded();
  await page.locator('.appearance-design-themes').screenshot({path:'tmp/vintage-global-picker-'+mode+'.png'});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('tmp/vintage-global-preview-audit.json',JSON.stringify({passed:true,audit,states:['empty','normal','many'],calendar:['normal','selected','pressed','month','reduced-motion'],actions:writes,cloudWrites:0,themeIsolation:true,serifHeadingsPreserved:true,bodyFont:"EO Canger Huaxin",sourceLabelsRemoved:true},null,2));
 console.log(JSON.stringify({passed:true,modes:2,widths:[320,402,1440],taskStates:4,reminderActions:true,rollback:true,concentricPress:true,centeredLog:true,safeAreaOffset:34,logForm:true}));
}finally{
 await context?.close();await browser?.close();await server.close();console.log(JSON.stringify({stoppedPort:port,serverClosed:!server.httpServer.listening}));
}
