// Synthetic local shell, no real account/business requests.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {createServer} from "vite";
import {createServer as probeServer} from "node:net";
import {freeLocalPort,navigateLocal} from "./local-navigation-browser.mjs";
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||"playwright");
const port=await freeLocalPort();
const server=await createServer({configFile:path.resolve("vite.trackers.config.ts"),server:{host:"127.0.0.1",port,strictPort:true}});
const accountId="10000000-0000-4000-8000-000000000099";
let browser;
const errors=[],writes=[];
try{
  await fs.mkdir("tmp/settings-actions-qa",{recursive:true});
  await server.listen();console.log(JSON.stringify({pid:process.pid,port}));
  browser=await chromium.launch({channel:"chrome",headless:true});
  const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{if(!localStorage.getItem("evaorbit.uiLanguage"))localStorage.setItem("evaorbit.uiLanguage","en");localStorage.setItem("evaorbit.appearanceMode","light");});
  await context.route("**/eo-api/**",async route=>{
    const request=route.request(),url=new URL(request.url());
    if(!["GET","HEAD"].includes(request.method()))writes.push(url.pathname);
    if(url.pathname==="/eo-api/session")return route.fulfill({json:{authenticated:true,accountId,email:"fixture@example.invalid",settingsConfigurationProtocol:1}});
    if(url.pathname==="/eo-api/settings-config/calendar-interpretation")return route.fulfill({json:{settings:{revision:1,categories:[],rules:[]},records:[]}});
    if(url.pathname==="/eo-api/settings-config/timeline-association")return route.fulfill({json:{settings:{revision:1,rules:[]},trackers:[]}});
    return route.fulfill({json:[]});
  });
  await context.route("**/api/**",route=>route.abort());
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`,{waitUntil:"networkidle"});
  await page.evaluate(async accountId=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open("eo-tracker-local-v1",1);r.onsuccess=()=>resolve(r.result);});
    await new Promise((resolve,reject)=>{const tx=db.transaction("session","readwrite");tx.objectStore("session").put({accountId,email:"fixture@example.invalid"},"current");tx.oncomplete=resolve;tx.onerror=reject;});db.close();
  },accountId);
  await page.reload({waitUntil:"networkidle"});await navigateLocal(page,"Settings");
  const trigger=page.locator(".home-quick-log-trigger"),sheet=page.locator(".form-sheet-panel");
  const close=async()=>{await page.locator(".form-sheet-header button").click();await sheet.waitFor({state:"detached"});};
  for(const theme of ["classic","vintage"])for(const width of [402,1440]){
    await page.setViewportSize({width,height:874});await page.evaluate(theme=>{document.documentElement.dataset.designTheme=theme;},theme);
    await page.getByRole("button",{name:"Settings shortcuts",exact:true}).click();await sheet.waitFor();
    assert.equal(await sheet.locator(".settings-directory-item").count(),10);
    assert.equal(await sheet.locator(".home-quick-log-grid,textarea").count(),0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({animations:"disabled",path:`tmp/settings-actions-qa/${theme}-${width}.png`});await close();
  }
  // A shortcut navigates using the existing settings route and closes the sheet.
  await trigger.click();await sheet.getByRole("button",{name:/App & Appearance/}).click();await sheet.waitFor({state:"detached"});
  await page.locator(".appearance-theme-settings").waitFor();
  await trigger.click();await sheet.getByRole("button",{name:/Calendar interpretation/}).click();
  await page.getByRole("button",{name:"Add interpretation rule",exact:true}).waitFor();
  await trigger.click();await sheet.waitFor();assert.equal(await sheet.locator(".settings-directory").count(),0);await close();
  await navigateLocal(page,"Settings");await trigger.click();await sheet.getByRole("button",{name:/Timeline association rules/}).click();
  await page.getByRole("button",{name:"Add association rule",exact:true}).waitFor();await trigger.click();await sheet.waitFor();await close();
  await navigateLocal(page,"Home");await trigger.click();await page.locator(".home-quick-log-grid").waitFor();
  assert.equal(await page.locator(".home-quick-log-grid button").count(),10);await close();
  await navigateLocal(page,"Settings");await trigger.click();await page.locator('.form-sheet-layer[data-state="open"]').waitFor();await page.keyboard.press("Escape");await sheet.waitFor({state:"detached"});
  assert(await trigger.evaluate(el=>el===document.activeElement));
  await page.evaluate(()=>localStorage.setItem("evaorbit.uiLanguage","zh-CN"));await page.reload({waitUntil:"networkidle"});await page.locator('.sidebar a[href="/settings"]').click();
  await page.getByRole("button",{name:"设置快捷操作",exact:true}).click();await sheet.getByRole("button",{name:/应用与外观/}).waitFor();await close();
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log(JSON.stringify({passed:true,settingsOnly:true,sharedDirectory:true,themes:2,widths:[402,1440],ruleCreation:true,homeLogPreserved:true,escapeAndFocus:true,languages:2,businessWrites:0}));
}finally{
  await browser?.close();await server.close();
  await new Promise((resolve,reject)=>{const probe=probeServer();probe.once("error",reject);probe.listen(port,"127.0.0.1",()=>probe.close(resolve));});
  console.log(JSON.stringify({closedTestPort:port}));
}
