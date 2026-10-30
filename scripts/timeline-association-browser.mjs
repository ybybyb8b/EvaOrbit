/** Shared Settings/Home with synthetic account-bound API fixtures; no cloud writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
import {defaultCalendarInterpretation} from '../src/lib/calendar-interpretation.ts';
import {defaultTimelineAssociation,matchTimelineAssociations,projectTimelineAssociations} from '../src/lib/timeline-association.ts';
import {buildCalendarTimelineEvents} from '../src/lib/calendar-timeline.ts';
import {buildTimelineEvents,summarizeTimelineDays} from '../src/lib/timeline.ts';
import {dateInEvaOrbit,dateRange} from '../src/lib/time.ts';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const account='10000000-0000-4000-8000-000000000001',today=dateInEvaOrbit();
const tracker={id:3,name:'Shower',icon:'circle',iconType:'default',iconValue:'',groupName:'Daily',timeType:'point',quickCaptureEnabled:true,statsConfig:{},createdAt:'',updatedAt:''};
const calendar={id:4,title:'洗香香',startAt:today+'T00:12:00+08:00',endAt:today+'T00:43:00+08:00',notes:'Original Calendar note',location:'Home',timezone:'Asia/Shanghai',isAllDay:false,status:'confirmed',createdAt:'',updatedAt:''};
const entry={id:5,trackerId:3,occurredAt:new Date(today+'T00:43:00+08:00').toISOString(),endAt:null,values:{},note:'Original Tracker note',createdAt:'',updatedAt:''};
const detail={tracker,fields:[],entries:[entry],goals:[],reminders:[],stats:{total:1,today:1,week:1,month:1,year:1,lastOccurredAt:entry.occurredAt,reminderDue:false},insights:{}};
let settings=defaultTimelineAssociation(),conflict=false,offline=false,settingsReads=0;
const writes=[],errors=[],port=await freeLocalPort();let server,browser,context;
function events(date){const range=dateRange(date),raw=[...buildCalendarTimelineEvents([calendar],range),...date===today?buildTimelineEvents([],[],[entry],[tracker]):[]];return projectTimelineAssociations(raw,matchTimelineAssociations(settings,[calendar],[entry],[tracker],true),range);}
function resource(kind,key){return {format:'eo-home-readonly-v1',accountId:account,kind,key,capturedAt:new Date().toISOString(),data:kind==='due'?[]:kind==='month'?{month:key,days:summarizeTimelineDays(events(today)),periods:[]}:{date:key,events:events(key),tasks:[],meals:[],journal:[],sleep:null,activities:[],activityRecords:[],calendarInterpretation:defaultCalendarInterpretation()}};}
try {
 await fs.mkdir('tmp',{recursive:true});server=await createServer({configFile:path.resolve('vite.trackers.config.ts'),server:{host:'127.0.0.1',port,strictPort:true}});await server.listen();console.log(JSON.stringify({pid:process.pid,port}));
 browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});context.setDefaultTimeout(20000);
 await context.addInitScript(()=>{localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.trackerMode','readonly');});
 await context.route('**/eo-api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;
  if(offline)return route.abort();
  if(p==='/eo-api/session')return route.fulfill({json:{authenticated:true,accountId:account,email:'fixture@example.invalid',settingsConfigurationProtocol:1}});
  if(p==='/eo-api/settings-config/timeline-association'){
   assert.equal(req.headers()['x-evaorbit-account'],account);
   if(req.method()==='PUT'){
    const input=req.postDataJSON();writes.push(input);
    if(conflict){conflict=false;settings={...settings,revision:settings.revision+1};return route.fulfill({status:409,json:{error:'Rules changed. Reload rules and try again.'}});}
    assert.equal(input.revision,settings.revision);settings={...input,revision:input.revision+1};return route.fulfill({json:settings});
   }
   settingsReads++;return route.fulfill({json:{settings,trackers:[tracker]}});
  }
  const home=/^\/eo-api\/home-readonly\/(day|month|due)\/([^/]+)$/.exec(p);
  if(home)return route.fulfill({json:resource(home[1],home[2])});
  if(p==='/eo-api/trackers')return route.fulfill({json:[{...tracker,totalEntries:1}]});
  if(p==='/eo-api/trackers/3')return route.fulfill({json:detail});
  return route.fulfill({status:404,json:{error:'Fixture only'}});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(`http://127.0.0.1:${port}`);
 await page.evaluate(async account=>{const db=await new Promise(resolve=>{const r=indexedDB.open('eo-tracker-local-v1',1);r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=db.transaction('session','readwrite');tx.objectStore('session').put({accountId:account,email:'fixture@example.invalid'},'current');tx.oncomplete=resolve;});db.close();},account);
 await page.reload();await page.locator('.home-selected-day-events').waitFor();assert.equal(await page.locator('.home-activity-item').count(),2);
 await navigateLocal(page,'Settings');await page.getByRole('button',{name:/Timeline association rules/}).click();await page.getByRole('button',{name:'Add rule',exact:true}).click();
 const form=page.locator('#timeline-association-form');await form.getByLabel('Rule name',{exact:true}).fill('Shower');await form.getByLabel('Calendar title',{exact:true}).fill('洗香香');assert.equal(await form.getByLabel('Tolerance on each side (minutes)').inputValue(),'5');
 async function capture(label){for(const width of [402,1280]){await page.setViewportSize({width,height:874});await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+' overflow');if(label==='home')await page.locator('.home-day-timeline').scrollIntoViewIfNeeded();await page.screenshot({path:`tmp/timeline-association-${label}-${width}.png`,fullPage:true});}await page.setViewportSize({width:402,height:874});}
 await capture('editor');
 await page.locator('button[form="timeline-association-form"]').click();await form.waitFor({state:'detached'});assert.equal(settings.rules.length,1);await capture('settings');
 await navigateLocal(page,'Home');await page.locator('.home-activity-item').filter({hasText:'2 associated records'}).waitFor();assert.equal(await page.locator('.home-activity-item').count(),1);await capture('home');
 await page.locator('.home-activity-item').click();await page.getByRole('heading',{name:'Associated records',exact:true}).waitFor();await page.getByText('Original Calendar note',{exact:true}).waitFor();await page.getByText('Original Tracker note',{exact:true}).waitFor();await capture('detail');
 await page.getByRole('link',{name:'View / edit original Tracker record',exact:true}).click();await page.locator('#tracker-entry-form').waitFor();assert.equal(await page.locator('#tracker-entry-form textarea').inputValue(),'Original Tracker note');await page.locator('.form-sheet-header button').click();await page.locator('#tracker-entry-form').waitFor({state:'detached'});
 async function openRules(){for(const close of await page.locator('.error-banner-close').all())await close.click();await navigateLocal(page,'Settings');await page.getByRole('button',{name:/Timeline association rules/}).click();await page.locator('.calendar-rule-row').first().click();await form.waitFor();}
 await openRules();await form.getByRole('switch').uncheck();await page.locator('button[form="timeline-association-form"]').click();await form.waitFor({state:'detached'});assert.equal(settings.rules[0].enabled,false);
 await navigateLocal(page,'Home');await page.locator('.home-activity-item').filter({hasText:'Shower'}).waitFor();assert.equal(await page.locator('.home-activity-item').count(),2);
 await openRules();conflict=true;await form.getByRole('switch').check();await page.locator('button[form="timeline-association-form"]').click();await page.getByRole('button',{name:'Reload rules, keep draft',exact:true}).click();assert.equal(await form.getByRole('switch').isChecked(),true);await page.locator('button[form="timeline-association-form"]').click();await form.waitFor({state:'detached'});assert.equal(settings.rules[0].enabled,true);
 await page.locator('.calendar-rule-row').first().click();await page.getByRole('button',{name:'Delete rule',exact:true}).click();await page.getByRole('button',{name:'Delete rule',exact:true}).click();await form.waitFor({state:'detached'});assert.deepEqual(settings.rules,[]);
 assert(settingsReads>=3);assert.deepEqual(errors,[]);assert.equal(entry.note,'Original Tracker note');console.log(JSON.stringify({passed:true,widths:[402,1280],ruleWrites:writes.length,settingsReads,cloudWrites:0,scenarios:['create','edit','disable','enable','delete','CAS reload keeps draft','merged detail','local original editor','day/month refresh']}));
} finally {
 await context?.close();await browser?.close();await server?.close();
 const {createServer:probeServer}=await import('node:net');await new Promise((resolve,reject)=>{const probe=probeServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolve()));});console.log(JSON.stringify({closedTestPort:port}));
}
