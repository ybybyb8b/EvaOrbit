// Isolated synthetic account only. Every cloud request is intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer,preview} from 'vite';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const account='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const directory=await fs.mkdtemp(path.resolve('tmp/online-business-browser-')),ports=[],calls=[],errors=[];
let server,packaged,browser,context,items=[],wrong=false,protocol=1,lose=false,offline=false,testAccount=true,authenticated=true,ownerAccountAllowed=false,slowSnapshot=false,httpUnavailable=false;
const healthFile=path.join(directory,'health.json');
const seeded=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',`import {writeFileSync} from 'node:fs';import {seedHealth} from './scripts/health-readonly-fixture.mjs';import {getHealthReadonlySnapshot} from './src/lib/services/health-readonly.ts';await seedHealth();writeFileSync(process.env.HEALTH_SNAPSHOT,JSON.stringify(await getHealthReadonlySnapshot('${account}')));`],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'isolated.db'),HEALTH_SNAPSHOT:healthFile,VERCEL:''}});
assert.equal(seeded.status,0,seeded.stderr||seeded.stdout);
const health=JSON.parse(await fs.readFile(healthFile,'utf8'));
const legacy={schemaVersion:1,accountId:account,revision:1,records:[],outbox:[{mutationId:'online-must-not-upload-old-queue',wire:{mutationId:'online-must-not-upload-old-queue'}}]};
const createItem=content=>({id:items.length+1,content,source:'manual',status:'inbox',processedAt:null,convertedType:null,convertedId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
async function seed(page){await page.evaluate(async({account,legacy})=>{localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.trackerMode','readonly');const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('eo-tracker-local-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('states');r.result.createObjectStore('session');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction(['states','session'],'readwrite');tx.objectStore('session').put({accountId:account,email:'synthetic@example.invalid'},'current');tx.objectStore('states').put(legacy,account);tx.oncomplete=resolve;tx.onerror=reject;});db.close();},{account,legacy});}
async function routeRequest(route){
 if(offline)return route.abort();
 const req=route.request(),url=new URL(req.url()),p=url.pathname,method=req.method(),json=value=>route.fulfill({json:value});
 if(p==='/eo-api/session')return json({authenticated,email:'synthetic@example.invalid',accountId:wrong?other:account,onlineBusinessProtocol:protocol,onlineBusinessTestAccount:testAccount,onlineBusinessAccountAllowed:ownerAccountAllowed});
 if(p==='/eo-api/inbox'){if(slowSnapshot)await new Promise(resolve=>setTimeout(resolve,2500));return json(items);}
 if(!p.startsWith('/eo-api/business/'))return route.fulfill({status:404,json:{error:'No synthetic snapshot for this module'}});
 if(httpUnavailable&&method==='GET')return route.fulfill({status:503,json:{error:'Synthetic temporary outage'}});
 assert.equal(req.headers()['x-evaorbit-account'],account);calls.push({path:p,method,body:req.postData()});
 if(lose&&method!=='GET'){lose=false;return route.abort();}
 if(p==='/eo-api/business/inbox'&&method==='POST'){const item=createItem(req.postDataJSON().content);items.push(item);return json(item);}
 if(p.startsWith('/eo-api/business/inbox')&&method==='GET')return json(items.filter(item=>url.searchParams.get('status')==='all'||!url.searchParams.get('status')||item.status===url.searchParams.get('status')));
 if(/^\/eo-api\/business\/inbox\/[0-9]+$/.test(p)){
  const id=Number(p.split('/').pop()),item=items.find(row=>row.id===id);
  if(method==='PATCH'){Object.assign(item,req.postDataJSON());return json(item);}
  if(method==='DELETE'){items=items.filter(row=>row.id!==id);return route.fulfill({status:204});}
 }
 return json({ok:true});
}
async function openInbox(page){await navigateLocal(page,'Inbox');await page.locator('.inbox-capture textarea').waitFor();}
async function capture(page,text){await page.locator('.inbox-capture textarea').fill(text);await page.locator('.inbox-capture button[type="submit"]').click();await page.locator('.inbox-row p').filter({hasText:text}).waitFor();}
try{
 server=await createServer({configFile:path.resolve('vite.trackers.config.ts'),server:{host:'127.0.0.1',port:await freeLocalPort(),strictPort:true}});await server.listen();const port=server.httpServer.address().port;ports.push(port);
 browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:402,height:874}});context.setDefaultTimeout(15000);await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>localStorage.getItem('synthetic-offline')!=='1'}));await context.route('**/eo-api/**',routeRequest);
 let page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));await page.goto(`http://127.0.0.1:${port}`);await seed(page);await page.reload();
 // One request per module exercises the same policy/identity/transport boundary.
 const paths=['food/logs','drinks/logs','cats/pets','health/weight','subscriptions','chronicle','memos','relations/people','media','tasks','projects','project-items','lucius/diary','daily-journal'];
 await page.evaluate(async({account,paths})=>{const {trackerPlatform}=await import('/platform.ts');const platform=trackerPlatform();for(const path of paths){const r=await platform.businessRequest({accountId:account,email:'synthetic@example.invalid'},'/api/'+path,{method:'POST',body:JSON.stringify({synthetic:true})});if(!r.ok)throw Error(path);}window.onlinePlatform=platform;}, {account,paths});
 assert.equal(calls.filter(call=>call.method==='POST').length,paths.length);
 await openInbox(page);slowSnapshot=true;
 await page.locator('.inbox-capture textarea').fill('Online capture canary');await page.locator('.inbox-capture button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('.inbox-capture textarea')?.value==='',{},{timeout:1500});
 await page.locator('.inbox-row p').filter({hasText:'Online capture canary'}).waitFor();slowSnapshot=false;assert.equal(items.length,1);
 await page.getByRole('button',{name:'Mark processed',exact:true}).click();await page.getByRole('button',{name:'Processed',exact:true}).click();await page.getByText('Online capture canary',{exact:true}).waitFor();assert.equal(items[0].status,'processed');
 await page.screenshot({path:path.join(directory,'inbox-online-mobile.png'),fullPage:true});
 // Persisted snapshot survives a network-free restart.
 offline=true;await page.evaluate(()=>localStorage.setItem('synthetic-offline','1'));await page.reload();await openInbox(page);await page.getByRole('button',{name:'Processed',exact:true}).click();await page.getByText('Online capture canary',{exact:true}).waitFor();
 const before=calls.length;await page.locator('.inbox-capture textarea').fill('Never queued');await page.locator('.inbox-capture button[type="submit"]').click();await page.getByText(/Connect to the internet to save/).first().waitFor();assert.equal(calls.length,before);assert.equal(items.length,1);
 offline=false;await page.evaluate(()=>localStorage.removeItem('synthetic-offline'));await page.evaluate(()=>document.querySelector('.inbox-capture textarea').value='');
 httpUnavailable=true;await page.reload();await openInbox(page);await page.getByRole('button',{name:'Processed',exact:true}).click();await page.getByText('Online capture canary',{exact:true}).waitFor();httpUnavailable=false;
 // Old protocol and wrong identity cannot reach a business endpoint.
 for(const kind of ['protocol','account','owner']){protocol=kind==='protocol'?0:1;wrong=kind==='account';testAccount=kind!=='owner';const count=calls.length;const message=await page.evaluate(async account=>{const {trackerPlatform}=await import('/platform.ts');try{await trackerPlatform().businessRequest({accountId:account,email:''},'/api/tasks',{method:'POST',body:'{}'});return 'unexpected';}catch(error){return error.message;}},account);assert.notEqual(message,'unexpected');assert.equal(calls.length,count);}
 wrong=false;protocol=1;testAccount=false;ownerAccountAllowed=true;
 assert.equal(await page.evaluate(async account=>{const {trackerPlatform}=await import('/platform.ts');return(await trackerPlatform().businessRequest({accountId:account,email:''},'/api/tasks')).ok;},account),true);ownerAccountAllowed=false;
 wrong=false;protocol=1;testAccount=true;authenticated=true;lose=true;const count=calls.length;const unknown=await page.evaluate(async account=>{const {trackerPlatform}=await import('/platform.ts');try{await trackerPlatform().businessRequest({accountId:account,email:''},'/api/tasks',{method:'POST',body:'{}'});}catch(error){return error.message;}},account);assert.match(unknown,/result is unknown/);assert.equal(calls.length,count+1,'Lost response is never retried');
 // Frozen legacy queue remains byte-identical.
 const original=await page.evaluate(async account=>{const db=await new Promise(resolve=>{const r=indexedDB.open('eo-tracker-local-v1',1);r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const r=db.transaction('states').objectStore('states').get(account);r.onsuccess=()=>{resolve(r.result);db.close();};});},account);assert.deepEqual(original,legacy);
 page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete Inbox item',exact:true}).click();await page.locator('.inbox-row').waitFor({state:'detached'});assert.equal(items.length,0);
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(directory,'inbox-online-desktop.png'),fullPage:true});
 // Expired login is an overlay, not a destructive navigation away from the current draft.
 await page.locator('.inbox-capture textarea').fill('Draft preserved through reconnect');authenticated=false;
 await page.evaluate(async account=>{const {trackerPlatform}=await import('/platform.ts');try{await trackerPlatform().businessRequest({accountId:account,email:''},'/api/tasks');}catch{}},account);
 await page.getByRole('heading',{name:'Reconnect account',exact:true}).waitFor();assert.equal(await page.locator('.inbox-capture textarea').inputValue(),'Draft preserved through reconnect');authenticated=true;
 await page.locator('#local-login input[name=password]').fill('synthetic-not-a-real-password');await page.locator('button[form="local-login"]').click();await page.locator('#local-login').waitFor({state:'detached'});assert.equal(await page.locator('.inbox-capture textarea').inputValue(),'Draft preserved through reconnect');
 await context.close();context=null;
 // Installed bundle: original form saves through the bridge under connect-src:none.
 const bundlePort=await freeLocalPort();ports.push(bundlePort);packaged=await preview({configFile:path.resolve('vite.trackers.config.ts'),preview:{host:'127.0.0.1',port:bundlePort,strictPort:true}});
 context=await browser.newContext({viewport:{width:402,height:874}});context.setDefaultTimeout(15000);
 await context.addInitScript(({account,health})=>{localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.trackerMode','readonly');window.nativeCalls=[];window.nativeInbox=[];window.EvaOrbitNative={version:1,call:async(method,params)=>{
  window.nativeCalls.push({method,params});let result;
  if(method==='host.getInfo')result={methods:['business.request','inbox.readOnlySnapshot','health.readOnlySnapshot']};
  else if(method==='trackers.getSession')result={accountId:account,email:'synthetic@example.invalid'};
  else if(method==='inbox.readOnlySnapshot')result={format:'eo-inbox-readonly-v1',accountId:account,capturedAt:new Date().toISOString(),items:window.nativeInbox};
  else if(method==='health.readOnlySnapshot')result=health;
  else if(method==='business.request'){
   if(params.path.startsWith('/api/health/weight')){if(params.method==='POST'){const input=JSON.parse(atob(params.bodyBase64)),item={...health.weights[0],...input,id:1000000};health.weights.push(item);result={status:200,body:item};}else result={status:200,body:health.weights};}
   else if(params.method==='POST'){const data=JSON.parse(atob(params.bodyBase64)),item={id:1,content:data.content,source:'manual',status:'inbox',processedAt:null,convertedType:null,convertedId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};window.nativeInbox.push(item);result={status:200,body:item};}
   else result={status:200,body:window.nativeInbox};
  }else if(method==='appearance.setPreference'||method==='haptic.play')result={};
  else return {ok:false,error:{code:'fixture',message:'Not downloaded in this synthetic test'}};
  return{ok:true,result};
 }};},{account,health});
 const direct=[];page=await context.newPage();page.on('request',req=>{if(/\/(api|eo-api)\//.test(req.url()))direct.push(req.url());});page.on('pageerror',error=>errors.push(String(error)));await page.goto(`http://127.0.0.1:${bundlePort}`);await openInbox(page);await capture(page,'Packaged bridge capture');assert.deepEqual(direct,[]);
 await navigateLocal(page,'Home');await page.locator('.home-quick-log-trigger').click();await page.locator('.home-quick-log-grid').getByRole('button',{name:'Weight',exact:true}).click();await page.locator('#weight-entry-form').waitFor();await page.locator('button[form="weight-entry-form"]').click();await page.locator('#weight-entry-form').waitFor({state:'detached'});
 const nativeWrites=await page.evaluate(()=>window.nativeCalls.filter(call=>call.method==='business.request'&&call.params.method==='POST'));assert.equal(nativeWrites.length,2);assert(nativeWrites.some(call=>call.params.path==='/api/health/weight'));assert.equal(nativeWrites[0].params.accountId,account);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',modules:paths.length,checks:'Shared Inbox form create/update/delete; offline reload and denied writes; protocol/account barriers; lost-response no retry; legacy queue; desktop/mobile; packaged Inbox and Weight forms through bridge CSP',evidence:directory}));
}catch(error){if(context){const p=context.pages()[0];console.error((await p.locator('body').innerText()).slice(-2500));await p.screenshot({path:path.join(directory,'failure.png'),fullPage:true});}throw error;}
finally{await context?.close();await browser?.close();await server?.close();if(packaged)await new Promise(resolve=>packaged.httpServer.close(resolve));for(const port of ports){const {createServer}=await import('node:net');await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});console.log(JSON.stringify({closedTestPort:port}));}}
