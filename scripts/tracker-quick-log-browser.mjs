// Synthetic preview account: exercise the real Home Log and its local Tracker queue.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {createServer} from "vite";
import {createServer as probeServer} from "node:net";
import {freeLocalPort} from "./local-navigation-browser.mjs";
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||"playwright");
const port=await freeLocalPort(),account="00000000-0000-4000-8000-000000000001";
const directory=await fs.mkdtemp(path.resolve("tmp/tracker-log-qa-"));
const server=await createServer({configFile:path.resolve("vite.trackers.config.ts"),server:{host:"127.0.0.1",port,strictPort:true}});
let browser;
const errors=[],writes=[];
const before=process.argv.includes("--before");
try{
 await server.listen();console.log(JSON.stringify({pid:process.pid,port,directory}));
 browser=await chromium.launch({channel:"chrome",headless:true});
 const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{if(!localStorage.getItem("evaorbit.uiLanguage"))localStorage.setItem("evaorbit.uiLanguage","en");localStorage.setItem("evaorbit.appearanceMode","light");});
 await context.route("**/eo-api/**",route=>route.abort());await context.route("**/api/**",route=>route.abort());
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on("pageerror",error=>errors.push(String(error)));page.on("request",r=>{if(!["GET","HEAD"].includes(r.method()))writes.push(r.url());});
 await page.goto(`http://127.0.0.1:${port}`,{waitUntil:"networkidle"});
 await page.evaluate(async account=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);});
  const records=[
   {id:"manual",resourceType:"tracker",payload:{name:"Daily reading",groupName:"Personal routines",quickCaptureEnabled:false}},
   {id:"quick",resourceType:"tracker",payload:{name:"Take a walk",groupName:"Movement",quickCaptureEnabled:true}},
   {id:"long",resourceType:"tracker",payload:{name:"Reading and reflecting on the books I want to revisit",groupName:"A longer group name that needs room to wrap",quickCaptureEnabled:false}},
   {id:"ungrouped",resourceType:"tracker",payload:{name:"Stretch",groupName:"",quickCaptureEnabled:true}},
   {id:"field",resourceType:"tracker_field",payload:{trackerLocalId:"manual",key:"pages",name:"Pages",type:"number",required:true,sortOrder:0}},
  ];
  await new Promise((resolve,reject)=>{const tx=db.transaction(["session","states"],"readwrite");tx.objectStore("session").put({accountId:account,email:"preview@example.invalid"},"current");tx.objectStore("states").put({schemaVersion:1,accountId:account,revision:1,records,outbox:[]},account);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 },account);
 await page.reload({waitUntil:"networkidle"});
 const picker=async()=>{await page.locator(".home-quick-log-trigger").click();await page.locator(".home-quick-log-grid").getByRole("button",{name:"Tracker",exact:true}).click();await page.locator(".home-quick-tracker-list").waitFor();};
 const close=async()=>{await page.locator(".form-sheet-header button").click();const discard=page.getByRole("button",{name:"Discard and close",exact:true});if(await discard.isVisible())await discard.click();await page.locator(".form-sheet-panel").waitFor({state:"detached"});};
 for(const theme of ["vintage"])for(const mode of ["light","dark"])for(const width of [402,1280]){
  await page.setViewportSize({width,height:874});await page.evaluate(({theme,mode})=>{document.documentElement.dataset.designTheme=theme;document.documentElement.dataset.mode=mode;},{theme,mode});
  await picker();
  if(!before){
   assert.equal(await page.locator(".home-quick-tracker-list>button>.icon").count(),0);
   const columns=await page.locator(".home-quick-tracker-list").evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length);
   assert.equal(columns,width===402||theme==="vintage"?2:3);
   const overflow=await page.locator(".home-quick-tracker-list strong,.home-quick-tracker-list small").evaluateAll(elements=>elements.some(el=>el.scrollWidth>el.clientWidth+1));assert(!overflow,"names and metadata fit without truncation");
   for(const button of await page.locator(".home-quick-tracker-list>button").all())assert((await button.boundingBox()).height>=44);
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({animations:"disabled",path:path.join(directory,`${before?"before":"after"}-${theme}-${mode}-${width}.png`)});await close();
 }
 if(!before){
  await picker();await page.getByRole("button",{name:"Daily reading",exact:true}).click();await page.locator("#tracker-entry-form").waitFor();
  await page.locator('#tracker-entry-form input[type="number"]').fill("12");await page.locator('button[form="tracker-entry-form"]').click();await page.locator(".form-sheet-panel").waitFor({state:"detached"});
  await picker();await page.getByRole("button",{name:"Quick record Take a walk",exact:true}).click();await page.locator(".form-sheet-panel").waitFor({state:"detached"});
  const saved=await page.evaluate(async account=>{const db=await new Promise(resolve=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const r=db.transaction("states").objectStore("states").get(account);r.onsuccess=()=>{resolve(r.result);db.close();};});},account);
  assert.equal(saved.outbox.length,2);assert.equal(saved.records.filter(row=>row.resourceType==="tracker_entry").length,2);
  await page.evaluate(()=>{localStorage.setItem("evaorbit.trackerMode","readonly");localStorage.setItem("evaorbit.uiLanguage","zh-CN");});await page.reload({waitUntil:"networkidle"});
  await page.locator(".home-quick-log-trigger").click();await page.locator(".home-quick-log-grid").getByRole("button",{name:"观测",exact:true}).click();
  assert.equal(await page.locator('.home-quick-tracker-list>button[aria-label^="快速记录"]').count(),0,"read-only forms must not promise an instant write");
  await page.getByRole("button",{name:"Take a walk",exact:true}).click();assert(await page.locator('button[form="tracker-entry-form"]').isDisabled());await close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 console.log(JSON.stringify({passed:true,before,themes:2,modes:2,widths:[402,1280],directory,manualAndQuickCapture:!before,readOnly:!before}));
}finally{
 await browser?.close();await server.close();
 await new Promise((resolve,reject)=>{const probe=probeServer();probe.once("error",reject);probe.listen(port,"127.0.0.1",()=>probe.close(resolve));});console.log(JSON.stringify({closedTestPort:port}));
}
