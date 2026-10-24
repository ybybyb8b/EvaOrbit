import {navigateLocal} from "./local-navigation-browser.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {createServer,preview} from "vite";
import {createServer as probeServer} from "node:net";
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||"playwright");
const profile=await fs.mkdtemp(path.resolve("tmp/subscriptions-offline-browser-"));
const fixture=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
  import {seedSubscriptions} from './scripts/subscriptions-readonly-fixture.mjs';
  import {getSubscriptionsReadonlySnapshot} from './src/lib/services/subscriptions-readonly.ts';
  await seedSubscriptions();console.log(JSON.stringify(await getSubscriptionsReadonlySnapshot('10000000-0000-4000-8000-000000000001')));
`],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(profile,"fixture.db"),EVAORBIT_SUBSCRIPTION_ICON_DIR:path.join(profile,"icons"),EVAORBIT_SOFTWARE_ICON_DIR:path.join(profile,"software-icons"),VERCEL:""}});
assert.equal(fixture.status,0,fixture.stderr);
const snapshot=JSON.parse(fixture.stdout.trim()),account=snapshot.accountId,errors=[],writes=[],direct=[],old={schemaVersion:1,accountId:account,revision:1,records:[],outbox:[{mutationId:"subscriptions-frozen-canary",wire:{payload:{note:"never upload"}}}]};
const freePort=()=>new Promise((resolve,reject)=>{const p=probeServer();p.once("error",reject);p.listen(0,"127.0.0.1",()=>{const n=p.address().port;p.close(e=>e?reject(e):resolve(n));});});
const server=await createServer({configFile:path.resolve("vite.trackers.config.ts"),server:{host:"127.0.0.1",port:await freePort(),strictPort:true}});
let context,packaged,offline=false,wrongAccount=false,invalid=false;
async function open(){
  context=await chromium.launchPersistentContext(profile,{channel:"chrome",headless:true,viewport:{width:402,height:874},isMobile:true,hasTouch:true});context.setDefaultTimeout(12000);
  await context.addInitScript(()=>{localStorage.setItem("evaorbit.uiLanguage","en");localStorage.setItem("evaorbit.englishFont","ibm");});
  await context.route("**/eo-api/**",async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()!=="GET"){writes.push(url.pathname);return route.fulfill({status:403,body:'{}'});}
    if(offline)return route.abort();const json=value=>route.fulfill({contentType:"application/json",body:JSON.stringify(value)});
    if(url.pathname==="/eo-api/session")return json({authenticated:true,accountId:wrongAccount?"20000000-0000-4000-8000-000000000002":account,email:"test@example.invalid"});
    if(url.pathname==="/eo-api/subscriptions-readonly")return json(invalid?{...snapshot,iconSources:{}}:snapshot);
    if(url.pathname==="/eo-api/trackers")return json([]);
    return route.fulfill({status:404,body:'{"error":"Fixture has no such module"}'});
  });
  const page=context.pages()[0];page.on("pageerror",e=>errors.push(String(e)));page.on("request",r=>{if(!["GET","HEAD"].includes(r.method()))writes.push(r.url());if(new URL(r.url()).pathname.startsWith("/api/"))direct.push(r.url());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`,{waitUntil:"networkidle"});return page;
}
async function dismiss(page){for(const b of await page.getByRole("button",{name:"Dismiss error",exact:true}).all())await b.click();}
async function subscriptions(page){await dismiss(page);await navigateLocal(page,"Subscriptions");await page.getByRole("heading",{name:"Subscriptions",exact:true}).waitFor();}
async function closeSheet(page){await page.locator(".form-sheet-header button").click();const discard=page.getByRole("button",{name:"Discard and close",exact:true});if(await discard.isVisible())await discard.click();await page.locator(".form-sheet-layer").waitFor({state:"detached"});}
async function forceForm(page,id){assert(await page.locator(`button[form="${id}"]`).isDisabled());await page.locator(`#${id}`).evaluate(form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
async function cache(page,key){return page.evaluate(async key=>{const db=await new Promise(resolve=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const r=db.transaction("states").objectStore("states").get(key);r.onsuccess=()=>{resolve(r.result);db.close();};});},key);}
async function openLedger(page){await page.getByRole("link",{name:/Offline ledger/}).last().click();await page.getByRole("heading",{name:"Offline ledger",exact:true}).waitFor();}
try{
  await server.listen();console.log(`Subscriptions preview listener ${server.httpServer.address().port}, PID ${process.pid}`);let page=await open();
  await page.evaluate(async({account,old})=>{const db=await new Promise(resolve=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);});await new Promise((resolve,reject)=>{const tx=db.transaction(["session","states"],"readwrite");tx.objectStore("session").put({accountId:account,email:"test@example.invalid"},"current");tx.objectStore("states").put(old,account);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();},{account,old});
  await page.reload({waitUntil:"networkidle"});await subscriptions(page);
  await page.locator('img[src^="data:image/png;base64,"]').first().waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('img[src^="data:image/png;base64,"]')].some(image=>image.complete&&image.naturalWidth>0));
  await page.screenshot({path:"tmp/subscriptions-shared-mobile.png",fullPage:true});
  await page.locator(".home-quick-log-trigger").click();await page.locator("#subscription-form").waitFor();await page.getByLabel("Name",{exact:true}).fill("Temporary subscription");assert(await page.locator('#subscription-form input[type="file"]').isDisabled());await forceForm(page,"subscription-form");await closeSheet(page);
  await page.getByRole("link",{name:"Trends",exact:true}).click();await page.getByRole("heading",{name:"Where it goes",exact:true}).waitFor();await page.getByRole("group",{name:"Chart currency",exact:true}).getByRole("button",{name:"USD",exact:true}).click();await page.getByRole("link",{name:"ChatGPT",exact:true}).waitFor();
  await page.screenshot({path:"tmp/subscriptions-trends-mobile.png",fullPage:true});
  await page.getByRole("link",{name:"Overview",exact:true}).click();
  await page.getByRole("button",{name:"Paused",exact:true}).click();await page.getByRole("link",{name:/Paused service/}).last().click();await page.getByRole("heading",{name:"Paused service",exact:true}).waitFor();
  assert(await page.locator(".home-quick-log-trigger").isDisabled());await page.locator(".home-quick-log-trigger").evaluate(button=>button.dispatchEvent(new MouseEvent("click",{bubbles:true})));assert.equal(await page.locator(".form-sheet-layer").count(),0);
  await page.getByRole("button",{name:"Resume",exact:true}).click();await page.locator("#subscription-resume-form").waitFor();await forceForm(page,"subscription-resume-form");await closeSheet(page);
  await page.getByRole("button",{name:"← Subscriptions",exact:true}).click();await page.getByRole("button",{name:"All",exact:true}).click();await openLedger(page);
  await page.getByRole("heading",{name:"Payment history",exact:true}).waitFor();await page.getByText("Old currency canary",{exact:true}).waitFor();await page.getByRole("heading",{name:"Price changes",exact:true}).waitFor();
  assert(await page.getByRole("button",{name:"Pause",exact:true}).isDisabled());assert(await page.getByRole("button",{name:"End subscription",exact:true}).isDisabled());
  await page.getByRole("button",{name:"Edit",exact:true}).click();await page.locator("#subscription-edit-form").waitFor();assert.equal(await page.locator('#subscription-edit-form input[type="date"]').last().inputValue(),"2025-01-01");assert.equal(await page.locator("#subscription-edit-form textarea").inputValue(),"Historical subscription canary");assert(await page.locator('#subscription-edit-form input[type="file"]').isDisabled());await page.getByLabel("Name",{exact:true}).fill("Temporary changed name");await forceForm(page,"subscription-edit-form");await closeSheet(page);
  await page.locator(".home-quick-log-trigger").click();await page.locator("#subscription-payment-form").waitFor();assert.equal(await page.locator('#subscription-payment-form input[type="date"]').first().inputValue(),"2025-01-01");await forceForm(page,"subscription-payment-form");await closeSheet(page);
  for(const width of [402,900,1280]){await page.setViewportSize({width,height:874});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.screenshot({path:"tmp/subscriptions-detail-desktop.png",fullPage:true});
  assert.deepEqual(await cache(page,account),old);assert.deepEqual(await cache(page,"subscriptions-readonly:"+account),snapshot);
  await context.close();context=null;offline=true;page=await open();await subscriptions(page);await openLedger(page);await page.getByRole("button",{name:"Edit",exact:true}).click();await page.locator('#subscription-edit-form img[src^="data:image/png;base64,"]').waitFor();assert.equal(await page.locator("#subscription-edit-form textarea").inputValue(),"Historical subscription canary");await closeSheet(page);
  offline=false;wrongAccount=true;await navigateLocal(page,"Trackers");await subscriptions(page);await page.getByText("Subscriptions account changed",{exact:false}).first().waitFor();assert.deepEqual(await cache(page,"subscriptions-readonly:"+account),snapshot);
  wrongAccount=false;invalid=true;await dismiss(page);await page.locator(".local-subscriptions-status summary").click();await page.getByRole("button",{name:"Refresh downloaded Subscriptions",exact:true}).click();await page.getByText("Invalid or incomplete Subscriptions snapshot",{exact:false}).first().waitFor();assert.deepEqual(await cache(page,"subscriptions-readonly:"+account),snapshot);assert.deepEqual(await cache(page,account),old);
  assert.deepEqual(writes,[]);assert.deepEqual(direct,[]);assert.deepEqual(errors,[]);await context.close();context=null;await server.close();
  packaged=await preview({configFile:path.resolve("vite.trackers.config.ts"),preview:{host:"127.0.0.1",port:await freePort(),strictPort:true}});console.log(`Subscriptions packaged listener ${packaged.httpServer.address().port}, PID ${process.pid}`);
  context=await chromium.launchPersistentContext(path.join(profile,"packaged"),{channel:"chrome",headless:true,viewport:{width:402,height:874}});
  await context.addInitScript(({snapshot,account})=>{window.mockMutations=[];window.EvaOrbitNative={version:1,call:async(method)=>{
    let result;
    if(method==="host.getInfo")result={methods:["trackers.readOnlySnapshot","trackers.acceptanceStatus","subscriptions.readOnlySnapshot"]};
    else if(method==="trackers.getSession")result={accountId:account,email:"test@example.invalid"};
    else if(method==="subscriptions.readOnlySnapshot")result=snapshot;
    else if(method==="trackers.acceptanceStatus")result={pending:2,frozen:1,sqliteVerified:true};
    else if(method==="trackers.readOnlySnapshot"||method==="appearance.setPreference")result=null;
    else{window.mockMutations.push(method);throw Error(method);}
    return {ok:true,result};
  }};},{snapshot,account});
  page=context.pages()[0];const apiRequests=[];page.on("pageerror",e=>errors.push(String(e)));page.on("request",r=>{if(/\/(eo-api|api)\//.test(r.url()))apiRequests.push(r.url());});
  await page.goto(`http://127.0.0.1:${packaged.httpServer.address().port}`);await subscriptions(page);await openLedger(page);await page.getByRole("button",{name:"Edit",exact:true}).click();await page.locator("#subscription-edit-form").waitFor();await forceForm(page,"subscription-edit-form");
  assert.deepEqual(await page.evaluate(()=>window.mockMutations),[]);assert.deepEqual(apiRequests,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:"PASS",businessWrites:0,checks:["shared subscription carousel/list/status filters/trends/detail/history","uploaded icon and built-in marks","create/edit/payment/resume form previews block forced submit","no renewal catch-up","offline restart and historical dates","wrong-account and malformed-response cache retention","legacy frozen queue unchanged","402/900/1280 layout","packaged connect-src:none bridge mock without API fetches"],deviceVerified:false}));
}finally{if(context)await context.close();await server.close();if(packaged)await new Promise(resolve=>packaged.httpServer.close(resolve));}
