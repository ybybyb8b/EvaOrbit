// Installed bundle, synthetic account/bridge only; never reaches production.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {preview} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const account='10000000-0000-4000-8000-000000000001';
const directory=await fs.mkdtemp(path.resolve('tmp/media-feedback-')),snapshotFile=path.join(directory,'snapshot.json');
const seeded=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',`import fs from 'node:fs';import {seedMedia} from './scripts/media-readonly-fixture.mjs';import {getMediaReadonlySnapshot} from './src/lib/services/media-readonly.ts';await seedMedia();fs.writeFileSync(process.env.MEDIA_SNAPSHOT,JSON.stringify(await getMediaReadonlySnapshot('${account}')));`],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'fixture.db'),EVAORBIT_MEDIA_COVER_DIR:path.join(directory,'covers'),MEDIA_SNAPSHOT:snapshotFile,VERCEL:''}});
assert.equal(seeded.status,0,seeded.stderr||seeded.stdout);
const snapshot=JSON.parse(await fs.readFile(snapshotFile,'utf8')),port=await freeLocalPort();
const server=await preview({configFile:path.resolve('vite.trackers.config.ts'),preview:{host:'127.0.0.1',port,strictPort:true}});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const haptics of [true,false]){
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
   // Refresh the mounted list: metadata must change without replacing image bytes
   // with authenticated relative URLs that the installed CSP cannot load.
   await page.evaluate(()=>{window.mediaRevision=1;window.dispatchEvent(new CustomEvent('eo:client-data-changed',{detail:{domains:['media'],reason:'invalidate'}}));});
   await page.getByText('Refreshed movie',{exact:true}).first().waitFor();await covers();
   await page.getByRole('button',{name:'TV Shows',exact:true}).click();
   await page.waitForFunction(()=>window.calls.some(c=>c.method==='business.request'&&c.params.path.includes('mediaType=tv')));await covers();
   const feedback=await page.evaluate(()=>window.calls.filter(c=>c.method==='haptic.play'));
   assert.equal(feedback.length>0,haptics,'Local selection feedback must follow Host capability');
   if(haptics)assert(feedback.some(c=>c.params.kind==='selection'));
   await page.getByRole('button',{name:'All',exact:true}).click();await page.locator('a.media-series-card').first().click();await page.locator('.media-poster-grid').waitFor();await covers();
   await page.locator('.mobile-global-header').getByRole('button',{name:/Back/}).click();await page.locator('.media-series-card').waitFor();await covers();
   // Native pull-to-refresh reloads WKWebView. Re-enter with the same cached account.
   await page.reload();await navigateLocal(page,'Media');await covers();
   await page.screenshot({path:path.join(directory,`media-haptics-${haptics}.png`),fullPage:true});
   assert.deepEqual(direct,[]);assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>window.calls.some(c=>c.method==='business.request'&&c.params.method!=='GET')),false);
  }finally{await context.close();}
 }
 console.log(JSON.stringify({passed:true,checks:'Packaged CSP; relative online cover URLs; list refresh and fresh metadata; filters; series/back; reload; supported and old Host haptics; no business writes',evidence:directory}));
}finally{
 await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));
 const {createServer}=await import('node:net');await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});console.log(JSON.stringify({closedTestPort:port}));
}
