import {navigateLocal} from "./local-navigation-browser.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { preview } from "vite";
import { dateInEvaOrbit, shiftDate } from "../src/lib/time.ts";
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||"playwright");
const profile=await fs.mkdtemp(path.resolve("tmp/home-offline-browser-"));
const server=await preview({configFile:path.resolve("vite.trackers.config.ts"),preview:{host:"127.0.0.1",port:0,strictPort:true}});
const account="10000000-0000-4000-8000-000000000001",today=dateInEvaOrbit(),capturedAt=new Date().toISOString(),errors=[],writes=[];
const resource=(kind,key,data)=>({format:"eo-home-readonly-v1",accountId:account,kind,key,capturedAt,data});
const day=key=>resource("day",key,{date:key,events:[],tasks:[],meals:[],journal:[{id:1,date:key,content:"Offline canary day note",emotion:"neutral",energyLevel:2,hasFullDiary:false}],sleep:null,activities:[],activityRecords:[],calendarInterpretation:{categories:[],rules:[]}});
const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhAAAAABJRU5ErkJggg==";
const tracker={id:1,name:"Offline icon canary",groupName:"Acceptance",iconType:"image",iconValue:"private/icon.png",updatedAt:capturedAt,quickCaptureEnabled:true};
const snapshot={format:"eo-trackers-readonly-v1",accountId:account,capturedAt,details:[{tracker,fields:[],entries:[],goals:[],reminders:[],stats:{total:0}}],images:{1:{version:capturedAt,dataUrl:png}}};
const oldState={schemaVersion:1,accountId:account,revision:1,records:[],outbox:[{mutationId:"keep-old",wire:{payload:{note:"never upload"}}}]};
let context;
async function open(){
 context=await chromium.launchPersistentContext(profile,{channel:"chrome",headless:true,viewport:{width:402,height:874},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{localStorage.setItem("evaorbit.uiLanguage","en");localStorage.setItem("evaorbit.englishFont","ibm");});
 const page=context.pages()[0];page.on("pageerror",error=>errors.push(String(error)));page.on("request",request=>{if(!["GET","HEAD"].includes(request.method()))writes.push(request.url());});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`,{waitUntil:"networkidle"});return page;
}
try {
 let page=await open();
 const previous=shiftDate(today,-1);
 const resources=[day(today),day(previous),...new Set([today.slice(0,7),previous.slice(0,7)])].map(value=>typeof value==="string"?resource("month",value,{month:value,days:{},periods:[]}):value);
 resources.push(resource("due","current",[{id:8,title:"Read-only reminder",subjectLabel:"Canary",targetType:"task",overdueMs:0}]));
 await page.evaluate(async({account,snapshot,oldState,resources})=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction(["states","session"],"readwrite"),store=tx.objectStore("states");store.put(snapshot,"readonly:"+account);store.put(oldState,account);tx.objectStore("session").put({accountId:account,email:"offline@example.invalid"},"current");for(const value of resources)store.put(value,`home:${account}:${value.kind}:${value.key}`);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 },{account,snapshot,oldState,resources});
 await page.reload({waitUntil:"networkidle"});
 await page.locator(".tracker-card").waitFor();
 await page.locator(".tracker-card img").waitFor();
 assert.equal(await page.locator(".tracker-card img").evaluate(img=>img.complete&&img.naturalWidth>0),true);
 await page.locator(".tracker-card a").first().click();
 await page.getByRole("tab",{name:"Settings",exact:true}).click();
 await page.getByRole("heading",{name:"Basic information",exact:true}).waitFor();
 assert(await page.locator(".tracker-settings button").count()>0);
 for(const button of await page.locator(".tracker-settings button").all())assert(await button.isDisabled());
 await page.locator(".tracker-icon-settings img").waitFor();
 await page.screenshot({path:"tmp/tracker-shared-settings-english-mobile.png",fullPage:true});
 if(await page.locator(".error-banner").count())await page.getByRole("button",{name:"Dismiss error",exact:true}).click();
 await navigateLocal(page,"Home");
 await page.locator(".home-page").waitFor();
 const bounds=await page.locator(".home-page").boundingBox();
 const original=await page.evaluate(()=>{const reference=document.createElement("div");reference.className="page home-page";reference.style.visibility="hidden";document.body.append(reference);const {x,width}=reference.getBoundingClientRect();reference.remove();return {x,width};});
 assert.equal(bounds.x,original.x,"Home must use the original shared mobile page gutter without a second outer inset");
 assert.equal(bounds.width,original.width);
 if(await page.locator(".error-banner").count())await page.getByRole("button",{name:"Dismiss error",exact:true}).click();
 await page.getByText("Offline canary day note",{exact:true}).waitFor();
 assert.equal(await page.locator(".due-actions button").count(),3);
 for(const button of await page.locator(".due-actions button").all())assert(await button.isDisabled());
 assert.equal(await page.locator("html").getAttribute("data-english-font"),"ibm");
 await page.locator(".home-journal-preview-list button").first().click();
 await page.getByRole("heading",{name:"View day note",exact:true}).waitFor();
 assert(await page.locator("#home-journal-form textarea").isDisabled());
 assert.equal(await page.locator('button[form="home-journal-form"]').count(),0);
 await page.locator("#home-journal-form").evaluate(form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 await page.locator(".form-sheet-header button").click();
 await page.locator("#home-journal-form").waitFor({state:"detached"});
 for(const width of [402,1440]){
  await page.setViewportSize({width,height:874});await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`tmp/home-shared-english-${width}.png`,fullPage:true});
 }
 await context.close();context=null;page=await open();
 if(await page.locator(".error-banner").count())await page.getByRole("button",{name:"Dismiss error",exact:true}).click();
 await navigateLocal(page,"Home");
 await page.getByText("Offline canary day note",{exact:true}).waitFor();
 const preserved=await page.evaluate(async account=>{const r=indexedDB.open("eo-tracker-local-v1",1);const db=await new Promise(resolve=>{r.onsuccess=()=>resolve(r.result);});const tx=db.transaction("states"),read=tx.objectStore("states").get(account);const result=await new Promise(resolve=>{tx.oncomplete=()=>resolve(read.result);});db.close();return result;},account);
 assert.deepEqual(preserved,oldState);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 // Simulate an offline launch after midnight: only the previous day is downloaded.
 await page.evaluate(async({account,today})=>{const r=indexedDB.open("eo-tracker-local-v1",1),db=await new Promise(resolve=>{r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=db.transaction("states","readwrite");tx.objectStore("states").delete(`home:${account}:day:${today}`);tx.oncomplete=resolve;});db.close();},{account,today});
 await page.reload({waitUntil:"networkidle"});
 if(await page.locator(".error-banner").count())await page.getByRole("button",{name:"Dismiss error",exact:true}).click();
 await navigateLocal(page,"Home");
 await page.getByText("Offline canary day note",{exact:true}).waitFor();
 await page.locator(".home-calendar-today").waitFor();
 assert.equal(await page.locator(".home-calendar-grid button.selected").getAttribute("data-today"),"false");
 console.log(JSON.stringify({homeOfflineRestart:true,previousDayNotToday:true,dueActionsDisabled:true,trackerIconPersistence:true,sharedSettingsReadOnly:true,noteSubmissionBlocked:true,queuePreserved:true,businessWrites:0,widths:[402,1440],deviceVerified:false}));
} finally {await context?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
