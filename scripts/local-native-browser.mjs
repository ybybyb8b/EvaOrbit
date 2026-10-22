// Packaged React UI + synthetic Native Bridge. No production accounts or Apple data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {preview} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const account='10000000-0000-4000-8000-000000000001',port=await freeLocalPort(),directory=await fs.mkdtemp(path.resolve('tmp/local-native-ui-'));
const server=await preview({configFile:path.resolve('vite.trackers.config.ts'),preview:{host:'127.0.0.1',port,strictPort:true}});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const allowed of [false,true]){
  const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});context.setDefaultTimeout(12000);
  await context.addInitScript(({account,allowed})=>{
   localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.englishFont','ibm');localStorage.setItem('evaorbit.trackerMode','readonly');window.calls=[];
   const health={available:true,installationId:'synthetic-installation',authorizationRequested:false,hasReadData:false,metrics:[],backgroundDelivery:{},lastLocalSync:null,lastSuccessfulUpload:null,pendingCount:0,credentialConfigured:false,lastError:null};
   const eventkit={available:true,installationId:'synthetic-installation',calendarPermission:'not_determined',reminderPermission:'not_determined',calendars:[],reminderLists:[]};
   const notifications={available:true,permission:'not_determined',scheduledCount:0};
   const core=['native.invoke','native.api','business.request','healthkit.getStatus','eventkit.getStatus','notification.getStatus','notification.openSettings'];
   const methods=[...core,'healthkit.configureCredential','healthkit.requestAuthorization','healthkit.clearCredential','healthkit.syncNow','healthkit.saveBodyMass','healthkit.saveMenstrualFlow','healthkit.deleteMenstrualFlow','eventkit.requestAccess','eventkit.fetch','eventkit.save','eventkit.delete','notification.requestAuthorization','notification.schedule','notification.cancel','notification.listPending'];
   const info=full=>({platform:'ios',apiOrigin:'https://eva-orbit.vercel.app',healthKitPipeline:'synthetic',methods:full?methods:core});
   window.EvaOrbitNative={version:1,call:async(method,params={})=>{
    window.calls.push({method,params});let result={};
    if(method==='host.getInfo')result=info(false);
    else if(method==='trackers.getSession')result={accountId:account,email:'synthetic@example.invalid'};
    else if(method==='healthkit.getStatus')result=health;
    else if(method==='eventkit.getStatus')result=eventkit;
    else if(method==='notification.getStatus')result=notifications;
    else if(method==='native.invoke'||method==='native.api'){
     if(params.accountId!==account||!allowed)return{ok:false,error:{code:'disabled',message:'Test account cannot modify Apple data'}};
     if(method==='native.api'){
      let body={};
      if(params.path==='/api/native/devices')body={credential:'synthetic-not-a-real-credential',syncMetrics:['sleep']};
      else if(params.path.startsWith('/api/health/menstrual-flow')||params.path==='/api/health/weight')body=[];
      else if(params.path==='/api/notifications')body={nativeNotifications:[]};
      else if(params.path==='/api/preferences/eventkit')body={available:true,userId:account,revision:1,preferences:{version:1,sources:[],routes:{}}};
      result={status:200,body};
     }else if(params.method==='host.getInfo')result=info(true);
     else if(params.method==='healthkit.configureCredential'){health.credentialConfigured=true;}
     else if(params.method==='healthkit.requestAuthorization'){health.authorizationRequested=true;result=health;}
     else if(params.method==='healthkit.syncNow')result={synced:true,status:health};
     else if(params.method==='notification.requestAuthorization'){notifications.permission='authorized';result=notifications;}
     else if(params.method==='notification.listPending')result={notifications:[]};
     else if(params.method==='eventkit.requestAccess'){eventkit.calendarPermission='full_access';result=eventkit;}
    }else if(method==='appearance.setPreference'||method==='haptic.play')result={};
    else return{ok:false,error:{code:'fixture',message:'Synthetic module not downloaded'}};
    return{ok:true,result};
   }};
  },{account,allowed});
  const page=await context.newPage(),direct=[],errors=[];page.on('request',r=>{if(/\/(api|eo-api)\//.test(r.url()))direct.push(r.url());});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+port);await navigateLocal(page,'Settings');
  await page.getByRole('button',{name:/Health & Native/}).click();await page.getByRole('heading',{name:'Energy, weight, menstrual flow & sleep'}).waitFor();
  const connect=page.getByRole('button',{name:'Connect / Request Access',exact:true});
  if(!allowed){assert.equal(await connect.count(),0);assert.equal((await page.evaluate(()=>window.calls)).filter(c=>c.method==='native.api').length,0);}
  else{
   await connect.click();await page.getByRole('button',{name:'Sync Now',exact:true}).waitFor();
   const configure=(await page.evaluate(()=>window.calls)).find(c=>c.method==='native.invoke'&&c.params.method==='healthkit.configureCredential');
   assert.equal(configure.params.arguments.ingestUrl,'https://eva-orbit.vercel.app/api/healthkit/energy/ingest');
   await page.getByRole('button',{name:'Sync Now',exact:true}).click();
   await navigateLocal(page,'Settings');await page.getByRole('button',{name:/Apple Integration/}).click();
   const grant=page.locator('.eventkit-section').getByRole('button',{name:'Request access',exact:true}).first();
   await grant.click();await page.waitForFunction(()=>window.calls.some(c=>c.method==='native.invoke'&&c.params.method==='eventkit.requestAccess'));
   await page.evaluate(()=>window.dispatchEvent(new Event('evaorbit:native-active')));
   await navigateLocal(page,'Settings');await page.getByRole('button',{name:/Notifications/}).click();
   await page.getByRole('button',{name:/Request access|Request Access|请求权限/}).click();
   await page.waitForFunction(()=>window.calls.some(c=>c.method==='native.api'&&c.params.path==='/api/notifications'));
   await page.screenshot({path:path.join(directory,'native-notifications.png'),fullPage:true});
  }
  assert.deepEqual(direct,[],'Installed CSP must not make direct API requests');assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log(JSON.stringify({passed:true,checks:'Packaged CSP; test account denied; primary Health registration and trusted ingest origin; native notification permission/reconcile; account-bound native API',evidence:directory}));
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));console.log(JSON.stringify({closedPort:port}));}
