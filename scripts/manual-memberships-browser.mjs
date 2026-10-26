// Isolated SQLite server + synthetic native bridge. Never contacts production.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {preview} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium,webkit}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
await fs.mkdir('tmp',{recursive:true});const directory=await fs.mkdtemp(path.resolve('tmp/manual-memberships-browser-'));
const port=await freeLocalPort(),base=`http://127.0.0.1:${port}`,errors=[],calls=[],direct=[];
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NODE_ENV:'production',EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'qa.db'),EVAORBIT_SUBSCRIPTION_ICON_DIR:path.join(directory,'icons'),EVAORBIT_SOFTWARE_ICON_DIR:path.join(directory,'software-icons'),VERCEL:''},stdio:['ignore','pipe','pipe']});
let output='',browser,context,packaged,closingWeb=false;server.stdout.on('data',v=>output+=v);server.stderr.on('data',v=>output+=v);
const api=async(url,method='GET',body)=>{const res=await fetch(base+url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});assert(res.ok,`${method} ${url}: ${await res.clone().text()}`);return res.json();};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const ago=new Date(today+'T12:00:00Z');ago.setUTCDate(ago.getUTCDate()-2);const past=ago.toISOString().slice(0,10);
const submit=async(page)=>{const form=page.locator('.form-sheet-layer form');const invalid=await form.evaluate(form=>[...form.elements].filter(e=>e.willValidate&&!e.validity.valid).map(e=>({name:e.getAttribute('aria-label')||e.closest('label')?.innerText||e.type,value:e.value,reason:e.validationMessage,min:e.min,max:e.max})));assert.deepEqual(invalid,[]);const id=await form.getAttribute('id');await page.locator(`button[form="${id}"]`).click();await page.locator('.form-sheet-layer').waitFor({state:'detached'});};
async function purchase(page,amount,expiry,currency='CNY'){
 await page.getByRole('button',{name:'Record purchase',exact:true}).first().click();await page.locator('.form-sheet-layer[data-state="open"] .form-sheet-body:not([inert])').waitFor();const form=page.locator('.subscription-purchase-form');await form.getByLabel('Amount paid',{exact:true}).fill(amount);await form.getByLabel('Currency',{exact:true}).fill(currency);await form.getByLabel('Purchased duration · optional',{exact:true}).fill('12');await form.getByLabel('Bonus duration · optional',{exact:true}).fill('3');await form.getByLabel('Final membership expiry',{exact:true}).fill(expiry);await form.getByLabel('Purchase note',{exact:true}).fill('Promotion with bonus months');await submit(page);
}
try{
 for(let i=0;i<120;i++){try{if((await fetch(base+'/subscriptions')).ok)break;}catch{}if(i===119)throw Error(output);await new Promise(r=>setTimeout(r,250));}
 await api('/api/preferences/appearance','PATCH',{...await api('/api/preferences/appearance'),uiLanguage:'en',englishFont:'ibm'});
 browser=process.env.EVAORBIT_BROWSER==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});context.setDefaultTimeout(15000);
 await context.addInitScript(()=>{localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.englishFont','ibm');});let page=await context.newPage();page.on('pageerror',e=>{if(!closingWeb)errors.push(String(e));});
 await page.goto(base+'/subscriptions');await page.getByRole('button',{name:'Add subscription',exact:true}).first().click();await page.locator('#subscription-form').waitFor();await page.locator('.form-sheet-layer[data-state="open"] .form-sheet-body:not([inert])').waitFor();await page.getByRole('button',{name:'Manual renewal',exact:true}).click();
 assert.equal(await page.getByLabel('Next renewal',{exact:true}).count(),0);assert.equal(await page.getByLabel('Every',{exact:true}).count(),0);
 await page.getByLabel('Name',{exact:true}).fill('Cloud QA membership');await page.getByLabel('Membership valid until',{exact:true}).fill('2027-01-01');await submit(page);
 let item=(await api('/api/subscriptions')).find(i=>i.name==='Cloud QA membership');assert(item);assert.equal(item.mode,'manual');assert.equal(item.paymentCount,0);
 await page.goto(base+`/subscriptions/${item.id}`);await purchase(page,'199.00','2030-02-01');
 item=await api(`/api/subscriptions/${item.id}`);assert.equal(item.payments.length,1);assert.equal(item.expiresOn,'2030-02-01');assert.equal(item.payments[0].bonusValue,3);
 await page.getByRole('heading',{name:'Purchase history',exact:true}).waitFor();
 await page.getByRole('button',{name:/^Edit purchase ·/}).first().click();await page.locator('.form-sheet-layer[data-state="open"] .form-sheet-body:not([inert])').waitFor();
 let editForm=page.locator('.subscription-purchase-form');assert.equal(await editForm.getByLabel('Amount paid',{exact:true}).inputValue(),'199.00');assert.equal(await editForm.getByLabel('Bonus duration · optional',{exact:true}).inputValue(),'3');
 await editForm.getByLabel('Amount paid',{exact:true}).fill('189.00');await editForm.getByLabel('Final membership expiry',{exact:true}).fill('2030-03-01');await editForm.getByLabel('Purchase note',{exact:true}).fill('Edited purchase');
 for(const mode of ['light','dark']){await page.evaluate(mode=>document.documentElement.dataset.mode=mode,mode);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(directory,`edit-purchase-${mode}.png`),fullPage:true,animations:"disabled"});}
 await submit(page);
 item=await api(`/api/subscriptions/${item.id}`);assert.equal(item.payments.length,1);assert.equal(item.spendByCurrency.CNY,18900);assert.equal(item.expiresOn,'2030-03-01');assert.equal(item.payments[0].note,'Edited purchase');
await page.getByRole('button',{name:'Adjust expiry',exact:true}).click();await page.locator('.form-sheet-layer[data-state="open"] .form-sheet-body:not([inert])').waitFor();await page.getByLabel('Membership valid until',{exact:true}).fill(past);await submit(page);
 item=await api(`/api/subscriptions/${item.id}`);assert.equal(item.expiresOn,past);assert.equal(item.payments.length,1);assert((await page.locator('body').innerText()).includes('EXPIRED'));
 for(const mode of ['light','dark']){await page.evaluate(mode=>{document.documentElement.dataset.mode=mode;window.scrollTo(0,0);},mode);await page.screenshot({path:path.join(directory,`web-detail-${mode}.png`),fullPage:true});}
 await page.goto(base+'/subscriptions');await page.getByRole('button',{name:'Expired',exact:true}).click();await page.getByRole('link',{name:/Cloud QA membership/}).last().waitFor();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(directory,'web-overview-mobile.png'),fullPage:true});
 const id=item.id,account='10000000-0000-4000-8000-000000000001';
 const snapshot=async()=>{const all=await api('/api/subscriptions'),items=await Promise.all(all.map(i=>api(`/api/subscriptions/${i.id}`)));return{format:'eo-subscriptions-readonly-v1',accountId:account,capturedAt:new Date().toISOString(),today,items,iconSources:{},library:[],libraryIconSources:{}};};
 assert.deepEqual(errors,[]);closingWeb=true;await context.close();context=null;const bundlePort=await freeLocalPort();packaged=await preview({configFile:path.resolve('vite.trackers.config.ts'),preview:{host:'127.0.0.1',port:bundlePort,strictPort:true}});
 context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});context.setDefaultTimeout(15000);
 await context.exposeFunction('qaBridge',async(method,params)=>{
  if(method==='host.getInfo')return{ok:true,result:{methods:['business.request','subscriptions.readOnlySnapshot']}};
  if(method==='trackers.getSession')return{ok:true,result:{accountId:account,email:'synthetic@example.invalid'}};
  if(method==='subscriptions.readOnlySnapshot')return{ok:true,result:await snapshot()};
  if(method==='business.request'){assert.equal(params.accountId,account);calls.push(params);assert(params.path.startsWith('/api/subscriptions'));const res=await fetch(base+params.path,{method:params.method,headers:{'Content-Type':params.contentType},body:params.bodyBase64?Buffer.from(params.bodyBase64,'base64'):undefined});return{ok:true,result:{status:res.status,body:await res.json()}};}
  if(method==='appearance.setPreference'||method==='haptic.play')return{ok:true,result:{}};
  return{ok:false,error:{code:'fixture',message:'Not downloaded in isolated QA'}};
 });
 await context.addInitScript(()=>{localStorage.setItem('evaorbit.uiLanguage','en');Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!window.qaOffline});window.EvaOrbitNative={version:1,call:(method,params)=>window.qaBridge(method,params)};});
 page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/\/(api|eo-api)\//.test(r.url()))direct.push(r.url());});await page.goto(`http://127.0.0.1:${bundlePort}`);await navigateLocal(page,'Subscriptions');await page.getByRole('link',{name:/Cloud QA membership/}).last().click();await page.getByRole('heading',{name:'Cloud QA membership',exact:true}).waitFor();await purchase(page,'29.99','2031-05-01','USD');
 item=await api(`/api/subscriptions/${id}`);assert.equal(item.payments.length,2);assert.equal(item.expiresOn,'2031-05-01');assert.equal(item.spendByCurrency.CNY,18900);assert.equal(item.spendByCurrency.USD,2999);assert.equal(calls.filter(c=>c.method==='POST'&&c.path.endsWith('/purchases')).length,1);
 await page.getByRole('button',{name:/^Edit purchase ·/}).first().click();await page.locator('.form-sheet-layer[data-state="open"] .form-sheet-body:not([inert])').waitFor();editForm=page.locator('.subscription-purchase-form');await editForm.getByLabel('Amount paid',{exact:true}).fill('25.99');await submit(page);
 item=await api(`/api/subscriptions/${id}`);assert.equal(item.payments.length,2);assert.equal(item.spendByCurrency.USD,2599);assert.equal(calls.filter(c=>c.method==='PATCH'&&/\/purchases\/\d+$/.test(c.path)).length,1);
 for(const width of [375,402,1280]){await page.setViewportSize({width,height:874});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:402,height:874});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(directory,'local-detail-mobile.png'),fullPage:true});
 const count=calls.filter(c=>c.method==='POST').length;await page.evaluate(()=>window.qaOffline=true);await page.getByRole('button',{name:'Record purchase',exact:true}).first().click();await page.locator('.form-sheet-layer[data-state="open"] .form-sheet-body:not([inert])').waitFor();const form=page.locator('.subscription-purchase-form');await form.getByLabel('Amount paid',{exact:true}).fill('50');await form.getByLabel('Final membership expiry',{exact:true}).fill('2035-01-01');const formId=await form.getAttribute('id');await page.locator(`button[form="${formId}"]`).click();await page.getByText(/Couldn’t confirm the result/).waitFor();assert.equal(calls.filter(c=>c.method==='POST').length,count);assert.equal((await api(`/api/subscriptions/${id}`)).payments.length,2);
 assert.deepEqual(direct,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',evidence:directory,checks:['manual create form omits recurring fields','web purchase + bonus history + edit same payment','expiry correction without payment','expired filter','light/dark 402 viewport','packaged shared UI create/edit purchase through account bridge','CSP no direct fetch','375/402/1280 layout'],realDevice:false}));
}catch(error){if(context){const p=context.pages()[0];console.error((await p.locator('body').innerText()).slice(-3500));await p.screenshot({path:path.join(directory,'failure.png'),fullPage:true});}console.error(output.slice(-2500));throw error;}
finally{await context?.close();await browser?.close();if(packaged)await new Promise(r=>packaged.httpServer.close(r));server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));const{createServer}=await import('node:net');await new Promise((resolve,reject)=>{const probe=createServer();probe.on('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});console.log(JSON.stringify({closedServerPort:port}));}
