import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { freeLocalPort, navigateLocal } from "./local-navigation-browser.mjs";
const { chromium } = await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE || "playwright");
await fs.mkdir("tmp", { recursive: true });
const directory = await fs.mkdtemp(path.resolve("tmp/project-ideas-browser-"));
const account = "10000000-0000-4000-8000-000000000001";
const env = { ...process.env, EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory,"data.db"), VERCEL: "" };
const seed = spawnSync(process.execPath, ["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",`
  import * as r from './src/lib/db.ts';import {parseNewProjectItem} from './src/lib/validation.ts';
  const p=r.createProject({name:'Ideas regression',description:'Synthetic project',status:'active'});
  r.createProjectItem(parseNewProjectItem({projectId:p.id,title:'Existing queue',status:'to_solve',priority:'P1',nextStep:'Keep this action'}));
  r.createProjectItem(parseNewProjectItem({projectId:p.id,title:'Existing work',status:'doing'}));
`], { env, encoding:"utf8" });
assert.equal(seed.status,0,seed.stderr);
let web,exited,browser,context,local,offline=false;const ports=[],errors=[];
const selector = (page) => page.locator(".project-item-editor select").filter({has:page.locator('option[value="idea"]')});
async function layout(page,label) {
  for(const width of [320,402,1440]) {
    await page.setViewportSize({width,height:874});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+" overflow "+width);
    await page.screenshot({path:path.join(directory,label+"-"+width+".png"),fullPage:true});
  }
}
async function createIdea(page,title) {
  await page.getByRole("button",{name:"Add Idea",exact:true}).click();
  const form=page.locator(".project-editor");
  assert.equal(await form.locator('select[aria-label="New item status"]').inputValue(),"idea");
  assert.equal(await form.getByText("Priority",{exact:false}).count(),0);
  assert.equal(await form.getByText("Next step",{exact:false}).count(),0);
  await form.getByLabel("Title",{exact:true}).fill(title);
  await form.getByRole("button",{name:"Record Item",exact:true}).click();
  await page.locator(".project-ideas").getByRole("link",{name:new RegExp(title)}).waitFor();
}
async function roundTrip(page,title) {
  await page.locator(".project-ideas").getByRole("link",{name:new RegExp(title)}).click();
  await page.getByRole("heading",{name:title,exact:true}).waitFor();
  assert.equal(await page.getByText("Priority",{exact:false}).count(),0);
  await selector(page).selectOption("to_solve");
  await page.getByRole("button",{name:"Save changes",exact:true}).click();
  await page.locator('.project-item-title .item-status[data-status="to_solve"]').waitFor();
  assert.equal(await page.locator(".project-item-editor").getByText("Priority",{exact:false}).count(),1);
  await selector(page).selectOption("idea");
  await page.getByRole("button",{name:"Save changes",exact:true}).click();
  await page.locator('.project-item-title .item-status[data-status="idea"]').waitFor();
}
try {
  const port=await freeLocalPort();ports.push(port);
  web=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",String(port)],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  exited=new Promise(resolve=>web.once("exit",resolve));let log="";
  web.stdout.on("data",d=>log+=d);web.stderr.on("data",d=>log+=d);
  console.log(JSON.stringify({pid:web.pid,port}));
  for(let i=0;i<150&&!log.includes("Ready in");i++){if(web.exitCode!==null)throw Error(log);await new Promise(r=>setTimeout(r,200));}
  const root="http://127.0.0.1:"+port;
  browser=await chromium.launch({channel:"chrome",headless:true});
  context=await browser.newContext({viewport:{width:402,height:874}});
  await context.addInitScript(()=>localStorage.setItem("evaorbit.uiLanguage","en"));
  await context.route("**/api/preferences/appearance",route=>route.fulfill({json:{uiLanguage:"en",englishFont:"ibm",colorTheme:"editorial",appearanceMode:"light"}}));
  let page=await context.newPage();page.on("pageerror",e=>errors.push(String(e)));
  await page.goto(root+"/projects/1");await createIdea(page,"Web possibility");await layout(page,"web-ideas");
  await roundTrip(page,"Web possibility");
  assert.equal((await fetch(root+"/api/project-items?status=idea").then(r=>r.json())).length,1);
  assert.equal((await fetch(root+"/api/project-items?status=invalid")).status,400);
  await page.goto(root+"/projects");assert.match(await page.locator(".project-counts").innerText(),/1.*Ideas/s);await layout(page,"web-counts");
  const legacy=await fetch(root+"/api/project-items/1").then(r=>r.json());
  assert.equal(legacy.status,"to_solve");assert.equal(legacy.priority,"P1");assert.equal(legacy.nextStep,"Keep this action");
  await context.close();context=null;

  const localPort=await freeLocalPort();ports.push(localPort);
  local=await createServer({configFile:path.resolve("vite.trackers.config.ts"),server:{host:"127.0.0.1",port:localPort,strictPort:true}});await local.listen();
  context=await browser.newContext({viewport:{width:402,height:874}});
  await context.addInitScript(()=>{localStorage.setItem("evaorbit.uiLanguage","en");localStorage.setItem("evaorbit.trackerMode","readonly");});
  await context.route("**/eo-api/**",async route=>{
    if(offline)return route.abort();
    const request=route.request(),url=new URL(request.url()),p=url.pathname;
    if(p==="/eo-api/session")return route.fulfill({json:{authenticated:true,accountId:account,onlineBusinessProtocol:1,onlineBusinessTestAccount:true}});
    if(p==="/eo-api/workspace-readonly/projects"){
      const projects=await fetch(root+"/api/projects").then(r=>r.json()),items=await fetch(root+"/api/project-items").then(r=>r.json());
      return route.fulfill({json:{format:"eo-workspace-readonly-v1",accountId:account,kind:"projects",capturedAt:new Date().toISOString(),data:{projects,items,complete:true}}});
    }
    if(p.startsWith("/eo-api/business/")){
      const response=await fetch(root+p.replace("/eo-api/business/","/api/")+url.search,{method:request.method(),headers:{"Content-Type":"application/json"},body:request.method()==="GET"?undefined:request.postData()});
      return route.fulfill({status:response.status,body:await response.text(),contentType:"application/json"});
    }
    return route.fulfill({status:404,json:{error:"Not requested in this fixture"}});
  });
  page=await context.newPage();page.on("pageerror",e=>errors.push(String(e)));
  await page.goto("http://127.0.0.1:"+localPort);
  await page.evaluate(async account=>{
    const db=await new Promise(resolve=>{const req=indexedDB.open("eo-tracker-local-v1",1);req.onsuccess=()=>resolve(req.result);});
    await new Promise(resolve=>{const tx=db.transaction("session","readwrite");tx.objectStore("session").put({accountId:account,email:"fixture@example.invalid"},"current");tx.oncomplete=resolve;});db.close();
  },account);
  await page.reload();await navigateLocal(page,"Projects");
  await page.getByRole("link",{name:/Ideas regression/}).click();
  await createIdea(page,"Local possibility");await roundTrip(page,"Local possibility");
  await navigateLocal(page,"Home");await navigateLocal(page,"Projects");await page.getByRole("link",{name:/Ideas regression/}).click();
  await page.locator(".project-ideas").getByRole("link",{name:/Local possibility/}).waitFor();await layout(page,"local-ideas");
  offline=true;await page.reload();await navigateLocal(page,"Projects");await page.getByRole("link",{name:/Ideas regression/}).click();
  await page.locator(".project-ideas").getByRole("link",{name:/Local possibility/}).waitFor();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:"PASS",checks:"Real Web API and shared local online forms create/round-trip; legacy values; invalid status; counts; 320/402/1440 layouts; offline cache reload",evidence:directory}));
} catch(error) {
  if(context){const page=context.pages()[0];console.error((await page.locator("body").innerText()).slice(-2200));await page.screenshot({path:path.join(directory,"failure.png"),fullPage:true});}
  throw error;
} finally {
  await context?.close();await browser?.close();
  await local?.close();
  if(web){web.kill();await exited;}
  for(const port of ports){
    const {createServer}=await import("node:net");await new Promise((resolve,reject)=>{const probe=createServer();probe.once("error",reject);probe.listen(port,"127.0.0.1",()=>probe.close(resolve));});
    console.log(JSON.stringify({closedTestPort:port}));
  }
}
