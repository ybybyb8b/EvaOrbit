// Isolated production Web fixture. Optional local posters are visual-QA inputs only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const directory=await fs.mkdtemp(path.resolve('tmp/media-exhibit-'));
const env={...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'fixture.db'),EVAORBIT_MEDIA_COVER_DIR:path.join(directory,'covers'),VERCEL:''};
const seed=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',`import {seedMedia} from './scripts/media-readonly-fixture.mjs';import {getRepository} from './src/lib/repositories/index.ts';await seedMedia();const r=await getRepository();await r.updateMediaItem(1,{coverUrl:'/api/media/1/cover?type=jpg'});await r.updateMediaItem(2,{coverUrl:'/api/media/2/cover?type=jpg'});await r.updateMediaItem(3,{originalTitle:'Interstellar',translatedTitle:'星际穿越',mediaType:'movie',status:'completed',rating:'goat',coverUrl:'/api/media/3/cover?type=jpg'});await r.createMediaViewing({mediaId:3,watchedDate:'2026-10-01'});await r.updateMediaItem(4,{originalTitle:'Autumn Sonata',translatedTitle:'秋日奏鸣曲',mediaType:'movie',rating:'dope+',coverUrl:'/api/media/4/cover?type=jpg'});`],{env,encoding:'utf8'});
assert.equal(seed.status,0,seed.stderr);
if(process.env.EVAORBIT_MEDIA_POSTER_DIR){for(const [id,name] of [[1,'interstellar.jpg'],[2,'autumn-sonata.jpg'],[3,'interstellar.jpg'],[4,'autumn-sonata.jpg']])await fs.copyFile(path.join(process.env.EVAORBIT_MEDIA_POSTER_DIR,name),path.join(env.EVAORBIT_MEDIA_COVER_DIR,`${id}.jpg`));}
const port=await new Promise(resolve=>{const p=createServer();p.listen(0,'127.0.0.1',()=>{const port=p.address().port;p.close(()=>resolve(port));});});
let server,browser,exited,log='';
try{
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});exited=new Promise(resolve=>server.once('exit',resolve));server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);console.log(JSON.stringify({pid:server.pid,port}));
 for(let i=0;i<100&&!log.includes('Ready in');i++){if(server.exitCode!==null)throw Error(log);await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true});context.setDefaultTimeout(12000);
 let language='zh',mode='light';
 await context.route('**/api/preferences/appearance',r=>r.fulfill({json:{uiLanguage:language,englishFont:'ibm',colorTheme:'editorial',appearanceMode:mode}}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${port}/media`);await page.locator('.media-exhibit-page').waitFor();
 await page.waitForFunction(()=>document.querySelector('.media-results')?.getAttribute('aria-busy')==='false');
 const cards=page.locator('.media-results .media-poster-card');assert.equal(await cards.count(),4);assert.equal(await page.locator('.media-series-card .media-ticket-back[aria-hidden="true"]').count(),1);
 if(process.env.EVAORBIT_MEDIA_POSTER_DIR)await page.waitForFunction(()=>[...document.querySelectorAll('.media-results img')].every(img=>img.complete&&img.naturalWidth>0));
 assert.equal(await page.getByRole('heading',{name:/^(Collection|收藏库)$/,exact:true}).count(),0);
 const movie=page.locator('.media-poster-card[href="/media/3"]');assert.equal(await movie.locator('time').getAttribute('dateTime'),'2026-10-01');assert.match(await movie.innerText(),/2026\.10\.01/);
 assert.equal(await page.locator('.media-poster-card[href="/media/5"] time').count(),0,'Unknown date stays absent');
 assert.equal(await cards.locator('.media-poster-copy').filter({hasText:/Watching|Planned|Completed|观看中|计划观看|已完成/}).count(),0,'Cards describe keepsakes rather than viewing status');
 for(const width of [320,402,768,1280]){
  await page.setViewportSize({width,height:874});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width<720)assert.equal(await page.locator('.media-poster-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
  await page.screenshot({path:path.join(directory,`collection-${width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:402,height:874});mode='dark';await page.reload();await movie.waitFor();await page.screenshot({path:path.join(directory,'collection-dark-402.png'),fullPage:true});
 mode='light';language='en';await page.reload();await movie.waitFor();await page.getByRole('searchbox',{name:'Search Media'}).fill('Reacher');
 await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===2);assert.equal(await page.locator('a.media-series-card').count(),0);
 await page.getByRole('button',{name:'Clear search',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===4);
 await page.locator('a.media-series-card').click();await page.getByRole('heading',{name:'Works',exact:true}).waitFor();assert.equal(await cards.count(),2);
 await page.locator('a.media-poster-card[href="/media/1"]').click();await page.locator('.media-detail-page').waitFor();
 await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('.form-sheet-layer[data-state="open"]').waitFor();assert(await page.getByLabel('Original title',{exact:false}).isVisible());
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,evidence:directory,checks:'Web keepsake labels; date absence; no status on cards; 320/402/768/1280; dark/zh/en; search exact seasons; series and edit navigation'}));
}catch(error){if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:path.join(directory,'failure.png'),fullPage:true});console.log((await page.locator('body').innerText()).slice(-1200));}}throw error;}
finally{await browser?.close();if(server){server.kill();await exited;}await new Promise((resolve,reject)=>{const p=createServer();p.once('error',reject);p.listen(port,'127.0.0.1',()=>p.close(resolve));});console.log(JSON.stringify({closedPort:port}));}
