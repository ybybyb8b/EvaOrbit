// Isolated production Web fixture. Optional local posters are visual-QA inputs only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
const seasonCount=process.env.EVAORBIT_MEDIA_THREE_TICKETS?3:2;
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const directory=await fs.mkdtemp(path.resolve('tmp/media-exhibit-'));
const env={...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'fixture.db'),EVAORBIT_MEDIA_COVER_DIR:path.join(directory,'covers'),VERCEL:''};
const seed=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',`import {seedMedia} from './scripts/media-readonly-fixture.mjs';import {getRepository} from './src/lib/repositories/index.ts';await seedMedia();const r=await getRepository();if(process.env.EVAORBIT_MEDIA_THREE_TICKETS){const {createMedia}=await import('./src/lib/services/media.ts');const {parseNewMedia}=await import('./src/lib/validation.ts');await createMedia(parseNewMedia({mediaType:'tv',status:'completed',watchedDate:'2026-10-20',seriesId:1,seasonNumber:3}));}await r.updateMediaItem(1,{coverUrl:'/api/media/1/cover?type=jpg'});await r.updateMediaItem(2,{coverUrl:'/api/media/2/cover?type=jpg'});await r.updateMediaItem(3,{originalTitle:'Interstellar',translatedTitle:'星际穿越',mediaType:'movie',status:'completed',rating:'goat',coverUrl:'/api/media/3/cover?type=jpg'});await r.createMediaViewing({mediaId:3,watchedDate:'2026-10-01'});await r.updateMediaItem(4,{originalTitle:'Autumn Sonata',translatedTitle:'秋日奏鸣曲',mediaType:'movie',rating:'dope+',coverUrl:'/api/media/4/cover?type=jpg'});`],{env,encoding:'utf8'});
assert.equal(seed.status,0,seed.stderr);
if(process.env.EVAORBIT_MEDIA_POSTER_DIR){for(const [id,name] of [[1,'interstellar.jpg'],[2,'autumn-sonata.jpg'],[3,'interstellar.jpg'],[4,'autumn-sonata.jpg']])await fs.copyFile(path.join(process.env.EVAORBIT_MEDIA_POSTER_DIR,name),path.join(env.EVAORBIT_MEDIA_COVER_DIR,`${id}.jpg`));}
const port=await new Promise(resolve=>{const p=createServer();p.listen(0,'127.0.0.1',()=>{const port=p.address().port;p.close(()=>resolve(port));});});
let server,browser,exited,log='';
try{
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});exited=new Promise(resolve=>server.once('exit',resolve));server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);console.log(JSON.stringify({pid:server.pid,port}));
 for(let i=0;i<100&&!log.includes('Ready in');i++){if(server.exitCode!==null)throw Error(log);await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:402,height:874},deviceScaleFactor:2,isMobile:true,hasTouch:true});context.setDefaultTimeout(12000);
 let language='zh',mode='light';
 await context.route('**/api/preferences/appearance',r=>r.fulfill({json:{uiLanguage:language,englishFont:'ibm',colorTheme:'editorial',appearanceMode:mode}}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${port}/media`);await page.locator('.media-exhibit-page').waitFor();
 await page.waitForFunction(()=>document.querySelector('.media-results')?.getAttribute('aria-busy')==='false');
 const cards=page.locator('.media-results .media-poster-card');assert.equal(await cards.count(),4);assert.equal(await page.locator('.media-series-card .media-ticket-back[aria-hidden="true"]').count(),seasonCount-1);assert.equal(await page.locator('.media-series-card .media-ticket-clip:not(.media-ticket-clip-back)[aria-hidden="true"]').count(),1);assert.equal(await page.locator('.media-series-card .media-label-set').count(),0);assert.equal(await page.locator('.media-ticket-clip-back').evaluate(el=>getComputedStyle(el).zIndex),'-1');
 if(process.env.EVAORBIT_MEDIA_POSTER_DIR)await page.waitForFunction(()=>[...document.querySelectorAll('.media-results img')].every(img=>img.complete&&img.naturalWidth>0));
 assert.equal(await page.getByRole('heading',{name:/^(Collection|收藏库)$/,exact:true}).count(),0);
 const movie=page.locator('.media-poster-card[href="/media/3"]');assert.equal(await movie.locator('time').getAttribute('dateTime'),'2026-10-01');assert.match(await movie.innerText(),/2026\.10\.01/);
 assert.equal(await page.locator('.media-poster-card[href="/media/5"] time').count(),0,'Unknown date stays absent');
 assert.equal(await cards.locator('.media-poster-copy').filter({hasText:/Watching|Planned|Completed|观看中|计划观看|已完成/}).count(),0,'Cards describe keepsakes rather than viewing status');
 for(const width of [320,402,600,768,1280]){
  await page.setViewportSize({width,height:874});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const front=await page.locator('.media-ticket-front').boundingBox(),single=await movie.boundingBox();assert(front&&single&&Math.abs(front.width-single.width)<1,'Set front and standalone tickets have equal widths');assert(Math.abs(front.height-single.height)<1,'Set front and standalone tickets have equal heights');
  if(width<720)assert.equal(await page.locator('.media-poster-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
  if(width<720){const separation=await page.locator('.media-poster-grid').evaluate(grid=>{const card=grid.querySelector('.media-series-card'),clone=card.cloneNode(true);grid.prepend(clone);const bounds=el=>{const rects=[el,...el.querySelectorAll('.media-ticket-back')].map(node=>node.getBoundingClientRect());return{left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right))};};const a=bounds(clone),b=bounds(card),gap=b.left-a.right;clone.remove();return{gap,left:a.left,right:b.right,viewport:innerWidth};});assert(separation.gap>=6,`Adjacent sets need room: ${JSON.stringify(separation)}`);assert(separation.left>=0&&separation.right<=width,`Fan stays in viewport: ${JSON.stringify(separation)}`);}

  await page.screenshot({path:path.join(directory,`collection-${width}.png`),fullPage:true});if(width===402){await page.locator('.media-series-card').evaluate(el=>el.scrollIntoView({block:'center'}));const box=await page.locator('.media-series-card').boundingBox();assert(box);await page.screenshot({path:path.join(directory,'series-detail.png'),clip:{x:Math.max(0,box.x-16),y:Math.max(0,box.y-16),width:box.width+32,height:box.height+48}});await page.screenshot({path:path.join(directory,'series-clip.png'),clip:{x:Math.max(0,box.x+box.width-84),y:box.y+box.height-92,width:100,height:124}});await page.evaluate(()=>scrollTo(0,0));}
 }
 await page.setViewportSize({width:402,height:874});mode='dark';await page.reload();await movie.waitFor();await page.screenshot({path:path.join(directory,'collection-dark-402.png'),fullPage:true});
 mode='light';language='en';await page.reload();await movie.waitFor();
 const trigger=page.locator('.media-filter-trigger'),popover=page.locator('.media-filter-popover');assert.equal(await page.locator('.media-filter-panel').count(),0);
 const before=await page.locator('.media-results').boundingBox();await trigger.click();await page.waitForFunction(()=>document.querySelector('.media-filter-popover')?.matches(':popover-open'));await page.waitForTimeout(200);
 const after=await page.locator('.media-results').boundingBox();assert.equal(before.y,after.y,'Opening filters keeps page layout still');assert.equal(await trigger.getAttribute('aria-expanded'),'true');
 const panelBounds=await popover.boundingBox(),anchorBounds=await trigger.boundingBox();assert(panelBounds.x>=0&&panelBounds.x+panelBounds.width<=402);assert(Math.abs(panelBounds.y-anchorBounds.y-anchorBounds.height-8)<2,'Popover opens beside its trigger');const connector=await popover.evaluate(el=>{const rect=el.getBoundingClientRect(),tip=getComputedStyle(el,'::before');return{x:rect.left+parseFloat(tip.left)+parseFloat(tip.width)/2,y:rect.top+parseFloat(tip.top)};});assert(Math.abs(connector.x-anchorBounds.x-anchorBounds.width/2)<1,'Connector meets button center');assert(Math.abs(connector.y-anchorBounds.y-anchorBounds.height)<=1,'Connector touches button edge');
 await page.screenshot({path:path.join(directory,'filters-402.png')});await popover.getByLabel('Filter by status').selectOption('completed');await page.waitForFunction(()=>!document.querySelector('.media-poster-card[href="/media/5"]'));
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.media-filter-popover')?.matches(':popover-open'));assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert(await trigger.evaluate(el=>el===document.activeElement),'Escape returns focus to trigger');
 await trigger.click();await popover.getByRole('button',{name:'Reset',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===4);await page.getByRole('heading',{name:'Media',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.media-filter-popover')?.matches(':popover-open'));
 await page.emulateMedia({reducedMotion:'reduce'});await trigger.click();assert.equal(await popover.evaluate(el=>getComputedStyle(el).transform),'none');await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'no-preference'});
await page.getByRole('searchbox',{name:'Search Media'}).fill('Reacher');
 await page.waitForFunction(count=>document.querySelectorAll('.media-results .media-poster-card').length===count,seasonCount);assert.equal(await page.locator('a.media-series-card').count(),0);
 await page.getByRole('button',{name:'Clear search',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.media-results .media-poster-card').length===4);
 await page.locator('a.media-series-card').click();await page.getByRole('heading',{name:'Works',exact:true}).waitFor();assert.equal(await cards.count(),seasonCount);
 await page.locator('a.media-poster-card[href="/media/1"]').click();await page.locator('.media-detail-page').waitFor();
 await page.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('.form-sheet-layer[data-state="open"]').waitFor();assert(await page.getByLabel('Original title',{exact:false}).isVisible());
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,evidence:directory,checks:'Web keepsake labels; date absence; no status on cards; 320/402/768/1280; dark/zh/en; search exact seasons; series and edit navigation'}));
}catch(error){if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:path.join(directory,'failure.png'),fullPage:true});console.log((await page.locator('body').innerText()).slice(-1200));}}throw error;}
finally{await browser?.close();if(server){server.kill();await exited;}await new Promise((resolve,reject)=>{const p=createServer();p.once('error',reject);p.listen(port,'127.0.0.1',()=>p.close(resolve));});console.log(JSON.stringify({closedPort:port}));}
