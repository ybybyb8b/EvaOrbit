// Isolated packaged Host test; no production API or personal data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const directory=await fs.mkdtemp(path.resolve('tmp/insight-native-browser-')),db=path.join(directory,'test.db'),loader=pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href;
const seeded=spawnSync(process.execPath,['--experimental-loader',loader,'--input-type=module','--eval',`import{randomUUID}from'node:crypto';import{createFoodLog}from'./src/lib/services/food.ts';import{parseNewFoodLog}from'./src/lib/validation.ts';import{getInsightContext}from'./src/lib/services/insight-context.ts';import{startInsightRun,completeInsightRun}from'./src/lib/services/insight-runs.ts';import{getInsightDayReview}from'./src/lib/services/insight-reports.ts';import{dateInEvaOrbit,shiftDate}from'./src/lib/time.ts';const date=shiftDate(dateInEvaOrbit(),-1);for(const mealType of ['lunch','dinner'])await createFoodLog(parseNewFoodLog({title:mealType,mealType,estimatedKcal:500,occurredAt:date+'T12:00:00+08:00',occurredHasExplicitTime:false}));const id='day/'+date,context=await getInsightContext(id),start=await startInsightRun(id,randomUUID(),context.snapshotFingerprint);await completeInsightRun(id,start.attemptId,{summary:'本地 App 里的同一份日报。',findings:[]});console.log(JSON.stringify(await getInsightDayReview(date)));`],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:db,VERCEL:''}});assert.equal(seeded.status,0,seeded.stderr);const review=JSON.parse(seeded.stdout.trim().split('\n').at(-1));
let server,browser,context;const errors=[],direct=[];const port=await freeLocalPort();
try{
 server=await preview({configFile:path.resolve('vite.trackers.config.ts'),preview:{host:'127.0.0.1',port,strictPort:true}});browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:402,height:874}});context.setDefaultTimeout(15000);
 await context.addInitScript(review=>{
  localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.trackerMode','readonly');window.nativeCalls=[];window.review=review;window.savedDetail=review.detail;
  Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!window.syntheticOffline});
  window.EvaOrbitNative={version:1,call:async(method,params)=>{window.nativeCalls.push({method,params});let result;
   if(method==='host.getInfo')result={methods:['business.request']};else if(method==='trackers.getSession')result={accountId:'10000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid'};
   else if(['appearance.setPreference','haptic.play'].includes(method))result={};
   else if(method==='business.request'){
    const url=new URL(params.path,'https://fixture.invalid');if(url.pathname==='/api/insights')result={status:200,body:{items:window.review.status==='deleted'?[]:[window.savedDetail.report],nextBefore:null}};
    else if(url.pathname==='/api/insights/review')result={status:200,body:window.review};
    else if(url.pathname==='/api/insights/runs'&&params.method==='POST'){window.review={...window.review,status:'waiting_analysis',detail:null,run:{...window.review.run,generation:2,status:'waiting_retry'}};result={status:200,body:{queued:true,run:window.review.run}};}
    else if(params.method==='DELETE'){window.review={...window.review,status:'deleted',detail:null,deletedAt:new Date().toISOString(),run:{...window.review.run,status:'failed'}};result={status:200,body:{deleted:true,id:window.savedDetail.report.id}};}
    else result={status:200,body:window.savedDetail};
   }else return{ok:false,error:{code:'fixture',message:'No unrelated module downloaded in this test'}};
   return{ok:true,result};
  }};
 },review);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>{if(/\/(api|eo-api)\//.test(request.url()))direct.push(request.url());});await page.goto('http://127.0.0.1:'+port);await navigateLocal(page,'Insights');await page.getByText('本地 App 里的同一份日报。',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('summary').filter({hasText:'更多信息'}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'删除这份日报',exact:true}).click();await page.getByText('这份日报已删除，自动复盘不会重新创建。',{exact:true}).waitFor();
 const deletion=await page.evaluate(()=>window.nativeCalls.find(c=>c.method==='business.request'&&c.params.method==='DELETE'));assert.equal(deletion.params.accountId,'10000000-0000-4000-8000-000000000001');assert.match(deletion.params.path,/version=1&generation=1$/);
 await page.getByRole('button',{name:'重新生成日报',exact:true}).click();await page.getByText('已提交，自动复盘完成后会在这里显示。',{exact:true}).waitFor();assert.equal(await page.getByText('本地 App 里的同一份日报。',{exact:true}).count(),0);
 await page.evaluate(()=>{window.syntheticOffline=true;window.dispatchEvent(new Event('offline'));});await page.getByText('洞察需要联网检查最新记录，请恢复网络后查看。',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'请求当天复盘',exact:true}).count(),0);
 await page.evaluate(()=>{window.syntheticOffline=false;window.dispatchEvent(new Event('online'));});await page.getByText('记录已就绪，等待生成当天回顾。',{exact:true}).waitFor();
 await page.screenshot({path:'tmp/insight-dual-native-mobile.png',fullPage:true});for(const width of [320,1280]){await page.setViewportSize({width,height:874});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(direct,[],'Installed app must use bridge under connect-src none');assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,packagedNative:true,delete:true,rebuild:true,offlineGate:true,widths:[320,402,1280],directRequests:direct.length,errors}));
}catch(error){await context?.pages()[0]?.screenshot({path:'tmp/insight-dual-native-failure.png',fullPage:true});throw error;}
finally{await context?.close();await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));console.log(JSON.stringify({closedTestPort:port}));}
