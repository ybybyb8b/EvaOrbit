import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dateInEvaOrbit, shiftDate } from "../src/lib/time.ts";

const { chromium }=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||"playwright");
const port=3107,origin=`http://127.0.0.1:${port}`;
// Refuse a listener owned by another task before starting the isolated preview.
await new Promise((resolve,reject)=>{const probe=createServer();probe.once("error",reject);probe.listen(port,"127.0.0.1",()=>probe.close(resolve));});
await fs.mkdir("tmp",{recursive:true});
const directory=await fs.mkdtemp(path.resolve("tmp/insights-browser-"));
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"preview.db"),VERCEL:"",NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"],windowsHide:true});
console.log(JSON.stringify({serverPid:server.pid,port,database:path.join(directory,"preview.db")}));
let output="",context;const errors=[];
server.stdout.on("data",chunk=>{output=(output+chunk).slice(-12000);});server.stderr.on("data",chunk=>{output=(output+chunk).slice(-12000);});
try{
  for(let attempt=0;;attempt++){
    if(server.exitCode!==null)throw new Error(output);
    try{if((await fetch(`${origin}/api/insights`)).ok)break;}catch{}
    if(attempt>180)throw new Error(`Preview did not start: ${output}`);
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  const preferences=await fetch(`${origin}/api/preferences/appearance`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({appearanceMode:"light",colorTheme:"editorial",uiLanguage:"zh-CN",chineseFont:"canger",englishFont:"zen"})});
  assert(preferences.ok,await preferences.text());
  context=await chromium.launchPersistentContext(path.join(directory,"browser"),{channel:process.env.EVAORBIT_BROWSER_CHANNEL||"chrome",headless:true,viewport:{width:402,height:874},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{localStorage.setItem("evaorbit.uiLanguage","zh-CN");localStorage.setItem("evaorbit.appearanceMode","light");});
  const page=context.pages()[0];page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`${origin}/insights`,{waitUntil:"networkidle"});
  await page.getByRole("heading",{name:/^(Insights|洞察)$/}).waitFor();
  await page.getByText("这个周期还没有保存的报告。",{exact:true}).waitFor();
  await page.getByRole("button",{name:"日报",exact:true}).click();
  assert(await page.getByRole("button",{name:"分析并保存日报",exact:true}).isEnabled());
  await page.screenshot({path:"tmp/insights-empty-mobile.png",fullPage:true});
  const target=shiftDate(dateInEvaOrbit(),-1);
  for(const offset of [0,1,2,3,4]){
    const response=await fetch(`${origin}/api/food/logs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"面条",occurredAt:`${shiftDate(target,-offset)}T12:00:00+08:00`,occurredHasExplicitTime:false,mealType:"lunch",scene:"home"})});
    assert(response.ok,`Seed failed (${response.status}): ${(await response.text()).slice(0,300)}`);
  }
  await page.getByRole("button",{name:"分析并保存日报",exact:true}).click();
  await page.getByRole("heading",{name:target,exact:true}).waitFor();
  await page.getByRole("heading",{name:"「面条」最近吃了好几次",exact:true}).waitFor();
  await page.locator('a[href="#evidence-food-drink-window"]').first().click();
  assert(await page.locator("#evidence-food-drink-window").isVisible());
  await page.getByRole("button",{name:"查看原始记录",exact:true}).first().click();
  await page.getByText("当前记录内容 · 可能已在分析后修改",{exact:true}).first().waitFor();
  await page.locator('details').filter({has:page.locator('#evidence-food-drink-window')}).first().evaluate(element=>element.open=false);
  await page.getByLabel("修订说明（可选）",{exact:true}).fill("补齐记录后重新分析");
  await page.getByRole("button",{name:"分析并保存日报",exact:true}).click();
  await page.getByText("修订说明：补齐记录后重新分析",{exact:true}).waitFor();
  await page.getByText("历史版本 · 2",{exact:true}).click();
  await page.getByRole("button",{name:/^v1 ·/}).click();
  await page.getByText(/v1 \/ 当前 v2/).waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  assert.equal(overflow,false,"Mobile page overflows the viewport");
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:"tmp/insights-history-mobile.png",fullPage:true});
  // An executed POST with a lost response must replay the same request, not create v4.
  await page.getByLabel("修订说明（可选）",{exact:true}).fill("网络重试验证");
  let dropped=false;const payloads=[];
  await page.route("**/api/insights",async route=>{
    if(route.request().method()!=="POST")return route.continue();
    payloads.push(route.request().postDataJSON());
    if(!dropped){dropped=true;await route.fetch();return route.abort("failed");}
    return route.continue();
  });
  await page.getByRole("button",{name:"分析并保存日报",exact:true}).click();
  await page.getByRole("button",{name:"分析并保存日报",exact:true}).waitFor({state:"visible"});
  await page.getByRole("button",{name:"分析并保存日报",exact:true}).click();
  await page.getByText("修订说明：网络重试验证",{exact:true}).waitFor();
  assert.equal(payloads.length,2);assert.deepEqual(payloads[0],payloads[1]);
  const reports=await(await fetch(`${origin}/api/insights`)).json();assert.equal(reports.items[0].currentVersion,3);
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:"tmp/insights-desktop.png",fullPage:true});
  await page.evaluate(()=>{document.documentElement.dataset.mode="dark";document.documentElement.style.colorScheme="dark";});
  await page.screenshot({path:"tmp/insights-desktop-dark.png",fullPage:true});
  await page.getByRole("button",{name:"月报",exact:true}).click();
  await page.getByText("这个周期还没有保存的报告。",{exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"分析并保存日报",exact:true}).count(),0);
  await page.goto(`${origin}/food-drink`,{waitUntil:"networkidle"});
  assert.equal(await page.locator('#insights-title').count(),0);
  await page.locator('#limits-title').waitFor();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,viewport:"402x874 and 1440x1000",versions:3,errors,screenshots:["tmp/insights-empty-mobile.png","tmp/insights-history-mobile.png","tmp/insights-desktop.png","tmp/insights-desktop-dark.png"]}));
}catch(error){await context?.pages()[0]?.screenshot({path:"tmp/insights-browser-failure.png",fullPage:true}).catch(()=>{});console.error(error);console.error(output);throw error;}
finally{
  await context?.close();
  const stopped=process.platform==="win32"?spawnSync("taskkill",["/PID",String(server.pid),"/T","/F"],{encoding:"utf8",windowsHide:true}):null;
  if(process.platform!=="win32")server.kill("SIGTERM");
  server.stdout.destroy();server.stderr.destroy();server.unref();
  if(stopped&&stopped.status!==0)console.warn(JSON.stringify({cleanupRequired:server.pid,reason:stopped.stderr?.trim()||stopped.error?.message}));
  console.log(JSON.stringify({previewFiles:directory,serverStopped:stopped?stopped.status===0:true}));
}
// End the preview runner after its browser and server close; dev compiler pipes can otherwise hold Node open.
process.exit(0);
