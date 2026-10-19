import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { preview } from "vite";
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||"playwright");
await fs.access(".next/BUILD_ID");
const profile=await fs.mkdtemp(path.resolve("tmp/appearance-browser-"));
const localPort=Number(process.env.EVAORBIT_APPEARANCE_PORT||4185);
const bundled=await preview({configFile:path.resolve("vite.trackers.config.ts"),preview:{host:"127.0.0.1",port:localPort,strictPort:true}});
const web=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3002"],{stdio:["ignore","pipe","pipe"],windowsHide:true});
let context, browser, webLog="";
web.stdout.on("data",data=>webLog+=data);web.stderr.on("data",data=>webLog+=data);
const errors=[], writes=[], fontHashes=[];
const augustHash=createHash("sha256").update(await fs.readFile("src/app/fonts/august-stories-serif.ttf")).digest("hex");
const baseline={appearanceMode:"light",colorTheme:"editorial",uiLanguage:"en",chineseFont:"canger",englishFont:"ibm"};
async function inspectFont(page){
  await page.evaluate(()=>document.fonts.ready);
  const session=await page.context().newCDPSession(page);
  await session.send("DOM.enable");await session.send("CSS.enable");
  const {root}=await session.send("DOM.getDocument");
  const {nodeId}=await session.send("DOM.querySelector",{nodeId:root.nodeId,selector:".login-card h1"});
  const {fonts}=await session.send("CSS.getPlatformFontsForNode",{nodeId});
  assert(fonts.some(font=>font.isCustomFont&&/august/i.test(font.familyName)),JSON.stringify(fonts));
  await session.detach();
  return page.locator(".login-card h1").evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return{text:el.textContent,family:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,width:r.width,height:r.height};});
}
async function openLocal(){
  context=await chromium.launchPersistentContext(profile,{channel:"chrome",headless:true,viewport:{width:402,height:874},isMobile:true,hasTouch:true});
  const page=context.pages()[0];page.on("pageerror",error=>errors.push(String(error)));
  page.on("request",request=>{if(!["GET","HEAD"].includes(request.method()))writes.push(request.url());});
  page.on("response",response=>{if(response.url().includes("august-stories-serif")&&response.ok())fontHashes.push(response.body().then(bytes=>createHash("sha256").update(bytes).digest("hex")).catch(()=>null));});
  await page.goto(`http://127.0.0.1:${localPort}`,{waitUntil:"networkidle"});
  return page;
}
try{
  console.log(JSON.stringify({localPort,webPort:3002,webPid:web.pid}));
  for(let n=0;;n++){
    try{const r=await fetch("http://127.0.0.1:3002/login");if(r.ok)break;}catch{}
    if(web.exitCode!==null||n>100)throw Error("Web test server did not start");
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  const initResponse=await fetch("http://127.0.0.1:3002/theme-init.js",{redirect:"manual"});
  assert.equal(initResponse.status,200,"the public first-paint script must not redirect to login");
  assert((await initResponse.text()).startsWith("(() =>"));
  let page=await openLocal();
  await page.getByRole("heading",{name:"Welcome back to EvaOrbit",exact:true}).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-english-font"),"ibm");
  const localMetrics=await inspectFont(page);
  await page.getByRole("button",{name:"Language & appearance",exact:true}).click();
  await page.getByRole("button",{name:/Rosewood/}).click();
  await page.getByRole("button",{name:/^Dark/}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.mode==="dark");
  await page.getByRole("button",{name:/^System/}).click();
  await page.emulateMedia({colorScheme:"light"});
  await page.waitForFunction(()=>document.documentElement.dataset.mode==="light");
  await page.emulateMedia({colorScheme:"dark"});
  await page.waitForFunction(()=>document.documentElement.dataset.mode==="dark");
  assert.equal(await page.locator("html").getAttribute("data-theme"),"rosewood");
  for(const [label,token] of [["仓耳华新体","canger"],["霞鹜文楷","lxgw"],["刻宋","alimama"],["仓耳玄三","ibm"]]) {
    await page.getByRole("button",{name:new RegExp("^"+label)}).click();
    await page.waitForFunction(token=>document.documentElement.dataset.chineseFont===token,token);
  }
  await page.getByRole("button",{name:/^仓耳华新体/}).click();
  for(const [label,token,family] of [["ZEN Serif","zen","EO Zen Serif"],["Polyamine","polyamine","EO Polyamine"],["Cormorant Garamond","cormorant","Cormorant Garamond"],["August","ibm","EO August Stories"]]){
    await page.getByRole("button",{name:new RegExp("^"+label)}).click();
    await page.waitForFunction(token=>document.documentElement.dataset.englishFont===token,token);
    assert((await page.evaluate(async family=>{await document.fonts.load('400 24px "'+family+'"');return Array.from(document.fonts).some(font=>font.family.replaceAll('"','')===family&&font.status==="loaded");},family)),family);
  }
  await page.getByRole("button",{name:/^中文/}).click();
  await page.waitForFunction(()=>document.documentElement.lang==="zh-CN");
  await page.getByRole("button",{name:/^English/}).click();
  await page.getByRole("button",{name:/^Light/}).click();
  await page.getByRole("button",{name:/^Field Green/}).click();
  await page.getByRole("button",{name:"Close",exact:true}).click();
  await page.locator(".form-sheet-layer").waitFor({state:"detached"});
  await page.locator(".action-toast").waitFor({state:"detached"});
  await page.screenshot({path:"tmp/appearance-local-english-mobile.png",fullPage:true});
  await context.close();context=null;
  page=await openLocal();
  await page.getByRole("heading",{name:"Welcome back to EvaOrbit",exact:true}).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-english-font"),"ibm");
  assert.equal(await page.locator("html").getAttribute("data-mode"),"light");
  await inspectFont(page);
  browser=await chromium.launch({channel:"chrome",headless:true});
  for(const width of [402,1440]){
    await page.setViewportSize({width,height:1000});
    const wc=await browser.newContext({viewport:{width,height:1000}});
    await wc.addInitScript(value=>{for(const [key,v]of Object.entries(value))localStorage.setItem("evaorbit."+key,v);},baseline);
    await wc.route("**/api/preferences/appearance",route=>route.fulfill({json:baseline}));
    const wp=await wc.newPage();wp.on("pageerror",error=>errors.push(String(error)));
    wp.on("response",response=>{if(/\.(ttf|otf)(\?|$)/.test(response.url())&&response.ok())fontHashes.push(response.body().then(bytes=>createHash("sha256").update(bytes).digest("hex")).catch(()=>null));});
    await wp.goto("http://127.0.0.1:3002/login",{waitUntil:"networkidle"});
    const wm=await inspectFont(wp),lm=await inspectFont(page);
    assert.deepEqual(wm,lm,"same font and heading metrics at width "+width);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await wp.screenshot({path:`tmp/appearance-web-english-${width}.png`,fullPage:true});
    await Promise.all(fontHashes);
    await wc.close();
  }
  assert((await Promise.all(fontHashes)).filter(hash=>hash===augustHash).length>=2,"both builds serve original August bytes");
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log(JSON.stringify({passed:true,englishAugust:true,realFontVerified:true,localMetrics,offlineRestart:true,sharedControls:true,systemMode:true,cloudWrites:0,viewports:[402,1440]}));
}finally{
  await context?.close();await browser?.close();await bundled.httpServer.close();
  if(web.exitCode===null){web.kill();await new Promise(resolve=>web.once("exit",resolve));}
  await fs.writeFile("tmp/appearance-web-server.log",webLog);
}
