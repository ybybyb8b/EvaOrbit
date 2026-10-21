import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const directory=await fs.mkdtemp(path.resolve('tmp/tracker-replica-browser-')),port=await freeLocalPort(),account='10000000-0000-4000-8000-000000000001',stamp='2026-10-20T00:00:00Z';
const tracker={id:1,name:'Cloud canary',groupName:'Tests',icon:'✦',iconType:'emoji',quickCaptureEnabled:false,archivedAt:null,statsConfig:{},createdAt:stamp,updatedAt:stamp};
const snapshot={format:'eo-trackers-readonly-v1',accountId:account,capturedAt:stamp,details:[{tracker,fields:[],entries:[],goals:[],reminders:[],stats:{total:0}}]};
const legacy={schemaVersion:1,accountId:account,revision:1,records:[],outbox:[{mutationId:'legacy-never-upload',wire:{mutationId:'legacy-never-upload'}}]};
const cloud=[{resourceType:'tracker',serverId:1,version:1,payload:tracker}],receipts=new Map(),requests=[],errors=[];let id=10,revision=1,ready=false,offline=false,lose=false,context;
const server=await createServer({configFile:path.resolve('vite.trackers.config.ts'),server:{host:'127.0.0.1',port,strictPort:true}});
async function cached(p,key){return p.evaluate(async key=>{const db=await new Promise(resolve=>{const r=indexedDB.open('eo-tracker-local-v1',1);r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const r=db.transaction('states').objectStore('states').get(key);r.onsuccess=()=>{resolve(r.result);db.close();};});},key);}
async function open(){
 context=await chromium.launchPersistentContext(path.join(directory,'profile'),{channel:'chrome',headless:true,viewport:{width:402,height:874},isMobile:true,hasTouch:true});context.setDefaultTimeout(12000);
 await context.addInitScript(()=>{localStorage.setItem('evaorbit.uiLanguage','zh-CN');localStorage.setItem('evaorbit.englishFont','ibm');});
 await context.route('**/eo-api/**',r=>{
  if(offline)return r.abort();const req=r.request(),p=new URL(req.url()).pathname;
  if(p==='/eo-api/session')return r.fulfill({json:{authenticated:true,accountId:account}});
  if(p==='/eo-api/trackers')return r.fulfill({json:[tracker]});if(p==='/eo-api/trackers/1')return r.fulfill({json:snapshot.details[0]});
  if(p!=='/eo-api/sync')return r.fulfill({status:404,json:{error:'Fixture module unavailable'}});
  const body=req.postDataJSON();requests.push(structuredClone(body));
  if(!ready){assert.equal(body.mutations.length,0,'Old API must never see mutations');return r.fulfill({json:{protocolVersion:1}});}
  const results=[];
  for(const m of body.mutations){
   const saved=receipts.get(m.mutationId);if(saved){assert.equal(JSON.stringify(m),saved.wire);results.push({...saved.result,status:'duplicate'});continue;}
   let row=cloud.find(c=>c.resourceType===m.resourceType&&c.serverId===m.serverId),result;
   if(m.operation!=='create'&&(!row||row.version!==m.baseVersion))result={mutationId:m.mutationId,status:'conflict'};
   else if(m.operation==='delete'){cloud.splice(cloud.indexOf(row),1);result={mutationId:m.mutationId,status:'applied',serverId:row.serverId,version:row.version+1};}
   else{if(!row){row={resourceType:m.resourceType,serverId:id++,version:0,payload:{...tracker,name:'',id:id-1}};cloud.push(row);}row.version++;row.payload={...row.payload,...m.payload,id:row.serverId};result={mutationId:m.mutationId,status:'applied',serverId:row.serverId,version:row.version};}
   receipts.set(m.mutationId,{wire:JSON.stringify(m),result});results.push(result);
  }
  const result={protocolVersion:2,accountId:account,results,snapshot:{complete:true,revision:revision++,records:structuredClone(cloud)}};
  if(lose&&body.mutations.length){lose=false;return r.abort();}return r.fulfill({json:result});
 });
 const p=context.pages()[0];p.on('pageerror',e=>errors.push(String(e)));await p.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle'});return p;
}
async function dismiss(p){for(const b of await p.locator('.error-banner-close').all())await b.click();}
async function sync(p){
 await dismiss(p);await p.locator('.tracker-sync-button').click();
 const button=p.locator('.tracker-sync-settings .section-heading button');await button.waitFor();
 await p.waitForFunction(()=>!document.querySelector('.tracker-sync-settings .section-heading button')?.disabled);
 await button.click();await p.waitForFunction(()=>!document.querySelector('.tracker-sync-settings .section-heading button')?.disabled);
 await p.locator('.form-sheet-header button').click();await p.locator('.form-sheet-layer').waitFor({state:'detached'});
}
async function entry(p,note){await dismiss(p);await p.getByRole('button',{name:'新增记录',exact:true}).click();await p.locator('#tracker-entry-form textarea').fill(note);await p.locator('button[form="tracker-entry-form"]').click();await p.locator('#tracker-entry-form').waitFor({state:'detached'});await p.getByText(note,{exact:true}).waitFor();}
try{
 await server.listen();console.log(JSON.stringify({pid:process.pid,port}));let p=await open();
 await p.evaluate(async({account,legacy,snapshot})=>{const db=await new Promise(resolve=>{const r=indexedDB.open('eo-tracker-local-v1',1);r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=db.transaction(['session','states'],'readwrite');tx.objectStore('session').put({accountId:account,email:'canary@example.invalid'},'current');tx.objectStore('states').put(legacy,account);tx.objectStore('states').put(snapshot,'readonly:'+account);tx.oncomplete=resolve;});db.close();},{account,legacy,snapshot});await p.reload();await navigateLocal(p,'观测');await p.locator('.tracker-card').waitFor();await p.locator('.tracker-card a').first().click();assert(await p.getByRole('button',{name:'新增记录',exact:true}).isDisabled());
 await p.locator('.mobile-nav').getByRole('link',{name:'首页',exact:true}).click();await navigateLocal(p,'观测');await dismiss(p);await p.getByRole('button',{name:'新增观测',exact:true}).click();const form=p.locator('#tracker-create-form');await form.locator('.tracker-basic-fields input').nth(0).fill('Replica canary');await form.locator('.tracker-basic-fields input').nth(1).fill('Tests');await form.locator('.tracker-capture-toggle input').uncheck();await p.locator('button[form="tracker-create-form"]').click();await p.getByRole('heading',{name:'Replica canary',exact:true}).waitFor();await entry(p,'Offline draft');assert((await cached(p,'replica-v1:'+account)).outbox.length>=2);assert(requests.every(r=>r.mutations.length===0));
 await context.close();context=null;offline=true;p=await open();await navigateLocal(p,'观测');await p.getByText('Replica canary',{exact:true}).click();await p.getByText('Offline draft',{exact:true}).waitFor();await entry(p,'Second offline draft');await entry(p,'Temporary local record');let temp=p.locator('.tracker-entry-list article').filter({hasText:'Temporary local record'});await dismiss(p);await temp.getByLabel('记录操作',{exact:true}).click();await temp.locator('.tracker-entry-actions button').first().click();await p.locator('#tracker-entry-form textarea').fill('Edited local record');await p.locator('button[form="tracker-entry-form"]').click();await p.locator('#tracker-entry-form').waitFor({state:'detached'});temp=p.locator('.tracker-entry-list article').filter({hasText:'Edited local record'});await dismiss(p);await temp.getByLabel('记录操作',{exact:true}).click();await temp.locator('.tracker-entry-actions button').nth(1).click();await p.getByRole('button',{name:'确认删除',exact:true}).click();await p.getByText('Edited local record',{exact:true}).waitFor({state:'detached'});assert.deepEqual(await cached(p,account),legacy);
 offline=false;ready=true;lose=true;await sync(p);await sync(p);await p.waitForFunction(async account=>{const {trackerPlatform}=await import('/platform.ts');const s=await trackerPlatform({editableTrackers:true}).storage({accountId:account,email:''}).read();return s.outbox.length===0;},account);assert.equal(cloud.filter(c=>c.resourceType==='tracker'&&c.payload.name==='Replica canary').length,1);assert.equal(cloud.filter(c=>c.resourceType==='tracker_entry').length,2);
 const remote=cloud.find(c=>c.resourceType==='tracker_entry'&&c.payload.note==='Offline draft');remote.payload.note='Web/MCP canary';remote.version++;await sync(p);await p.getByText('Web/MCP canary',{exact:true}).waitFor();
 // Use the same store/transport to exercise a conflict while the UI retains its current page.
 await p.evaluate(async({account,id,storeModule})=>{const {trackerPlatform}=await import('/platform.ts'),{LocalTrackerStore}=await import(storeModule);const store=new LocalTrackerStore(account,trackerPlatform({editableTrackers:true}).storage({accountId:account,email:''}));await store.initialize();const row=store.getSnapshot().records.find(r=>r.resourceType==='tracker_entry'&&r.serverId===id);await store.save('tracker_entry',row.id,{note:'Local conflict draft'});},{account,id:remote.serverId,storeModule:'/@fs/'+path.resolve('src/lib/tracker-local-store.ts').replaceAll('\\','/')});remote.version++;remote.payload.note='Concurrent cloud edit';await sync(p);const conflicted=await cached(p,'replica-v1:'+account);assert(conflicted.records.some(r=>r.status==='conflict'&&r.payload.note==='Local conflict draft'));assert(conflicted.outbox.length>0);
 const clean=cloud.find(c=>c.resourceType==='tracker_entry'&&c.payload.note==='Second offline draft');cloud.splice(cloud.indexOf(clean),1);await sync(p);assert(!(await cached(p,'replica-v1:'+account)).records.some(r=>r.resourceType==='tracker_entry'&&r.serverId===clean.serverId));assert.deepEqual(await cached(p,account),legacy);assert(!JSON.stringify(requests).includes('legacy-never-upload'));
 await p.locator('.mobile-nav').getByRole('link',{name:'设置',exact:true}).click();await p.getByRole('button',{name:'暂停 Tracker 编辑',exact:true}).click();await navigateLocal(p,'观测');await p.getByText('Replica canary',{exact:true}).click();await p.getByText('Local conflict draft',{exact:true}).waitFor();assert(await p.getByRole('button',{name:'新增记录',exact:true}).count()===0);assert.deepEqual(await cached(p,account),legacy);const beforeSwitch=await cached(p,'replica-v1:'+account);const blocked=await p.evaluate(async({account,state})=>{const db=await new Promise(resolve=>{const r=indexedDB.open('eo-tracker-local-v1',1);r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const tx=db.transaction('session','readwrite');tx.objectStore('session').put({accountId:'other',email:'other@example.invalid'},'current');tx.oncomplete=resolve;});db.close();const {trackerPlatform}=await import('/platform.ts');try{await trackerPlatform({editableTrackers:true}).storage({accountId:account,email:''}).commit(state.revision,{...state,revision:state.revision+1});return false;}catch{return true;}},{account,state:beforeSwitch});assert(blocked);assert.deepEqual(await cached(p,'replica-v1:'+account),beforeSwitch);assert.deepEqual(errors,[]);
 console.log('PASS Tracker independent replica: old API gets zero mutations; cached cloud edits gated; offline creation/records/restart; lost reply retry/idempotency; remote refresh/conflict/deletion; pause retains drafts; legacy queue unchanged');
}catch(e){if(context){const p=context.pages()[0];console.log((await p.locator('body').innerText()).slice(-2000));await p.screenshot({path:'tmp/tracker-replica-failure.png',fullPage:true});}throw e;}
finally{await context?.close();await server.close();console.log(JSON.stringify({closedPort:port}));}
