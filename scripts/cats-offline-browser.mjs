import {navigateLocal} from "./local-navigation-browser.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {createServer,preview} from "vite";
import {createServer as probeServer} from "node:net";
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||"playwright");
const profile=await fs.mkdtemp(path.resolve("tmp/cats-offline-browser-"));
const fixture=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
  import {seedCats} from './scripts/cats-readonly-fixture.mjs';
  import {getCatsReadonlySnapshot} from './src/lib/services/cats-readonly.ts';
  await seedCats();console.log(JSON.stringify(await getCatsReadonlySnapshot('10000000-0000-4000-8000-000000000001')));
`],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(profile,"fixture.db"),EVAORBIT_CAT_AVATAR_DIR:path.join(profile,"avatars"),VERCEL:""}});
assert.equal(fixture.status,0,fixture.stderr);
const snapshot=JSON.parse(fixture.stdout.trim()),account=snapshot.accountId,errors=[],writes=[],direct=[],old={schemaVersion:1,accountId:account,revision:1,records:[],outbox:[{mutationId:"cats-frozen-canary",wire:{payload:{note:"never upload"}}}]};
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
    if(url.pathname==="/eo-api/cats-readonly")return json(invalid?{...snapshot,records:[]}:snapshot);
    if(url.pathname==="/eo-api/trackers")return json([]);
    return route.fulfill({status:404,body:'{"error":"Fixture has no such module"}'});
  });
  const page=context.pages()[0];page.on("pageerror",e=>errors.push(String(e)));page.on("request",r=>{if(!["GET","HEAD"].includes(r.method()))writes.push(r.url());if(new URL(r.url()).pathname.startsWith("/api/"))direct.push(r.url());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`,{waitUntil:"networkidle"});return page;
}
async function dismiss(page){for(const b of await page.getByRole("button",{name:"Dismiss error",exact:true}).all())await b.click();}
async function cats(page){await dismiss(page);await navigateLocal(page,"Cats");await page.getByRole("heading",{name:"Cats",exact:true}).waitFor();}
async function closeSheet(page){await page.locator(".form-sheet-header button").click();const discard=page.getByRole("button",{name:"Discard and close",exact:true});if(await discard.isVisible())await discard.click();await page.locator(".form-sheet-layer").waitFor({state:"detached"});}
async function forceForms(page){await page.locator("form").evaluateAll(forms=>forms.forEach(form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))));}
async function cache(page,key){return page.evaluate(async key=>{const db=await new Promise(resolve=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const r=db.transaction("states").objectStore("states").get(key);r.onsuccess=()=>{resolve(r.result);db.close();};});},key);}
try{
  await server.listen();console.log(`Cats preview listener ${server.httpServer.address().port}, PID ${process.pid}`);let page=await open();
  await page.evaluate(async({account,old})=>{const db=await new Promise(resolve=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);});await new Promise((resolve,reject)=>{const tx=db.transaction(["session","states"],"readwrite");tx.objectStore("session").put({accountId:account,email:"test@example.invalid"},"current");tx.objectStore("states").put(old,account);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();},{account,old});
  await page.reload({waitUntil:"networkidle"});await dismiss(page);
  assert.equal(await page.locator(".local-module-nav").count(),0);
  const trigger=page.getByRole("button",{name:"Open spaces",exact:true});
  await trigger.click();let drawer=page.getByRole("dialog",{name:"All spaces",exact:true});
  await drawer.waitFor();await page.waitForFunction(()=>document.activeElement?.closest('[role="dialog"]'));
  assert.deepEqual(await drawer.locator("a").evaluateAll(rows=>rows.map(row=>row.getAttribute("href"))),["/trackers","/food-drink","/subscriptions","/cats","/chronicle","/memo","/inbox"]);
  assert(await page.locator(".main-content").evaluate(node=>node.inert));
  await page.keyboard.press("Shift+Tab");assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute("href")),"/inbox");
  await page.keyboard.press("Tab");assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute("aria-label")),"Close spaces");
  await page.waitForFunction(()=>document.querySelector(".space-drawer")?.getBoundingClientRect().right<=innerWidth+0.5);
  await page.screenshot({path:"tmp/shared-navigation-mobile.png"});
  await page.keyboard.press("Escape");await drawer.waitFor({state:"detached"});
  assert(await trigger.evaluate(node=>node===document.activeElement));assert.equal(await page.locator(".main-content").evaluate(node=>node.inert),false);
  await trigger.click();drawer=page.getByRole("dialog",{name:"All spaces",exact:true});await drawer.waitFor();await page.locator(".space-drawer-backdrop").click({position:{x:5,y:5}});await drawer.waitFor({state:"detached"});
  await cats(page);
  await page.getByRole("link",{name:/Offline Luna/}).waitFor();
  assert.match(await page.locator(".cat-card .cat-avatar").getAttribute("style"),/data:image\/png/);
  assert(await page.getByRole("button",{name:"Done",exact:true}).isDisabled());
  assert.equal(await page.locator("details").first().getAttribute("open"),null);
  await page.getByRole("link",{name:/Offline Luna/}).click();await page.getByRole("heading",{name:"Offline Luna",exact:true}).waitFor();
  await page.locator(".cat-timeline-main").filter({hasText:"event canary"}).click();
  assert(await page.locator(".cat-record-actions button").filter({hasText:"Delete"}).isDisabled());
  await page.locator(".cat-record-actions button").filter({hasText:"Edit"}).click();
  assert.equal(await page.locator('.cat-record-editor input[type="date"]').first().inputValue(),"2026-10-18");
  assert(await page.locator('.cat-record-editor button[type="submit"]').isDisabled());await forceForms(page);await closeSheet(page);
  await page.getByRole("button",{name:"Health overview",exact:true}).click();await page.locator(".cat-health-overview").waitFor();
  await page.getByRole("button",{name:"Care",exact:true}).click();await page.getByText("Nail trim canary",{exact:true}).waitFor();
  assert(await page.locator(".routine-status-card").getByRole("button",{name:"Done",exact:true}).isDisabled());
  await page.locator(".routine-status-card").getByRole("button",{name:"Edit",exact:true}).click();await page.locator(".routine-editor").waitFor();await forceForms(page);await closeSheet(page);
  await page.locator(".cats-one-time-list").getByRole("button",{name:"Edit",exact:true}).click();await page.locator(".reminder-editor").waitFor();await forceForms(page);await closeSheet(page);
  await page.getByRole("button",{name:"Profile",exact:true}).click();assert(await page.locator('input[type="file"]').isDisabled());
  assert(await page.getByRole("button",{name:"Archive cat",exact:true}).isDisabled());
  await page.getByRole("button",{name:"Edit profile",exact:true}).click();await page.getByLabel("Name",{exact:true}).fill("Temporary name");await forceForms(page);assert(await page.getByRole("button",{name:"Save profile",exact:true}).isDisabled());
  await navigateLocal(page,"Trackers");await cats(page);
  await page.locator(".cats-food-library-entry").click();await page.locator(".cat-food-card").waitFor();
  await page.locator(".cat-food-card-main").click();await page.getByRole("heading",{name:"Offline kibble",exact:true}).waitFor();
  assert(await page.getByRole("button",{name:/用完 1 包/}).isDisabled());
  await page.locator(".cat-record-actions button").first().click();await page.locator("#cat-food-detail-purchase-form").waitFor();assert.equal(await page.locator('#cat-food-detail-purchase-form input[type="date"]').inputValue(),"2026-10-01");await forceForms(page);await closeSheet(page);
  await page.locator(".cat-food-header-actions button").first().click();await page.locator("#cat-food-edit-form").waitFor();await forceForms(page);await closeSheet(page);
  await page.locator(".cat-food-insight-card").filter({hasText:"RHYTHM"}).locator("button").first().click();await page.locator("#cat-food-restock-form").waitFor();await forceForms(page);await closeSheet(page);
  for(const width of [402,900,1280]){await page.setViewportSize({width,height:874});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width>720){const nav=await page.locator(".sidebar").boundingBox(),main=await page.locator(".main-content").boundingBox();assert(main.x>=nav.x+nav.width);}}
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:"tmp/shared-navigation-desktop.png"});
  await page.setViewportSize({width:402,height:874});await page.screenshot({path:"tmp/cats-food-shared-mobile.png",fullPage:true});
  assert.deepEqual(await cache(page,account),old);assert.deepEqual(await cache(page,"cats-readonly:"+account),snapshot);
  await context.close();context=null;offline=true;page=await open();await cats(page);await page.getByRole("link",{name:/Offline Luna/}).click();await page.getByRole("button",{name:"Profile",exact:true}).click();await page.getByText("Profile canary",{exact:true}).waitFor();assert.match(await page.locator(".pet-profile-view .cat-avatar").getAttribute("style"),/data:image\/png/);
  await page.screenshot({path:"tmp/cats-profile-shared-mobile.png",fullPage:true});
  offline=false;wrongAccount=true;
  await navigateLocal(page,"Trackers");await cats(page);await page.getByRole("link",{name:/Offline Luna/}).waitFor();await page.getByText("Cats account changed",{exact:false}).first().waitFor();assert.deepEqual(await cache(page,"cats-readonly:"+account),snapshot);
  wrongAccount=false;invalid=true;await dismiss(page);await page.locator("details").first().locator("summary").click();await page.getByRole("button",{name:"Refresh downloaded Cats",exact:true}).click();await page.getByText("Invalid or incomplete Cats snapshot",{exact:false}).first().waitFor();assert.deepEqual(await cache(page,"cats-readonly:"+account),snapshot);assert.deepEqual(await cache(page,account),old);
  assert.deepEqual(writes,[]);assert.deepEqual(direct,[]);assert.deepEqual(errors,[]);
  await context.close();context=null;await server.close();
  packaged=await preview({configFile:path.resolve("vite.trackers.config.ts"),preview:{host:"127.0.0.1",port:await freePort(),strictPort:true}});console.log(`Cats packaged listener ${packaged.httpServer.address().port}, PID ${process.pid}`);
  context=await chromium.launchPersistentContext(path.join(profile,"packaged"),{channel:"chrome",headless:true,viewport:{width:402,height:874}});
  await context.addInitScript(({snapshot,account})=>{window.mockMutations=[];window.EvaOrbitNative={version:1,call:async(method)=>{
    let result;
    if(method==="host.getInfo")result={methods:["trackers.readOnlySnapshot","trackers.acceptanceStatus","cats.readOnlySnapshot"]};
    else if(method==="trackers.getSession")result={accountId:account,email:"test@example.invalid"};
    else if(method==="cats.readOnlySnapshot")result=snapshot;
    else if(method==="trackers.acceptanceStatus")result={pending:2,frozen:1,sqliteVerified:true};
    else if(method==="trackers.readOnlySnapshot"||method==="appearance.setPreference")result=null;
    else{window.mockMutations.push(method);throw Error(method);}
    return {ok:true,result};
  }};},{snapshot,account});
  page=context.pages()[0];const apiRequests=[];page.on("pageerror",e=>errors.push(String(e)));page.on("request",r=>{if(/\/(eo-api|api)\//.test(r.url()))apiRequests.push(r.url());});
  await page.goto(`http://127.0.0.1:${packaged.httpServer.address().port}`);await cats(page);await page.getByRole("link",{name:/Offline Luna/}).click();await page.getByRole("heading",{name:"Offline Luna",exact:true}).waitFor();await page.locator(".home-quick-log-trigger").click();await page.getByRole("heading",{name:"Log cat care",exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.mockMutations),[]);assert.deepEqual(apiRequests,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:"PASS",businessWrites:0,checks:["original dashboard/detail/health/care/profile/food pages","authenticated avatar embedded and persists offline","date-only history form","record/routine/reminder/profile/food/purchase/restock forced submits blocked","legacy outbox preserved","offline restart","account mismatch and malformed refresh preserve cache","402/1280 responsive layout","packaged connect-src:none bridge mock with zero API calls"],deviceVerified:false}));
}finally{if(context)await context.close();await server.close();if(packaged)await new Promise(resolve=>packaged.httpServer.close(resolve));}
