import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {createServer,preview} from "vite";
import {navigateLocal,freeLocalPort} from "./local-navigation-browser.mjs";
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||"playwright");
const directory=await fs.mkdtemp(path.resolve("tmp/quick-log-browser-"));
const account="00000000-0000-4000-8000-000000000001";
const fixture=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",
  "import {seedHealth} from './scripts/health-readonly-fixture.mjs';import {seedCats} from './scripts/cats-readonly-fixture.mjs';import {getHealthReadonlySnapshot} from './src/lib/services/health-readonly.ts';import {getCatsReadonlySnapshot} from './src/lib/services/cats-readonly.ts';await seedHealth();await seedCats();console.log(JSON.stringify({health:await getHealthReadonlySnapshot('"+account+"'),cats:await getCatsReadonlySnapshot('"+account+"')}));"],
  {encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"fixture.db"),EVAORBIT_CAT_AVATAR_DIR:path.join(directory,"avatars"),VERCEL:""}});
assert.equal(fixture.status,0,fixture.stderr);
const snapshots=JSON.parse(fixture.stdout.trim()),writes=[],errors=[],direct=[];
let server,context,port;
const bundled=process.argv.includes("--bundle");
async function close(page){await page.locator(".form-sheet-header button").click();const discard=page.getByRole("button",{name:"Discard and close",exact:true});if(await discard.isVisible())await discard.click();await page.locator(".form-sheet-layer").waitFor({state:"detached"});}
async function cache(page,key){return page.evaluate(async key=>{const db=await new Promise(resolve=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const r=db.transaction("states").objectStore("states").get(key);r.onsuccess=()=>{resolve(r.result);db.close();};});},key);}
async function picker(page,name){await page.locator(".home-quick-log-trigger").click();await page.locator(".home-quick-log-grid").getByRole("button",{name,exact:true}).click();}
try{
 port=await freeLocalPort();server=bundled?await preview({configFile:path.resolve("vite.trackers.config.ts"),preview:{host:"127.0.0.1",port,strictPort:true}}):await createServer({configFile:path.resolve("vite.trackers.config.ts"),server:{host:"127.0.0.1",port,strictPort:true}});if(!bundled)await server.listen();
 console.log(JSON.stringify({pid:process.pid,port,bundled}));
 context=await chromium.launchPersistentContext(path.join(directory,"profile"),{channel:"chrome",headless:true,viewport:{width:402,height:874},isMobile:true,hasTouch:true});context.setDefaultTimeout(12000);
 await context.addInitScript(()=>{localStorage.setItem("evaorbit.uiLanguage","en");localStorage.setItem("evaorbit.englishFont","ibm");});
 await context.route("**/eo-api/**",route=>route.abort());await context.route("**/api/**",route=>route.abort());
 const page=context.pages()[0];page.on("pageerror",error=>errors.push(String(error)));page.on("request",request=>{if(!["GET","HEAD"].includes(request.method()))writes.push(request.url());if(new URL(request.url()).pathname.startsWith("/api/"))direct.push(request.url());});
 await page.goto("http://127.0.0.1:"+port,{waitUntil:"networkidle"});
 await page.evaluate(async({account,snapshots})=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);});
  const records=[{id:"manual",resourceType:"tracker",payload:{name:"Manual capture",groupName:"Daily",quickCaptureEnabled:false}},{id:"quick",resourceType:"tracker",payload:{name:"Quick capture",groupName:"Daily",quickCaptureEnabled:true}},{id:"field",resourceType:"tracker_field",payload:{trackerLocalId:"manual",key:"value",name:"Value",type:"number",required:true,sortOrder:0}}];
  await new Promise((resolve,reject)=>{const tx=db.transaction(["session","states"],"readwrite"),states=tx.objectStore("states");tx.objectStore("session").put({accountId:account,email:"preview@example.invalid"},"current");states.put({schemaVersion:1,accountId:account,revision:1,records,outbox:[]},account);states.put(snapshots.health,"health-readonly:"+account);states.put(snapshots.cats,"cats-readonly:"+account);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 },{account,snapshots});
 if(!process.argv.includes("--sync-only")){
 await page.reload({waitUntil:"networkidle"});await page.locator(".home-calendar-grid").waitFor();
 const day=page.locator(".home-calendar-grid button").first();const selectedDate=(await day.getAttribute("aria-label")).slice(0,10);await day.click();
 await page.locator(".home-quick-log-trigger").click();await page.locator(".home-quick-log-grid button").last().waitFor();assert.equal(await page.locator(".home-quick-log-grid button").count(),10);await close(page);
 await picker(page,"Tracker");await page.getByRole("button",{name:/Manual capture/}).click();assert((await page.locator('input[type="datetime-local"]').inputValue()).startsWith(selectedDate));
 await page.locator('#tracker-entry-form input[type="number"]').fill("12");await page.locator('#tracker-entry-form textarea').fill("Universal Log canary");await page.locator('button[form="tracker-entry-form"]').click();await page.locator("#tracker-entry-form").waitFor({state:"detached"});
 let saved=await cache(page,account);assert.equal(saved.records.filter(row=>row.resourceType==="tracker_entry").length,1);assert.equal(saved.outbox.length,1);assert.equal(saved.records.find(row=>row.resourceType==="tracker_entry").payload.note,"Universal Log canary");
 await picker(page,"Tracker");await page.getByRole("button",{name:/Quick capture/}).click();await page.locator(".form-sheet-layer").waitFor({state:"detached"});
 saved=await cache(page,account);assert.equal(saved.outbox.length,2);
 await navigateLocal(page,"Trackers");await page.getByText("Manual capture",{exact:true}).first().click();await page.getByText("Universal Log canary",{exact:true}).waitFor();
 await page.locator(".home-quick-log-trigger").click();await page.locator("#tracker-entry-form").waitFor();await close(page);
 await navigateLocal(page,"Home");await page.locator(".home-calendar-grid").waitFor();await page.locator('.home-calendar-grid button[aria-label^="'+selectedDate+'"]').click();
 for(const name of ["Training","Weight","Period / Flow","Medication dose","Health record","Cats","Food","Drink","Inbox"]){
  console.log("Checking preview: "+name);await picker(page,name);if(name==="Cats")await page.locator(".cat-log-choices button").first().click();await page.locator(".form-sheet-layer form").first().waitFor();
  if(name==="Weight")assert((await page.locator('input[type="date"]').first().inputValue()).startsWith(selectedDate));
  // Even a synthetic submit bypassing a disabled button must never reach an API.
  for(const form of await page.locator(".form-sheet-layer form").all())await form.evaluate(element=>element.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  await close(page);
 }
 for(const width of [402,1280]){await page.setViewportSize({width,height:874});await page.locator(".home-quick-log-trigger").click();await page.locator(".home-quick-log-grid").waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(directory,"picker-"+width+".png")});await close(page);}
 await page.reload({waitUntil:"networkidle"});assert.equal((await cache(page,account)).outbox.length,2);
 // Pausing edits must also pause the global Tracker form and preserve the queue.
 await page.evaluate(()=>localStorage.setItem("evaorbit.trackerMode","readonly"));await page.reload({waitUntil:"networkidle"});await page.locator(".home-calendar-grid").waitFor();await picker(page,"Tracker");await page.getByRole("button",{name:/Manual capture/}).click();assert(await page.locator('button[form="tracker-entry-form"]').isDisabled());await page.locator("#tracker-entry-form").evaluate(form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));assert.equal((await cache(page,account)).outbox.length,2);
 assert.deepEqual(writes,[]);await close(page);await page.setViewportSize({width:402,height:874});
 }
 await page.setViewportSize({width:402,height:874});
 if(!bundled){
 const liveAccount="10000000-0000-4000-8000-000000000001",legacy={schemaVersion:1,accountId:liveAccount,revision:7,records:[],outbox:[{mutationId:"legacy-frozen-never-upload"}]};
 const remote=[{resourceType:"tracker",serverId:1,version:1,payload:{name:"Versioned capture",groupName:"Daily",quickCaptureEnabled:false}},{resourceType:"tracker_field",serverId:2,version:1,payload:{trackerId:1,key:"value",name:"Value",type:"number",required:true,sortOrder:0}}];
 await page.evaluate(async({liveAccount,legacy,remote})=>{
  localStorage.removeItem("evaorbit.trackerMode");const db=await new Promise(resolve=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);});
  await new Promise((resolve,reject)=>{const tx=db.transaction(["session","states"],"readwrite"),states=tx.objectStore("states");tx.objectStore("session").put({accountId:liveAccount,email:"isolated@example.invalid"},"current");states.put(legacy,liveAccount);states.put({schemaVersion:1,accountId:liveAccount,revision:1,remoteRevision:1,records:remote.map(row=>({...row,id:"remote:"+row.resourceType+":"+row.serverId})),outbox:[]},"replica-v1:"+liveAccount);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 },{liveAccount,legacy,remote});
 await page.reload({waitUntil:"networkidle"});await page.locator(".home-quick-log-trigger").waitFor();await picker(page,"Tracker");await page.getByRole("button",{name:/Versioned capture/}).click();await page.locator('#tracker-entry-form input[type="number"]').fill("42");await page.locator('button[form="tracker-entry-form"]').click();await page.locator("#tracker-entry-form").waitFor({state:"detached"});
 assert.equal((await cache(page,"replica-v1:"+liveAccount)).outbox.length,1);assert.deepEqual(await cache(page,liveAccount),legacy);
 await navigateLocal(page,"Trackers");
 await page.locator('.tracker-sync-button[data-status="attention"]').waitFor();
 assert.equal(await page.locator('.local-trackers > .local-sync-status,.local-trackers > .development-details,.error-banner').count(),0);
 await page.locator('.tracker-sync-button').click();await page.locator('.tracker-sync-settings .form-error').waitFor();
 assert.equal(await page.locator('.tracker-sync-settings .settings-summary strong').first().textContent(),"1");
 if(process.argv.includes("--status")){
  await page.locator('.form-sheet-layer[data-state="open"]').waitFor();await page.locator('.form-sheet-layer').evaluate(async element=>{await Promise.all(element.getAnimations({subtree:true}).filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));});
  await page.screenshot({path:path.join(directory,"sync-details-402.png")});
 }
 await close(page);await navigateLocal(page,"Settings");await page.locator('.tracker-sync-settings .form-error').waitFor();
 assert.equal(await page.locator('.error-banner').count(),0);
 await context.unroute("**/eo-api/**");let revision=2;const uploaded=[];
 await context.route("**/eo-api/**",async route=>{
  const request=route.request(),p=new URL(request.url()).pathname,json=value=>route.fulfill({contentType:"application/json",body:JSON.stringify(value)});
  if(p==="/eo-api/session")return json({authenticated:true,accountId:liveAccount});
  if(p!=="/eo-api/sync")return route.abort();
  const body=request.postDataJSON();assert.equal(body.accountId,liveAccount);assert.equal(body.protocolVersion,2);
  const results=body.mutations.map(mutation=>{assert.equal(mutation.resourceType,"tracker_entry");assert.equal(mutation.operation,"create");assert.notEqual(mutation.mutationId,legacy.outbox[0].mutationId);uploaded.push(mutation);remote.push({resourceType:"tracker_entry",serverId:50,version:1,payload:mutation.payload});revision++;return{mutationId:mutation.mutationId,status:"applied",serverId:50,version:1};});
  return json({protocolVersion:2,accountId:liveAccount,results,snapshot:{complete:true,revision,records:remote}});
 });
 await page.evaluate(()=>window.dispatchEvent(new Event("online")));
 for(let attempt=0;attempt<80&&(await cache(page,"replica-v1:"+liveAccount)).outbox.length;attempt++)await page.waitForTimeout(50);

 assert.equal((await cache(page,"replica-v1:"+liveAccount)).outbox.length,0);assert.equal(uploaded.length,1);assert.deepEqual(await cache(page,liveAccount),legacy);
 assert(writes.every(url=>new URL(url).pathname==="/eo-api/sync"));
 if(process.argv.includes("--status")){
  await page.getByText("No pending changes",{exact:true}).waitFor();
  assert.notEqual(await page.locator('.tracker-sync-settings .settings-summary strong').last().textContent(),"—");
  await navigateLocal(page,"Trackers");await page.locator('.tracker-sync-button[data-status="current"]').waitFor();
  for(const width of [402,1280]){await page.setViewportSize({width,height:874});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(directory,"tracker-sync-"+width+".png")});}
  // Preserve a real replica-shaped conflict to exercise the relocated resolution UI.
  const cloudEntry=remote.find(row=>row.resourceType==="tracker_entry");cloudEntry.version=2;cloudEntry.payload.note="Remote version canary";revision++;
  await page.evaluate(async({account,remote})=>{const db=await new Promise(resolve=>{const request=indexedDB.open("eo-tracker-local-v1",1);request.onsuccess=()=>resolve(request.result);});await new Promise((resolve,reject)=>{const tx=db.transaction("states","readwrite"),states=tx.objectStore("states"),request=states.get("replica-v1:"+account);request.onsuccess=()=>{const state=request.result,row=state.records.find(row=>row.resourceType==="tracker_entry");row.status="conflict";row.error="Remote changed; both versions preserved";row.payload.note="Local version canary";row.remote=remote;state.outbox.push({mutationId:crypto.randomUUID(),localId:row.id,resourceType:"tracker_entry",operation:"update",payload:row.payload});state.revision++;states.put(state,"replica-v1:"+account);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();},{account:liveAccount,remote:cloudEntry});
  await page.setViewportSize({width:402,height:874});await page.reload({waitUntil:"networkidle"});await navigateLocal(page,"Trackers");await page.locator('.tracker-sync-button[data-status="attention"]').waitFor();assert.equal(await page.locator('.local-trackers > .local-sync-issues').count(),0);
  await page.locator('.tracker-sync-button').click();await page.getByText("Local version canary",{exact:true}).waitFor();await page.getByText("Compare preserved versions",{exact:true}).click();assert((await page.locator('.tracker-sync-settings pre').textContent()).includes("Remote version canary"));
  await page.getByRole('button',{name:'Use remote',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await cache(page,"replica-v1:"+liveAccount)).outbox.length,1);
  await page.getByRole('button',{name:'Use remote',exact:true}).click();await page.getByRole('button',{name:'Confirm replacement',exact:true}).click();await page.locator('.tracker-sync-settings .local-sync-issues').waitFor({state:'detached'});assert.equal((await cache(page,"replica-v1:"+liveAccount)).outbox.length,0);assert.deepEqual(await cache(page,liveAccount),legacy);
  await close(page);await page.evaluate(()=>localStorage.setItem('evaorbit.trackerMode','readonly'));await page.reload({waitUntil:'networkidle'});await navigateLocal(page,'Trackers');await page.locator('.tracker-sync-button[data-status="paused"]').waitFor();
 }
 }
 assert.deepEqual(direct,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:"PASS",bundled,checks:process.argv.includes("--sync-only")?[...(process.argv.includes("--status")?["compact cloud status and Settings panel","background failure stays inline; no top banner","manual conflict resolution and cancel preserve data","pause status; 402/1280 layout"]:[]),"versioned real-account adapter with synthetic data","offline capture stays in independent replica","mocked reconnect uploads exactly one mutation","legacy frozen queue unchanged"]:["shared ten-item picker","selected Home date","local manual and quick Tracker capture","shared page action and persistence","all Health/Cats/Food/Drink/Inbox previews reject forced submit","read-only queue unchanged","402/1280 layout",bundled?"packaged CSP blocks direct network access":"mocked reconnect uploads exactly one independent mutation; legacy queue preserved"],directory}));
}catch(error){if(context){const page=context.pages()[0];console.log(JSON.stringify({body:(await page.locator("body").innerText()).slice(-2500),errors}));await page.screenshot({path:path.join(directory,"failure.png")});}throw error;}finally{await context?.close();await server?.close();if(port){const {createServer}=await import("node:net");await new Promise((resolve,reject)=>{const probe=createServer();probe.once("error",reject);probe.listen(port,"127.0.0.1",()=>probe.close(resolve));});}}
