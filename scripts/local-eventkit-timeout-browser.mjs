// Synthetic Native Host only: no real Calendar, Reminders, permissions or accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {preview} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const port=await freeLocalPort(),directory=await fs.mkdtemp(path.resolve('tmp/eventkit-timeout-'));
const server=await preview({configFile:path.resolve('vite.trackers.config.ts'),preview:{host:'127.0.0.1',port,strictPort:true}});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:402,height:874}});
 await context.addInitScript(()=>{
  localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.trackerMode','readonly');
  localStorage.setItem('evaorbit.eventkit.sources.v1',JSON.stringify({list:'import'}));
  window.calls=[];window.stall=true;
  const status={available:true,installationId:'synthetic',calendarPermission:'full_access',reminderPermission:'full_access',calendars:[],reminderLists:[{identifier:'list',title:'Synthetic list',sourceIdentifier:'test',sourceTitle:'Test',allowsContentModifications:true}]};
  const info={methods:['native.invoke','native.api','eventkit.getStatus','eventkit.requestAccess','eventkit.fetch','eventkit.save','eventkit.delete']};
  window.EvaOrbitNative={version:1,call:async(method,params={})=>{
   window.calls.push({method,params});let result={};
   if(method==='host.getInfo')result=info;
   else if(method==='trackers.getSession')result={accountId:'10000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid'};
   else if(method==='eventkit.getStatus')result=status;
   else if(method==='native.invoke'){
    if(params.method==='host.getInfo')result=info;
    else if(params.method==='eventkit.fetch')result=window.stall?await new Promise(resolve=>{window.releaseRead=resolve;}):{items:[]};
    else throw Error('Unexpected native operation '+params.method);
   }else if(method==='native.api'){
    if(params.method!=='GET')throw Error('Unexpected write');
    result={status:200,body:params.path==='/api/preferences/eventkit'?{available:false}:params.path==='/api/notifications'?{nativeNotifications:[]}:[]};
   }else if(method!=='appearance.setPreference')return{ok:false,error:{code:'fixture',message:'Module not downloaded'}};
   return{ok:true,result};
  }};
 });
 const page=await context.newPage(),direct=[];page.on('request',r=>{if(/\/(api|eo-api)\//.test(r.url()))direct.push(r.url());});
 await page.goto(`http://127.0.0.1:${port}`);await navigateLocal(page,'Settings');
 await page.getByRole('button',{name:/Apple Integration/}).click();
 const section=page.locator('.eventkit-section');await section.getByRole('button',{name:'Sync Reminders',exact:true}).waitFor();
 await page.clock.install();await section.getByRole('button',{name:'Sync Reminders',exact:true}).click();
 await page.waitForFunction(()=>window.calls.some(c=>c.method==='native.invoke'&&c.params.method==='eventkit.fetch'));
 await section.getByRole('button',{name:'Syncing…',exact:true}).first().waitFor();
 await page.clock.fastForward(31_000);
 await page.locator('.form-error').filter({hasText:'Timed out waiting for Apple Reminders'}).waitFor();
 assert(await section.getByRole('button',{name:'Sync Reminders',exact:true}).isEnabled());
 await page.screenshot({path:path.join(directory,'sync-timeout.png'),fullPage:true});
 await page.evaluate(()=>{window.stall=false;window.releaseRead({items:[]});});
 await section.getByRole('button',{name:'Sync Reminders',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.eventkit-sync-group small')[1]?.textContent?.startsWith('Last sync'));
 assert.equal(await page.evaluate(()=>window.calls.some(c=>c.method==='native.api'&&c.params.method!=='GET'||c.method==='native.invoke'&&['eventkit.save','eventkit.delete'].includes(c.params.method))),false);
 assert.deepEqual(direct,[]);await context.close();
 console.log(JSON.stringify({passed:true,checks:'Packaged manual Sync; stalled Reminders read; concrete timeout banner; busy cleared; late reply ignored; explicit retry completes; no writes',evidence:directory}));
}finally{
 await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));
 const {createServer}=await import('node:net');await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});console.log(JSON.stringify({closedTestPort:port}));
}
