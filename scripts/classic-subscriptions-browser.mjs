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
const accountId="10000000-0000-4000-8000-000000000099",date="2026-11-01",capturedAt="2026-11-01T07:30:00.000Z";
let scenario="mixed",failNext=false;
const taskState=new Map();
const due=[
{id:91,targetType:'subscription',targetId:10,subjectLabel:'Finance',title:'ChatGPT renewal',dueAt:'2026-10-26T12:00:00+08:00',dueHasExplicitTime:true,overdueMs:3*86400000},
{id:92,targetType:'cat',targetId:4,subjectLabel:'Luna',title:'Flea treatment',dueAt:'2026-10-28T09:00:00+08:00',dueHasExplicitTime:true,overdueMs:86400000},
{id:93,targetType:'task',targetId:1,sourceType:'task_reminder',sourceId:3,subjectLabel:'Task',title:'Read the book by your side',dueAt:'2026-11-01T12:00:00+08:00',dueHasExplicitTime:false,overdueMs:0}
];

const event=(id,title,hour,sourceType="calendar")=>({id:sourceType+":"+id,sourceId:id,sourceType,eventType:sourceType+".record",title,detail:"",date,occurredAt:date+"T"+hour+":00+08:00",endAt:date+"T"+(Number(hour.slice(0,2))+1).toString().padStart(2,"0")+":00:00+08:00",hasExplicitTime:true,href:sourceType==="calendar"?"/":"/health",metadata:{status:"confirmed",startAt:date+"T"+hour+":00+08:00",endAt:date+"T"+(Number(hour.slice(0,2))+1).toString().padStart(2,"0")+":00:00+08:00"}});
const day=key=>({date:key,events:key===date?[event(1,"午后散步","15:00"),event(2,"力量训练 · 上肢","11:00","training")]:[],tasks:key===date?[{id:1,title:"读完手边的书",completed:false,dueTime:null,priority:"medium"},{id:2,title:"给植物浇水",completed:true,dueTime:null,priority:"low"},{id:3,title:"准备晚餐食材",completed:false,dueTime:"18:00",priority:"medium"}]:[],meals:key===date?[{mealType:"breakfast",title:"鸡蛋吐司 · 热拿铁",detail:"鸡蛋吐司 · 热拿铁"},{mealType:"lunch",title:"香煎三文鱼 · 时蔬",detail:"香煎三文鱼 · 时蔬"}]:[],journal:key===date?[{id:1,date:key,content:"阳光落在窗边，猫咪睡了一个很长的午觉。",emotion:"neutral",moodScore:null,energyLevel:2,hasFullDiary:false,createdAt:capturedAt,updatedAt:capturedAt}]:[],sleep:key===date?{startAt:"2026-10-27T23:30:00+08:00",endAt:"2026-11-01T07:15:00+08:00",durationMinutes:465,napCount:0,napMinutes:0,records:[{id:1,title:"睡眠",startAt:"2026-10-27T23:30:00+08:00",endAt:"2026-11-01T07:15:00+08:00",durationMinutes:465,notes:""}]}:null,activities:[],activityRecords:[],calendarInterpretation:{categories:[],rules:[]}});
const originalDay=day;
const fixtureDay=key=>{const d=originalDay(key);d.tasks=scenario==="empty"?[]:key!==date?[]:Array.from({length:scenario==="many"?24:4},(_,i)=>({id:i+1,title:i===0?"Read the book by your side":i===1?"Water the plants":i===2?(scenario==="long"?"Prepare dinner ingredients and organise the kitchen shelves before friends arrive — a deliberately long task title":"Prepare dinner ingredients"):i===3?"Sort camera photos":"Task "+(i+1),completed:taskState.get(i+1)??i===1,dueTime:i===2?"18:00":null,priority:"medium"}));return d;};
const resource=(kind,key)=>({format:"eo-home-readonly-v1",accountId,kind,key,capturedAt,data:kind==="day"?fixtureDay(key):kind==="month"?{month:key,days:Object.fromEntries([23,24,26,27,28].map(d=>[key+"-"+d,{count:5,highlighted:d===28}])),periods:[]}:scenario==="empty"||scenario==="normal"?[]:due});

const sub=(id,name,amount,currency,nextRenewalOn,extra={})=>({id,name,currentAmountMinor:amount,currency,billingIntervalValue:1,billingIntervalUnit:'month',startedOn:'2025-01-01',nextRenewalOn,status:'active',autoRenew:true,reminderEnabled:true,reminderDaysBefore:3,reminderTime:'09:00',reminderId:null,notes:'',pausedAt:null,endedAt:null,totalSpentMinor:0,spendByCurrency:{},paymentCount:0,latestPriceChange:null,createdAt:capturedAt,updatedAt:capturedAt,payments:[],priceChanges:[],...extra});
const items=[sub(1,'ChatGPT',2000,'USD','2026-12-01'),sub(2,'Apple Music',1100,'CNY','2026-11-05'),sub(3,'iCloud+',600,'CNY','2026-12-01'),sub(4,'1Password',3600,'USD','2026-11-12',{billingIntervalUnit:'year'}),sub(5,'Adobe Photography',6800,'CNY','2026-11-18'),sub(6,'Dropbox',11900,'USD','2026-11-24',{billingIntervalUnit:'year'}),sub(7,'Notion',1000,'USD','2026-11-10',{status:'paused',pausedAt:capturedAt}),sub(8,'Workflow automation — annual plan for personal projects',4800,'CNY','2026-11-20',{status:'ended',endedAt:capturedAt})];
for(const item of [items[0],items[2]]){const payment={id:item.id,subscriptionId:item.id,scheduledFor:'2026-11-01',paidOn:'2026-11-01',amountMinor:item.currentAmountMinor,currency:item.currency,note:'',createdAt:capturedAt};item.payments=[payment];item.latestPayment=payment;item.totalSpentMinor=payment.amountMinor;item.spendByCurrency={[item.currency]:payment.amountMinor};item.paymentCount=1;}
const subscriptionSnapshot={format:'eo-subscriptions-readonly-v1',accountId,capturedAt,today:date,items,iconSources:{},library:[],libraryIconSources:{}};
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
  if(url.pathname==='/eo-api/subscriptions-readonly')return route.fulfill({json:subscriptionSnapshot});
  if(url.pathname==='/eo-api/business/subscriptions')return route.fulfill({json:items});
  if(url.pathname==='/eo-api/business/subscriptions/library')return route.fulfill({json:[]});
  const subscriptionMatch=url.pathname.match(/^\/eo-api\/business\/subscriptions\/(\d+)$/);
  if(subscriptionMatch)return route.fulfill({json:items.find(item=>item.id===Number(subscriptionMatch[1]))});
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
 await navigateLocal(page,'Subscriptions');
 await page.getByRole('heading',{name:'Subscriptions',exact:true}).waitFor();
 await page.waitForFunction(()=>document.documentElement.dataset.classicPreview==='paper');
 assert.equal(await page.getByRole('region',{name:'Subscription carousel',exact:true}).count(),0);
 const stats=[];
 for(const palette of ['blue','reference'])for(const mode of ['light','dark'])for(const width of [320,402,1440]){
  await page.locator('.classic-preview-palette').getByRole('button',{name:palette==='blue'?'Blue grey':'Reference red',exact:true}).click();
  await page.setViewportSize({width,height:width===1440?1000:874});await root.evaluate((e,m)=>{e.dataset.mode=m;e.style.colorScheme=m;},mode);await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,JSON.stringify({palette,mode,width}));
  assert.equal(await page.locator('dl dd').first().innerText(),'6');
  await page.screenshot({path:'tmp/subscriptions-paper-'+palette+'-'+mode+'-'+width+'.png',fullPage:true});
  if(width===402)await page.screenshot({path:'tmp/subscriptions-paper-viewport-'+palette+'-'+mode+'.png'});
  stats.push({palette,mode,width});
 }
 await page.setViewportSize({width:402,height:874});
 await page.getByRole('group',{name:'Timeline view',exact:true}).getByRole('button',{name:/Recorded/}).click();
 assert.equal(await page.locator('ol li').count(),2);
 await page.getByRole('group',{name:'Timeline view',exact:true}).getByRole('button',{name:/Upcoming/}).click();
 assert.equal(await page.locator('ol li').count(),4);
 await page.getByRole('group',{name:'Subscription status',exact:true}).getByRole('button',{name:'Paused',exact:true}).click();
 const ledgerLinks=page.locator('a[href^="/subscriptions/"]').filter({hasText:'Notion'});assert.equal(await ledgerLinks.count(),1);
 assert.equal(await page.locator('a[href="/subscriptions/1"]').count(),0);
 await page.getByRole('group',{name:'Subscription status',exact:true}).getByRole('button',{name:'All',exact:true}).click();
 await page.locator('[data-section-key="trends"]').click();await page.waitForFunction(()=>document.querySelector('[data-view="trends"]'));
 await page.getByRole('group',{name:'Chart currency',exact:true}).getByRole('button',{name:'USD',exact:true}).click();
 await page.screenshot({path:'tmp/subscriptions-paper-trends.png',fullPage:true});
 await page.locator('[data-section-key="overview"]').click();await page.waitForFunction(()=>document.querySelector('[data-view="home"]'));
 await page.locator('.home-quick-log-trigger').click();await page.locator('.form-sheet-panel').waitFor();assert.match(await page.locator('.form-sheet-header').innerText(),/Add subscription/);
 await page.locator('.form-sheet-header button').click();await page.locator('.form-sheet-panel').waitFor({state:'detached'});
 await page.locator('.classic-preview-controls').getByRole('button',{name:'Original',exact:true}).click();
 await page.getByRole('region',{name:'Subscription carousel',exact:true}).waitFor();assert.equal(await root.getAttribute('data-classic-preview'),null);
 await page.locator('.classic-preview-controls').getByRole('button',{name:'Preview',exact:true}).click();
 assert.equal(await page.getByRole('region',{name:'Subscription carousel',exact:true}).count(),0);
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,stats,originalRetained:true,filters:true,history:true,trends:true,createForm:true,businessWrites:0}));
}finally{await context?.close();await browser?.close();await server.close();console.log(JSON.stringify({stoppedPort:port,serverClosed:!server.httpServer.listening}));}
