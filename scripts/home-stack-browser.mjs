/** Real Home, registry and local Tracker store; all business data below is synthetic. */
import {createServer} from 'vite';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {freeLocalPort} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE || 'playwright');
await fs.mkdir('tmp/personal-widget-preview',{recursive:true});
await fs.writeFile('tmp/personal-widget-preview/index.html','<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
await fs.writeFile('tmp/personal-widget-preview/main.tsx',`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {HomePageView} from '@/components/home-page-view';
import {HomeCalendarTimeline} from '@/components/home-calendar-timeline';
import {PersonalWidgetStackWeb} from '@/components/personal-widget-stack-web';
import {LocalPersonalWidgetStack} from '@/local-trackers/personal-widget-stack';
import {TrackerWorkspace} from '@/local-trackers/tracker-workspace';
import {LocalRouteContext} from '@/local-trackers/routes';
import {LocaleController} from '@/components/locale-controller';
import {ErrorFeedbackProvider} from '@/components/error-feedback';
import {defaultCalendarInterpretation} from '@/lib/calendar-interpretation';
import '@/app/globals.css';
const date='2026-11-27',account={accountId:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid'};
const field=(id,trackerLocalId,key,name,type,options=[])=>({id:'field-'+id,resourceType:'tracker_field',payload:{trackerLocalId,key,name,type,options,required:true,sortOrder:id,precision:0}});
let state={schemaVersion:1,accountId:account.accountId,revision:0,records:[{id:'poo-local',resourceType:'tracker',payload:{name:'Poo',quickCaptureEnabled:false}},{id:'shower-local',resourceType:'tracker',payload:{name:'Shower',quickCaptureEnabled:false}},field(1,'poo-local','bristol','Bristol type','single_select',['1','2','3','4','5','6','7']),field(2,'poo-local','amount','Amount','single_select',['Small','Medium','Large']),field(3,'shower-local','bath','洗澡','boolean'),field(4,'shower-local','hair','洗头','boolean')],outbox:[]};
const storage={read:async()=>structuredClone(state),commit:async(revision,next)=>{if(state.revision!==revision)return false;state=structuredClone(next);return true;}};
const platform={native:false,readOnly:()=>false,storage:()=>storage};
const day={date,tasks:[{id:1,title:'Read the book by your side',completed:false,priority:'medium',dueTime:null}],meals:[],journal:[],sleep:null,activities:[],activityRecords:[],calendarInterpretation:defaultCalendarInterpretation(),events:[{id:'tracker:1',sourceId:1,sourceType:'tracker',eventType:'tracker.entry',date,title:'Shower',detail:'Bath · Hair',occurredAt:date+'T08:00:00+08:00',endAt:null,hasExplicitTime:true,href:'/trackers/2',metadata:{}}],importantDates:[]};
function Preview(){const [path,setPath]=useState('/');const local=new URLSearchParams(location.search).has('local');return <LocaleController localOnly defaults={{uiLanguage:'en',englishFont:'ibm'}}><ErrorFeedbackProvider><LocalRouteContext.Provider value={{path,navigate:setPath}}>{path.startsWith('/trackers')?<TrackerWorkspace account={account} platform={platform}/>:<HomePageView language='en'><HomeCalendarTimeline initialDay={day} initialSummary={{month:'2026-11',days:{},periods:[]}} dueItems={[]} language='en' cacheScope='personal-widget-test' widgetStack={local?<LocalPersonalWidgetStack account={account} platform={platform}/>:<PersonalWidgetStackWeb cacheScope='personal-widget-test'/>}/></HomePageView>}</LocalRouteContext.Provider></ErrorFeedbackProvider></LocaleController>;}
createRoot(document.getElementById('root')).render(<Preview/>);
`);
const server=await createServer({configFile:false,root:path.resolve('tmp/personal-widget-preview'),publicDir:path.resolve('public'),resolve:{alias:{'@':path.resolve('src')}},define:{'process.env.EVAORBIT_TIME_ZONE':JSON.stringify('Asia/Shanghai')},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:await freeLocalPort(),strictPort:true,fs:{allow:[process.cwd()]}},plugins:[{name:'strip-client',transform(code,id){if(/\.[jt]sx?$/.test(id))return code.replace(/^["']use client["'];?\s*/,'');}}]});
let browser;
const errors=[],writes=[];
try {
  await server.listen();const port=server.httpServer.address().port,url='http://127.0.0.1:'+port;
  console.log(JSON.stringify({previewPort:port,pid:process.pid,syntheticData:true}));
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:402,height:874},hasTouch:true,isMobile:true});
  let fail=false,entries=[];
  const field=(id,key,name,type,options=[])=>({id,trackerId:1,key,name,type,options,required:true,archivedAt:null,sortOrder:id,precision:0,unit:'',config:{}});
  const trackers=[{id:1,name:'Poo',stats:{lastOccurredAt:'2026-11-25T08:00:00+08:00'}},{id:2,name:'Shower',stats:{lastOccurredAt:null}},{id:3,name:'Reading',stats:{lastOccurredAt:null}}];
  const dates=[{id:11,title:'Dinner with friends',date:'2026-12-02',recurrence:'none',category:'Life',note:'',archived:false,pinned:false},{id:12,title:'Our anniversary',date:'2024-02-29',recurrence:'yearly',category:'Anniversary',note:'',archived:false,pinned:false}];
  const routine={id:10,petId:7,scope:'cat',title:'Brush fur',nextDueAt:'2026-11-27T04:00:00Z',lastCompletedAt:'2026-11-20T04:00:00Z',enabled:true};
  const cats={pets:[{pet:{id:7,name:'Luna',isActive:true}},{pet:{id:8,name:'Milo',isActive:true}}],routines:[routine],household:[],oneTimeTasks:[{id:21,title:'Nail trim',targetType:'cat',targetId:7,isActive:true,nextDueAt:'2026-11-28T04:00:00Z'}],timeline:[]};
  await context.route('**/api/**',async route=>{
    const request=route.request(),p=new URL(request.url()).pathname;
    if(!['GET','HEAD'].includes(request.method()))writes.push({path:p,method:request.method(),body:request.postData()});
    if(p==='/api/trackers')return route.fulfill({json:trackers});
    const detail=p.match(/^\/api\/trackers\/(\d+)$/);
    if(detail){const id=Number(detail[1]);return route.fulfill({json:{fields:id===1?[field(1,'bristol','Bristol type','single_select',['1','2','3','4','5','6','7']),field(2,'amount','Amount','single_select',['Small','Medium','Large'])]:id===2?[field(3,'bath','洗澡','boolean'),field(4,'hair','洗头','boolean')]:[],entries:entries.filter(entry=>entry.trackerId===id)}});}
    if(p.endsWith('/entries')){if(fail)return route.fulfill({status:500,json:{error:'Synthetic save failure'}});const input=request.postDataJSON(),id=Number(p.split('/')[3]);const entry={...input,id:entries.length+1,trackerId:id};entries.push(entry);trackers[id-1].stats.lastOccurredAt=input.occurredAt;return route.fulfill({status:201,json:entry});}
    if(p==='/api/important-dates')return route.fulfill({json:dates});
    if(p==='/api/cats')return route.fulfill({json:cats});
    if(p==='/api/cats/routines/10/complete'){const input=request.postDataJSON();assert.equal(input.expectedNextDueAt,routine.nextDueAt);assert.equal(input.expectedLastCompletedAt,routine.lastCompletedAt);routine.lastCompletedAt='2026-11-27T04:00:00Z';routine.nextDueAt='2026-12-04T04:00:00Z';return route.fulfill({json:{ok:true}});}
    if(p==='/api/reminders/21/complete'){cats.oneTimeTasks=[];cats.timeline.push({id:71,kind:'event',petId:7,title:'Nail trim',occurredAt:'2026-11-27T04:01:00Z',occurredHasExplicitTime:true,metadata:{sourceType:'reminder'}});return route.fulfill({json:{ok:true}});}
    if(p==='/api/health/training')return route.fulfill({json:[{id:1,course:'Upper body',occurredAt:'2026-11-26T04:00:00Z',occurredHasExplicitTime:false,durationMinutes:30},{id:2,course:'Walk',occurredAt:'2026-11-24T04:00:00Z',occurredHasExplicitTime:true,durationMinutes:20}]});
    return route.fulfill({json:[]});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.clock.setFixedTime(new Date('2026-11-27T04:00:00Z'));
  await page.goto(url,{waitUntil:'networkidle'});
  const stack=page.getByRole('region',{name:'Personal Widget Stack',exact:true});
  const active=()=>stack.locator('article[data-active="true"]');
  const capture=async name=>{await page.locator('.home-masthead h1').click();const box=await stack.boundingBox();await page.screenshot({path:'tmp/widget-custom-icons-'+name+'.png',clip:{x:box.x-8,y:box.y-8,width:box.width+16,height:box.height+16}});};
  const config=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('eo:personal-widget-stack:personal-widget-test')));
  const edit=async()=>{await page.getByRole('button',{name:'Edit Personal Widget Stack',exact:true}).click();await page.locator('.centered-modal[data-state="open"]').waitFor();};
  const close=async()=>{await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.form-sheet-layer').waitFor({state:'detached'});};
  const select=async index=>{const slider=stack.getByRole('slider',{name:'Choose widget',exact:true});await slider.press('Home');for(let step=0;step<index;step++)await slider.press('ArrowDown');await page.waitForTimeout(100);assert.equal(await slider.inputValue(),String(index+1));};
  const add=async(type,object,options)=>{await page.getByRole('tab',{name:'Add Widgets',exact:true}).click();await page.locator('.form-sheet-panel').getByRole('button',{name:new RegExp('^'+type)}).click();if(object)await page.locator('#personal-widget-config select').first().selectOption(String(object));if(options)await options();await page.getByRole('button',{name:'Save widget',exact:true}).click();await page.getByRole('tab',{name:'My Stack',exact:true}).waitFor();};
  await active().getByRole('button',{name:'Record Poo',exact:true}).waitFor();
  assert.equal(await stack.getByRole('heading',{name:'Personal Stack',exact:true}).count(),0);assert.equal(await active().locator('[class*=widgetIcon]').count(),0);assert.equal(await stack.locator('[class*=deck]').evaluate(element=>getComputedStyle(element,'::before').content),'none');
  const geometry=await active().evaluate(element=>({card:element.getBoundingClientRect().height,main:element.parentElement.getBoundingClientRect().height}));assert(geometry.main>=125&&geometry.main<=135);assert(geometry.card<=135);
  await page.screenshot({path:'tmp/personal-stack-layout-tracker-mobile.png',fullPage:true});
  assert.equal(await page.locator('.home-day-timeline').getByRole('heading',{name:'Days',exact:true}).count(),0);
  assert.equal(await stack.getByRole('slider',{name:'Choose widget',exact:true}).getAttribute('max'),'2');await stack.getByText('01 / 02',{exact:true}).waitFor();
  await active().getByRole('button',{name:'Record Poo',exact:true}).click();await page.locator('.centered-modal[data-state="open"]').waitFor();
  const modal=page.locator('.form-sheet-panel');const bounds=await modal.boundingBox();assert(bounds.y>16&&bounds.y+bounds.height<858);
  await modal.locator('select').first().selectOption('4');await modal.getByRole('group',{name:'Amount',exact:true}).getByRole('button',{name:'Medium',exact:true}).click();
  fail=true;await page.getByRole('button',{name:'Save record',exact:true}).click();await page.locator('.error-banner').waitFor();assert.equal(await modal.locator('select').first().inputValue(),'4');
  fail=false;await page.getByRole('button',{name:'Save record',exact:true}).click();await page.locator('.form-sheet-layer').waitFor({state:'detached'});await active().getByText(/Bristol type: 4/).waitFor();await capture('tracker');assert.equal(entries[0].occurredAt,'2026-11-27T04:00:00.000Z');
  await stack.hover();await page.mouse.wheel(0,220);await page.waitForTimeout(350);await active().getByRole('button',{name:'Record Shower',exact:true}).waitFor();await stack.getByText('02 / 02',{exact:true}).waitFor();
  await active().getByRole('button',{name:'Record Shower',exact:true}).click();await page.locator('.centered-modal[data-state="open"]').waitFor();assert.equal(await modal.locator('input[type="checkbox"]').count(),2);await modal.locator('input[type="checkbox"]').first().check();await page.getByRole('button',{name:'Save record',exact:true}).click();await page.locator('.form-sheet-layer').waitFor({state:'detached'});assert.equal(entries[1].values.bath,true);
  await stack.hover();await page.mouse.wheel(0,-76);await page.waitForTimeout(850);const settled=await stack.getByLabel('Swipe up or down to change widgets',{exact:true}).evaluate(element=>({offset:element.scrollTop,height:element.clientHeight}));assert(Math.abs(settled.offset/settled.height-Math.round(settled.offset/settled.height))<.01);await active().getByRole('button',{name:'Record Poo',exact:true}).waitFor();
  await edit();await add('Days',11);await add('Days',12,async()=>page.getByLabel('Display',{exact:true}).selectOption('elapsed'));await add('Cat Care',7);await add('Training Summary',null,async()=>page.getByLabel('Summary period',{exact:true}).selectOption('month'));await add('Tracker',1);
  let saved=await config();assert.equal(saved.widgets.length,7);assert.equal(saved.widgets.filter(w=>w.type==='days').length,2);assert.equal(saved.widgets.filter(w=>w.type==='tracker'&&w.trackerId==='1').length,2);
  await page.getByRole('button',{name:'Edit widget 7',exact:true}).click();await page.locator('#personal-widget-config input[type="checkbox"]').uncheck();await page.getByRole('button',{name:'Save widget',exact:true}).click();assert.equal((await config()).widgets[6].showDetails,false);
  // Pointer drag on a touch viewport, followed by the keyboard alternative.
  const handles=page.getByRole('button',{name:/^Reorder widget /});const from=await handles.nth(0).boundingBox(),to=await handles.nth(2).boundingBox();
  const session=await context.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x+18,y:from.y+20}]});for(let step=1;step<=6;step++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+18,y:from.y+20+(to.y-from.y)*step/6}]});await page.waitForTimeout(25);}await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.notEqual((await config()).widgets[0].id,saved.widgets[0].id);assert.equal((await config()).activeId,saved.activeId);
  await handles.nth(0).press('ArrowDown');assert.equal((await config()).widgets.length,7);
  await page.getByRole('tab',{name:'My Stack',exact:true}).press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Add Widgets',exact:true}).getAttribute('aria-selected'),'true');await page.getByRole('tab',{name:'Add Widgets',exact:true}).press('ArrowLeft');await page.screenshot({path:'tmp/personal-stack-layout-editor-mobile.png'});await close();
  saved=await config();const dayIndex=saved.widgets.findIndex(w=>w.type==='days');await select(dayIndex);await active().getByText('days to go',{exact:true}).waitFor();await capture('days');const selected=(await config()).activeId;await page.reload({waitUntil:'networkidle'});await active().getByRole('heading',{name:'Dinner with friends',exact:true}).waitFor();assert.equal((await config()).activeId,selected);
  saved=await config();const catIndex=saved.widgets.findIndex(w=>w.type==='cat-care');await select(catIndex);await active().getByText(/^Brush fur/).waitFor();await capture('cat-care');const doneSize=await active().getByRole('button',{name:'Done',exact:true}).boundingBox();assert(doneSize.height<=28&&doneSize.width<55);await active().getByRole('button',{name:'Done',exact:true}).click();await active().getByText(/Last done · Brush fur/).waitFor();await active().getByText(/^Nail trim/).waitFor();await active().getByRole('button',{name:'Done',exact:true}).click();await active().getByText(/Last done · Nail trim/).waitFor();
  await page.screenshot({path:'tmp/personal-stack-layout-cat-care-mobile.png',fullPage:true});await select(saved.widgets.findIndex(w=>w.type==='training'));await active().getByText('50 min',{exact:true}).waitFor();await capture('training');assert.equal(await active().getByRole('link',{name:'Open',exact:true}).getAttribute('href'),'/health?view=training');
  await page.screenshot({path:'tmp/personal-stack-layout-training-mobile.png',fullPage:true});await page.emulateMedia({reducedMotion:'reduce'});await select(dayIndex);assert.equal(await active().evaluate(element=>getComputedStyle(element).transform),'none');await page.screenshot({path:'tmp/personal-stack-layout-days-mobile.png',fullPage:true});await page.emulateMedia({reducedMotion:'no-preference'});await select(catIndex);
  {const material='vintage';
    await edit();assert.equal(await page.getByLabel('Stack material',{exact:true}).count(),0);await close();
    for(const mode of ['light','dark'])for(const width of [402,1440]){
      await page.locator('html').evaluate((element,mode)=>{element.dataset.mode=mode;},mode);await page.setViewportSize({width,height:width===1440?1000:874});await stack.scrollIntoViewIfNeeded();
      const compact=await active().evaluate(element=>{const bounds=element.getBoundingClientRect();return {height:element.parentElement.getBoundingClientRect().height,inside:[...element.querySelectorAll('h3,p,[class*="action"],[class*="countdown"]')].every(child=>{const r=child.getBoundingClientRect();return r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1&&r.left>=bounds.left-1&&r.right<=bounds.right+1;})};});assert(compact.height<=135);assert.equal(compact.inside,true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await stack.getAttribute('data-material'),null);
      await page.screenshot({path:'tmp/personal-stack-layout-'+material+'-'+mode+'-'+width+'.png',fullPage:true});
    }
  }
  // Removing one copy never removes its other instance, and an empty stack remains empty.
  await edit();await page.locator('.form-sheet-body').evaluate(element=>element.scrollTop=0);const mouseFrom=await page.getByRole('button',{name:'Reorder widget 1',exact:true}).boundingBox(),mouseTo=await page.getByRole('button',{name:'Reorder widget 2',exact:true}).boundingBox();const beforeMouse=(await config()).widgets[0].id;await page.mouse.move(mouseFrom.x+18,mouseFrom.y+20);await page.mouse.down();await page.mouse.move(mouseTo.x+18,mouseTo.y+30,{steps:8});await page.mouse.up();assert.notEqual((await config()).widgets[0].id,beforeMouse);saved=await config();const duplicate=saved.widgets.findIndex(w=>w.type==='tracker'&&w.showDetails===false);await page.getByRole('button',{name:'Remove widget '+(duplicate+1),exact:true}).click();assert.equal((await config()).widgets.filter(w=>w.type==='tracker'&&w.trackerId==='1').length,1);
  while((await config()).widgets.length)await page.getByRole('button',{name:'Remove widget 1',exact:true}).click();await close();await page.reload({waitUntil:'networkidle'});await stack.getByRole('button',{name:'Add a widget. Make this space yours.',exact:true}).waitFor();
  // Another account scope and the legacy format are isolated from this stack.
  const legacy=await context.newPage();await legacy.clock.setFixedTime(new Date('2026-11-27T04:00:00Z'));await legacy.addInitScript(()=>{localStorage.removeItem('eo:personal-widget-stack:personal-widget-test');localStorage.setItem('eo:home-tracker-stack:personal-widget-test','["2","1"]');});await legacy.goto(url,{waitUntil:'networkidle'});await legacy.getByRole('button',{name:'Record Shower',exact:true}).waitFor();assert.deepEqual(await legacy.evaluate(()=>JSON.parse(localStorage.getItem('eo:personal-widget-stack:personal-widget-test')).widgets.map(w=>w.trackerId)),['2','1']);await legacy.close();
  // Local Tracker writes use the real queue and validate the same Bristol/amount fields.
  const local=await context.newPage();local.on('pageerror',e=>errors.push(String(e)));await local.clock.setFixedTime(new Date('2026-11-27T04:00:00Z'));await local.goto(url+'/?local=1',{waitUntil:'networkidle'});await local.getByRole('button',{name:'Record Poo',exact:true}).waitFor();await local.getByRole('button',{name:'Record Poo',exact:true}).click();await local.locator('.centered-modal[data-state="open"]').waitFor();await local.locator('.form-sheet-panel select').first().selectOption('3');await local.getByRole('group',{name:'Amount',exact:true}).getByRole('button',{name:'Large',exact:true}).click();await local.getByRole('button',{name:'Save record',exact:true}).click();await local.locator('.form-sheet-layer').waitFor({state:'detached'});await local.getByText(/Bristol type: 3 · Amount: Large/).waitFor();await local.getByRole('link',{name:'Poo',exact:true}).click();await local.getByRole('heading',{name:'Poo',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,widgets:4,multipleInstances:true,touchDrag:true,mouseDrag:true,positionRestored:true,reducedMotion:true,trackerEntries:entries.length,careCompletions:2,themeFollowsVintage:true,modes:2,widths:[402,1440],localTrackerSaveAndNavigation:true,cloudWrites:0}));
  await context.close();
} finally {await browser?.close();await server.close();}
