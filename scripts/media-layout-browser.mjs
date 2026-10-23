// Shared Media UI, isolated fixture and read-only bridge; no production requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import {freeLocalPort,navigateLocal} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const directory=await fs.mkdtemp(path.resolve('tmp/media-layout-'));
const snapshotPath=path.join(directory,'snapshot.json'),account='10000000-0000-4000-8000-000000000001';
const seeded=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',`import fs from 'node:fs';import {seedMedia} from './scripts/media-readonly-fixture.mjs';import {getMediaReadonlySnapshot} from './src/lib/services/media-readonly.ts';await seedMedia();fs.writeFileSync(process.env.MEDIA_SNAPSHOT,JSON.stringify(await getMediaReadonlySnapshot('${account}')));`],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'fixture.db'),EVAORBIT_MEDIA_COVER_DIR:path.join(directory,'covers'),MEDIA_SNAPSHOT:snapshotPath,VERCEL:''}});
assert.equal(seeded.status,0,seeded.stderr);
const snapshot=JSON.parse(await fs.readFile(snapshotPath,'utf8'));
snapshot.items.find(item=>item.seasonNumber===2).seasonTitle='The Next Chapter';
snapshot.items.find(item=>item.mediaType==='documentary').originalTitle='Ocean Documentary: An Extremely Long Title Across Several Lines 海洋纪录片';
const port=await freeLocalPort(),server=await createServer({configFile:path.resolve('vite.trackers.config.ts'),server:{host:'127.0.0.1',port,strictPort:true}});
let browser;
try{
 await server.listen();console.log(JSON.stringify({pid:process.pid,port}));
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});
 context.setDefaultTimeout(12000);
 await context.addInitScript(({snapshot,account})=>{
  localStorage.setItem('evaorbit.uiLanguage',sessionStorage.getItem('media-layout-language')||'en');
  window.EvaOrbitNative={version:1,call:async(method)=>{
   let result;
   if(method==='host.getInfo')result={platform:'ios',methods:['media.readOnlySnapshot']};
   else if(method==='trackers.getSession')result={accountId:account,email:'layout@example.invalid'};
   else if(method==='media.readOnlySnapshot')result=snapshot;
   else if(method==='appearance.setPreference')result={};
   else return{ok:false,error:{code:'fixture',message:'Module not downloaded'}};
   return{ok:true,result};
  }};
 },{snapshot,account});
 await context.route('**/eo-api/**',r=>r.fulfill({status:503,json:{error:'Isolated layout review'}}));
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${port}`);await navigateLocal(page,'Media');
 const cards=page.locator('.media-results .media-poster-card');
 await cards.last().waitFor();await page.waitForFunction(()=>document.querySelector('.media-results')?.getAttribute('aria-busy')==='false');
 assert.equal(await cards.count(),4,'One parent card replaces two seasons');
 assert.equal(await page.locator('.media-results a[href="/media/1"]').count(),0);
 assert.match(await page.locator('.media-series-card').innerText(),/2 seasons.*Watching/s);
 assert.equal(await page.locator('.media-secondary-filters').isVisible(),false);
 for(const width of [320,402,874,1280]){
  await page.setViewportSize({width,height:874});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow at ${width}`);
  const columns=await page.locator('.media-poster-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  if(width<=402)assert.equal(columns,2);
  const first=await cards.first().boundingBox();assert(first.y<480,'Content appears in the first viewport');
  await page.screenshot({path:path.join(directory,`collection-${width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:402,height:874});
 await page.locator('.media-filter-panel > summary').click();
 await page.getByRole('combobox',{name:'Filter by status'}).selectOption('watching');
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===1);
 assert.match(await cards.first().innerText(),/Watching/);
 assert.equal(await page.locator('.media-filter-panel summary b').innerText(),'1');
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===4);
 await page.getByRole('checkbox',{name:'Favorites',exact:true}).check();
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===1);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===4);
 await page.getByRole('checkbox',{name:'Rewatched',exact:true}).check();
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===1&&document.querySelector('.media-results .media-poster-card')?.getAttribute('href')==='/media/1');
 assert.match(await cards.first().getAttribute('href'),/\/1$/);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===4);
 await page.getByRole('combobox',{name:'Filter by rating'}).selectOption('mid');
 await page.getByRole('heading',{name:'No matching media',exact:true}).waitFor();
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===4);
 await page.locator('.media-filter-panel > summary').click();
 await page.getByRole('button',{name:'Movies',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===1);
 assert.equal(await page.locator('.media-poster-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.getByRole('searchbox',{name:'Search Media'}).fill('no-such-work');
 await page.getByRole('heading',{name:'No matching media',exact:true}).waitFor();
 await page.getByRole('button',{name:'Clear search',exact:true}).click();
 await page.getByRole('searchbox',{name:'Search Media'}).fill('Next Chapter');
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===1&&document.querySelector('.media-results .media-poster-card')?.getAttribute('href')==='/media/2');
 await page.getByRole('button',{name:'Clear search',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===4);
 await page.locator('a.media-series-card').first().click();
 await page.getByRole('heading',{name:'Works',exact:true}).waitFor();
 assert.equal(await cards.count(),2);
 await page.locator('a.media-poster-card[href="/media/1"]').click();
 await page.locator('.media-detail-page').waitFor();
 assert.equal(await page.locator('.media-viewings li').count(),2);
 for(const width of [320,402,1280]){
  await page.setViewportSize({width,height:874});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(directory,`detail-${width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:402,height:874});
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.locator('.form-sheet-layer[data-state="open"]').waitFor();
 await page.getByLabel('Original title',{exact:false}).fill('A much longer original title to check mobile keyboard focus');
 assert(await page.getByLabel('Original title',{exact:false}).isVisible());
 await page.screenshot({path:path.join(directory,'edit-402.png')});
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Discard and close',exact:true}).click();
 await page.locator('.form-sheet-layer').waitFor({state:'detached'});
 await page.evaluate(()=>{document.documentElement.dataset.mode='dark';});
 await page.screenshot({path:path.join(directory,'detail-dark-402.png'),fullPage:true});
 await page.evaluate(()=>{sessionStorage.setItem('media-layout-language','zh');});
 await page.reload();await navigateLocal(page,'展架');
 await cards.last().waitFor();
 await page.getByRole('heading',{name:'收藏库',exact:true}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(directory,'collection-zh-402.png'),fullPage:true});
 await page.locator('.media-filter-panel > summary').focus();
 await page.keyboard.press('Enter');
 assert(await page.locator('.media-secondary-filters').isVisible());
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,evidence:directory,checks:'320/402/874/1280; series aggregation; exact season search; one card per standalone work; progressive filters; status/favorite/rewatch/type/search/clear; stable grid; series and detail; edit form; no overflow or page errors'}));
}catch(error){
 const page=browser?.contexts()[0]?.pages()[0];
 if(page){await page.screenshot({path:path.join(directory,'failure.png'),fullPage:true});console.log((await page.locator('body').innerText()).slice(-1600));}
 throw error;
}finally{
 await browser?.close();await server.close();
 const {createServer:probeServer}=await import('node:net');
 await new Promise((resolve,reject)=>{const probe=probeServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
 console.log(JSON.stringify({closedPort:port}));
}
