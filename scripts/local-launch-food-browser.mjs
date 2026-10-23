// Packaged UI with synthetic native replies only; no device or production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {preview} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const swift=await fs.readFile('ios/EvaOrbitHost/Sources/WebViewController.swift','utf8');
const readyScript=swift.match(/static let localContentReadyScript = #"""\s*([\s\S]*?)\s*"""#/)?.[1];
assert(readyScript);
const directory=await fs.mkdtemp(path.resolve('tmp/launch-food-')),port=await freeLocalPort();
const server=await preview({configFile:path.resolve('vite.trackers.config.ts'),preview:{host:'127.0.0.1',port,strictPort:true}});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const mode of ['cached','failure','signed-out']){
  const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});
  try{
   await context.addInitScript(mode=>{
    localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.trackerMode','readonly');
    const accountId='10000000-0000-4000-8000-000000000001',capturedAt=new Date().toISOString();
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    window.calls=[];
    const session=new Promise(resolve=>window.releaseAccount=()=>resolve(mode==='signed-out'?null:{accountId,email:'synthetic@example.invalid'}));
    const cache=new Promise(resolve=>window.releaseHome=resolve);
    window.EvaOrbitNative={version:1,call:async(method,params={})=>{
     window.calls.push({method,params});let result=null;
     if(method==='host.getInfo')result={platform:'ios',methods:['home.readOnlyResource','food.readOnlySnapshot']};
     else if(method==='trackers.getSession')result=await session;
     else if(method==='home.readOnlyResource'){
      await cache;
      if(mode==='failure')throw Error('Synthetic Home unavailable');
      if(params.refresh)await new Promise(()=>{}); // cached UI must not wait for refresh
      const {kind,key}=params;
      const data=kind==='day'?{date:key,events:[],tasks:[],meals:[],journal:[],sleep:null,activities:[],activityRecords:[],calendarInterpretation:{categories:[],rules:[]}}:kind==='month'?{month:key,days:{},periods:[]}:[];
      result={format:'eo-home-readonly-v1',accountId,kind,key,capturedAt,data};
     }else if(method==='food.readOnlySnapshot')result={format:'eo-food-readonly-v1',accountId,capturedAt,home:{date,brief:{foodCount:0,drinkCount:0,latest:null},insights:[],window:{from:date,to:date,complete:true},limits:[],limitStatuses:[]},foods:[],drinks:[],window:{from:date,to:date,foodComplete:true,drinkComplete:true}};
     return{ok:true,result};
    }};
   },mode);
   const page=await context.newPage(),errors=[],direct=[];
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('request',r=>{if(/\/(api|eo-api)\//.test(r.url()))direct.push(r.url());});
   await page.goto(`http://127.0.0.1:${port}`);
   await page.evaluate(script=>{window.launchDismissed=false;const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;window.readyWait=new AsyncFunction(script)().then(()=>window.launchDismissed=true);},readyScript);
   assert.equal(await page.evaluate(()=>window.launchDismissed),false);
   await page.evaluate(()=>window.releaseAccount());
   if(mode!=='signed-out'){
    await page.waitForFunction(()=>window.calls.some(c=>c.method==='home.readOnlyResource'));
    assert.equal(await page.evaluate(()=>window.launchDismissed),false,'Account readiness alone cannot dismiss launch');
    await page.evaluate(()=>window.releaseHome());
   }
   await page.waitForFunction(()=>window.launchDismissed);
   if(mode==='cached'){
    await page.locator('.home-page').waitFor();
    assert.equal(await page.locator('.local-home [role=status]').count(),0);
    await navigateLocal(page,'Food & Drink');
    await page.getByRole('heading',{name:'Food & Drink',exact:true}).waitFor();
    const headerLog=page.locator('.page-log-action');
    assert.equal(await headerLog.isVisible(),false,'Mobile overview must not show an extra Log');
    const trigger=page.locator('.home-quick-log-trigger');
    await trigger.click();
    await page.getByRole('button',{name:/Record food/}).waitFor();
    assert.equal(await page.locator('.form-sheet-body button').count(),2,'Overview uses the Food / Drink chooser');
    await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
    await page.screenshot({path:path.join(directory,'food-log-choices.png')});
    for(const kind of ['food','drink']){
     await page.getByRole('button',{name:new RegExp(`Record ${kind}`)}).click();
     await page.locator(kind==='food'?'#food-record-form':'#drink-record-form').waitFor();
     await page.locator('.form-sheet-header button').click();
     await page.locator('.form-sheet-layer').waitFor({state:'detached'});
     if(kind==='food')await trigger.click();
    }
    await page.getByRole('link',{name:'Food records',exact:true}).click();await trigger.click();
    await page.locator('#food-record-form').waitFor();
    await page.locator('.form-sheet-header button').click();
    await page.locator('.form-sheet-layer').waitFor({state:'detached'});
    await page.locator('.mobile-global-header').getByRole('button',{name:/Back/}).click();
    await trigger.click();await page.getByRole('button',{name:/Record drink/}).waitFor();
   }else if(mode==='failure')await page.getByText('Synthetic Home unavailable',{exact:true}).waitFor();
   else await page.getByRole('heading',{name:'Welcome back to EvaOrbit'}).waitFor();
   assert.deepEqual(errors,[]);assert.deepEqual(direct,[]);
   assert.equal(await page.evaluate(()=>window.calls.some(c=>/save|delete|commit|sync|signIn|requestPermission/.test(c.method))),false);
  }finally{await context.close();}
 }
 console.log(JSON.stringify({passed:true,evidence:directory,checks:'Delayed account and Home; cached Home without network completion; error and signed-out entry; mobile Log chooser; both forms open/cancel; Food list direct form; return restores chooser; no writes'}));
}finally{
 await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));
 const {createServer}=await import('node:net');await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});console.log(JSON.stringify({closedTestPort:port}));
}
