// Packaged local frontend, synthetic account and bridge only; no cloud data writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
await fs.mkdir(path.resolve('tmp'),{recursive:true});
const directory=await fs.mkdtemp(path.resolve('tmp/subscriptions-parity-qa-'));
const seeded=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',`import {seedSubscriptions} from './scripts/subscriptions-readonly-fixture.mjs';import {getSubscriptionsReadonlySnapshot} from './src/lib/services/subscriptions-readonly.ts';await seedSubscriptions();console.log(JSON.stringify(await getSubscriptionsReadonlySnapshot('10000000-0000-4000-8000-000000000001')));`],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'test.db'),EVAORBIT_SUBSCRIPTION_ICON_DIR:path.join(directory,'icons'),EVAORBIT_SOFTWARE_ICON_DIR:path.join(directory,'software-icons'),VERCEL:''}});
assert.equal(seeded.status,0,seeded.stderr);
const snapshot=JSON.parse(seeded.stdout.trim()),errors=[],direct=[],port=await freeLocalPort();
let server,browser,context;
async function edit(page){await page.getByRole('button',{name:/Offline software/}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('.form-sheet-layer form').waitFor();}
async function submit(page){const id=await page.locator('.form-sheet-layer form').getAttribute('id');await page.locator(`button[form="${id}"]`).click();}
async function swipe(page,from,to){await page.locator('.page h1').evaluate((node,{from,to})=>{for(const [type,x]of [['touchstart',from],['touchmove',to],['touchend',to]]){const e=new Event(type,{bubbles:true,cancelable:true});const point={clientX:x,clientY:170,identifier:1};Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[point]},changedTouches:{value:[point]}});node.dispatchEvent(e);}},{from,to});}
try{
 server=await preview({configFile:path.resolve('vite.trackers.config.ts'),preview:{host:'127.0.0.1',port,strictPort:true}});
 browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});context.setDefaultTimeout(12000);
 await context.addInitScript(({snapshot})=>{
  localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.trackerMode','readonly');
  window.syntheticSnapshot=snapshot;window.bridgeCalls=[];window.syntheticOffline=false;
  Object.defineProperty(navigator,'onLine',{get:()=>!window.syntheticOffline,configurable:true});
  window.EvaOrbitNative={version:1,call:async(method,params)=>{
   window.bridgeCalls.push({method,params});let result;
   if(method==='host.getInfo')result={methods:['business.request','subscriptions.readOnlySnapshot']};
   else if(method==='trackers.getSession')result={accountId:snapshot.accountId,email:'synthetic@example.invalid'};
   else if(method==='subscriptions.readOnlySnapshot')result=window.syntheticSnapshot;
   else if(method==='business.request'){
    if(window.syntheticOffline)return {ok:false,error:{code:'offline',message:'Connect to the internet to save'}};
    const data=window.syntheticSnapshot;
    if(params.path==='/api/subscriptions/library'&&params.method==='GET')result={status:200,body:data.library};
    else if(params.path==='/api/subscriptions'&&params.method==='GET')result={status:200,body:data.items};
    else if(/^\/api\/subscriptions\/library\/[0-9]+$/.test(params.path)&&params.method==='PATCH'){
     const body=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(params.bodyBase64),c=>c.charCodeAt(0))));Object.assign(data.library[0],body);result={status:200,body:data.library[0]};
    }else if(params.path.endsWith('/icon')&&params.method==='POST')result={status:200,body:data.library[0]};
    else return {ok:false,error:{code:'fixture',message:'Unexpected synthetic business request'}};
   }else if(method==='appearance.setPreference'||method==='haptic.play')result={};
   else return {ok:false,error:{code:'fixture',message:'Not downloaded in this isolated test'}};
   return {ok:true,result:structuredClone(result)};
  }};
 },{snapshot});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/\/(api|eo-api)\//.test(r.url()))direct.push(r.url());});
 await page.goto(`http://127.0.0.1:${port}`);await navigateLocal(page,'Subscriptions');await page.getByRole('heading',{name:'Subscriptions',exact:true}).waitFor();
 await swipe(page,300,100);await page.getByRole('link',{name:'Trends',exact:true}).filter({has:page.locator('[aria-current="page"]')}).count();await page.waitForFunction(()=>document.querySelector('[data-section-key="trends"]')?.getAttribute('aria-current')==='page');
 await swipe(page,300,100);await page.getByRole('heading',{name:'Software library',exact:true}).waitFor();
 await page.getByRole('button',{name:/Offline software/}).locator('img').evaluate(async image=>{if(!image.complete)await new Promise(resolve=>image.onload=resolve);if(!image.naturalWidth)throw Error('Cached software icon missing');});
 await page.screenshot({path:path.join(directory,'library-mobile.png'),fullPage:true});
 await edit(page);
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='#a73e58';ctx.fillRect(0,0,32,32);return c.toDataURL().split(',')[1];});
 await page.locator('.form-sheet-layer input[type="file"]').setInputFiles({name:'software.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.locator('.form-sheet-layer img[src^="blob:"]').waitFor();
 await page.getByLabel('Software name',{exact:true}).fill('Offline software updated');
 await page.getByLabel('Software name',{exact:true}).press('Tab');
 await submit(page);await page.locator('.form-sheet-layer').waitFor({state:'detached'});await page.getByRole('button',{name:/Offline software updated/}).waitFor();
 const writes=await page.evaluate(()=>window.bridgeCalls.filter(c=>c.method==='business.request'&&c.params.method!=='GET'));
 assert.deepEqual(writes.map(c=>c.params.method),['PATCH','POST']);assert(writes.every(c=>c.params.accountId===snapshot.accountId));assert.match(writes[1].params.contentType,/multipart\/form-data/);
 await page.evaluate(()=>window.syntheticOffline=true);await navigateLocal(page,'Home');await navigateLocal(page,'Subscriptions');await page.getByRole('link',{name:'Library',exact:true}).click();await page.getByRole('button',{name:/Offline software updated/}).waitFor();
 await edit(page);await page.getByLabel('Software name',{exact:true}).fill('Must not save offline');await submit(page);await page.getByText('Couldn’t save. Check your connection and try again.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.bridgeCalls.filter(c=>c.method==='business.request'&&c.params.method!=='GET').length),2);
 assert.equal(await page.evaluate(()=>window.syntheticSnapshot.library[0].name),'Offline software updated');
 await page.locator('.form-sheet-header button').click();const discard=page.getByRole('button',{name:'Discard and close',exact:true});if(await discard.isVisible())await discard.click();
 for(const width of [375,402,1280]){await page.setViewportSize({width,height:874});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.screenshot({path:path.join(directory,'library-desktop.png'),fullPage:true});
 assert.deepEqual(direct,[]);assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',evidence:directory,checks:['Overview/Trends/Library swipe','cached software icons','shared edit and icon upload through account bridge','offline navigation and denied save','375/402/1280 no overflow','packaged CSP no direct API fetch'],realDevice:false}));
}catch(error){if(context){const page=context.pages()[0];console.error((await page.locator('body').innerText()).slice(-2000));console.error(JSON.stringify(await page.evaluate(()=>({library:window.syntheticSnapshot.library,calls:window.bridgeCalls.filter(c=>c.method==='business.request').map(c=>({...c,params:{...c.params,bodyBase64:c.params.contentType==='application/json'?atob(c.params.bodyBase64||''):undefined}}))})),null,2));await page.screenshot({path:path.join(directory,'failure.png'),fullPage:true});}throw error;}
finally{await context?.close();await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));const{createServer}=await import('node:net');await new Promise((resolve,reject)=>{const probe=createServer();probe.on('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});console.log(JSON.stringify({closedTestPort:port}));}
