// Local source served by Vite, synthetic account/bridge only; never reaches production.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const account='10000000-0000-4000-8000-000000000001';
const directory=await fs.mkdtemp(path.resolve('tmp/media-feedback-')),snapshotFile=path.join(directory,'snapshot.json');
const seeded=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',`import fs from 'node:fs';import {seedMedia} from './scripts/media-readonly-fixture.mjs';import {getMediaReadonlySnapshot} from './src/lib/services/media-readonly.ts';await seedMedia();fs.writeFileSync(process.env.MEDIA_SNAPSHOT,JSON.stringify(await getMediaReadonlySnapshot('${account}')));`],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'fixture.db'),EVAORBIT_MEDIA_COVER_DIR:path.join(directory,'covers'),MEDIA_SNAPSHOT:snapshotFile,VERCEL:''}});
assert.equal(seeded.status,0,seeded.stderr||seeded.stdout);
const snapshot=JSON.parse(await fs.readFile(snapshotFile,'utf8')),port=await freeLocalPort();
const server=await createServer({configFile:path.resolve('vite.trackers.config.ts'),server:{host:'127.0.0.1',port,strictPort:true}});await server.listen();
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const haptics of [true]){
  const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});
  try{
   await context.addInitScript(({account,snapshot,haptics})=>{
    localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.trackerMode','readonly');
    window.calls=[];window.mediaRevision=0;
    window.EvaOrbitNative={version:1,call:async(method,params={})=>{
     window.calls.push({method,params});let result;
     if(method==='host.getInfo')result={platform:'ios',methods:['business.request','media.readOnlySnapshot',...(haptics?['haptic.play']:[])]};
     else if(method==='trackers.getSession')result={accountId:account,email:'synthetic@example.invalid'};
     else if(method==='media.readOnlySnapshot')result=snapshot;
     else if(method==='haptic.play'||method==='appearance.setPreference')result={};
     else if(method==='business.request'){
      if(params.method!=='GET')throw Error('Unexpected business write');
      const url=new URL(params.path,'https://synthetic.invalid');
      if(url.pathname==='/api/media/series')result={status:200,body:snapshot.series};
      else if(url.pathname==='/api/media')result={status:200,body:snapshot.items.filter(item=>!url.searchParams.has('mediaType')||item.mediaType===url.searchParams.get('mediaType')).map(item=>({...item,originalTitle:window.mediaRevision&&item.mediaType==='movie'?'Refreshed movie':item.originalTitle,translatedTitle:window.mediaRevision&&item.mediaType==='movie'?null:item.translatedTitle,viewingCount:item.viewings.length,latestWatchedDate:item.viewings.at(-1)?.watchedDate??null,coverUrl:item.coverUrl?`/api/media/${item.id}/cover?v=${window.mediaRevision}`:null}))};
      else result={status:404,body:{error:'Not in synthetic fixture'}};
     }else return{ok:false,error:{code:'fixture',message:'Module not downloaded'}};
     return{ok:true,result};
    }};
   },{account,snapshot,haptics});
   const page=await context.newPage(),direct=[],errors=[];
   page.on('request',r=>{if(/\/(api|eo-api)\//.test(r.url()))direct.push(r.url());});page.on('pageerror',e=>errors.push(String(e)));
   const open=async()=>{await page.goto(`http://127.0.0.1:${port}`);await navigateLocal(page,'Media');await page.locator('.media-page').waitFor();await page.waitForFunction(()=>window.calls.some(c=>c.method==='business.request'&&c.params.path.startsWith('/api/media?')));};
   const covers=async()=>{await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.media-page img')];return images.length>0&&images.every(img=>img.src.startsWith('data:image/')&&img.complete&&img.naturalWidth>0);});};
   await open();await covers();
   const pull=async({x=180,y=220,end=true}={})=>page.locator('.media-page').evaluate((target,{x,y,end})=>{
    const touch=(clientX,clientY)=>new Touch({identifier:1,target,clientX,clientY,pageX:clientX,pageY:clientY});
    target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(180,60)]}));
    const prevented=!target.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[touch(x,y)]}));
    if(end)target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[touch(x,y)]}));
    return prevented;
   },{x,y,end});
   const downloads=()=>page.evaluate(()=>window.calls.filter(c=>c.method==='media.readOnlySnapshot'&&c.params.refresh).length);
   await page.evaluate(()=>{window.documentToken='preserved';window.unexpectedSystemEvents=0;for(const name of ['online','evaorbit:native-active'])window.addEventListener(name,()=>window.unexpectedSystemEvents++);window.mediaRevision=1;});
   const before=await downloads();
   assert.equal(await pull({end:false}),true);await page.locator('.pull-refresh-indicator.is-ready').waitFor();
   assert.equal(await page.evaluate(()=>scrollY),0);
   await page.screenshot({path:path.join(directory,'pull-ready.png')});
   await page.locator('.media-page').evaluate(target=>target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[]})));
   await page.waitForFunction(before=>window.calls.filter(c=>c.method==='media.readOnlySnapshot'&&c.params.refresh).length>before,before);
   await page.getByText('Refreshed movie',{exact:true}).first().waitFor();await covers();
   await page.locator('.pull-refresh-indicator.is-idle').waitFor();
   await page.getByRole('button',{name:'TV Shows',exact:true}).click();
   const selected=await page.getByRole('button',{name:'TV Shows',exact:true}).getAttribute('class');
   const filteredBefore=await downloads();await pull();await page.waitForFunction(before=>window.calls.filter(c=>c.method==='media.readOnlySnapshot'&&c.params.refresh).length>before,filteredBefore);
   await page.locator('.pull-refresh-indicator.is-idle').waitFor();
   assert.equal(await page.getByRole('button',{name:'TV Shows',exact:true}).getAttribute('class'),selected);
   const horizontalBefore=await downloads();await pull({x:340,y:90});assert.equal(await downloads(),horizontalBefore);
   await page.locator('.home-quick-log-trigger').click();await page.getByRole('dialog').waitFor();
   const blockedBefore=await downloads();await pull();assert.equal(await downloads(),blockedBefore);await page.getByRole('dialog').waitFor();
   await page.locator('.form-sheet-header button').click();const discard=page.getByRole('button',{name:'Discard and close',exact:true});if(await discard.isVisible())await discard.click();
   await page.locator('.form-sheet-layer').waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>window.documentToken),'preserved');
   assert.equal(await page.evaluate(()=>window.unexpectedSystemEvents),0);
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overscrollBehaviorY),'none');
   await page.screenshot({path:path.join(directory,'after-pull.png'),fullPage:true});
   assert.deepEqual(direct,[]);assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>window.calls.some(c=>c.method==='business.request'&&c.params.method!=='GET')),false);
  }finally{await context.close();}
 }
 console.log(JSON.stringify({passed:true,checks:'Shared pull indicator and real loader; in-place metadata and covers; filter retention; horizontal and modal guards; no reload, fake online/native-active or business writes',evidence:directory}));
}finally{
 await browser?.close();await server.close();
 const {createServer}=await import('node:net');await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});console.log(JSON.stringify({closedTestPort:port}));
}
