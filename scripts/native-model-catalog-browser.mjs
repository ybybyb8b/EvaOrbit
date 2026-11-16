// Runs exclusively against the isolated Native fixture, with no real provider requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
await fs.mkdir('tmp/model-catalog',{recursive:true});
try{
 for(const width of [402,1280]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width===402,hasTouch:width===402});
  const errors=[],remote=[];context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!/^(http:\/\/127\.0\.0\.1:4187|blob:|data:)/.test(r.url()))remote.push(r.url());});});
  await context.addInitScript(()=>{if(location.origin==='http://127.0.0.1:4187')localStorage.setItem('evaorbit.uiLanguage','zh');});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  async function settings(url='http://127.0.0.1:4187/'){
   await page.goto(url);await page.getByRole('button',{name:/Parlor ·/}).click();await page.getByRole('button',{name:'Parlor 设置',exact:true}).click();await page.getByRole('button',{name:/Providers & Models/}).click();
  }
  await settings();
  const provider=page.locator('[data-native-eva-settings] > label select');
  await provider.selectOption('new');await page.getByLabel('名称',{exact:true}).fill('Directory test');
  const base=page.getByLabel('API Base URL（HTTPS）',{exact:true}),key=page.getByLabel('API Key',{exact:false});
  await base.fill('https://openrouter.ai/api/v1');await key.fill('fake-catalog-test');
  await page.getByRole('button',{name:'获取模型',exact:true}).click();
  const dialog=page.getByRole('dialog'),search=page.getByRole('searchbox',{name:'搜索模型',exact:true});await search.waitFor();
  assert(await dialog.locator('label').count()<65,'long list renders a bounded batch');
  await page.locator('.form-sheet-layer[data-state="open"]').waitFor();
  await page.waitForFunction(()=>{const panel=document.querySelector('[role="dialog"]');if(!panel)return false;const r=panel.getBoundingClientRect();return r.bottom<=visualViewport.height+visualViewport.offsetTop+2&&Number(getComputedStyle(panel).opacity)>.99;});
  const bounds=await dialog.boundingBox(),viewport=await page.evaluate(()=>({height:visualViewport.height,top:visualViewport.offsetTop}));
  await page.screenshot({path:`tmp/model-catalog/${width}-list.png`});
  assert(bounds.y+bounds.height<=viewport.height+viewport.top+2,`picker must fit viewport: ${JSON.stringify({bounds,viewport})}`);
  await search.fill('alpha pro');await dialog.getByRole('checkbox',{name:'选择 alpha/chat-pro',exact:true}).check();
  await search.press('Enter');assert(await dialog.isVisible(),'search Enter must not accept the selection');
  await search.fill('');await dialog.getByRole('combobox',{name:'模型厂商',exact:true}).selectOption('beta');
  await dialog.getByRole('checkbox',{name:'Token 免费',exact:true}).check();
  await dialog.getByRole('checkbox',{name:'选择 beta/chat-free',exact:true}).check();
  await dialog.getByRole('checkbox',{name:'Token 免费',exact:true}).uncheck();
  await dialog.getByRole('combobox',{name:'模型厂商',exact:true}).selectOption('');
  await search.fill('alpha/unknown');await dialog.getByText('价格未知',{exact:true}).waitFor();
  await search.fill('');await dialog.getByRole('checkbox',{name:'只看已选',exact:true}).check();
  await page.screenshot({path:`tmp/model-catalog/${width}-selected.png`});
  await dialog.getByRole('button',{name:'使用 2 个模型',exact:true}).click();await dialog.waitFor({state:'detached'});
  const ids=page.getByLabel('Model ID',{exact:true});assert.equal(await ids.count(),2);assert.equal(await ids.first().inputValue(),'alpha/chat-pro');
  const pricing=page.getByRole('button',{name:'可选：每百万 Token 价格',exact:true}).first();await pricing.click();
  assert.equal(await page.getByLabel('输入',{exact:true}).first().inputValue(),'2.5');assert.equal(await page.getByLabel('输出',{exact:true}).first().inputValue(),'10');
  await page.getByRole('button',{name:'保存到本机',exact:true}).click();await page.getByText('已保存到本机',{exact:true}).waitFor();
  assert.equal(await key.inputValue(),'');
  assert(!(await page.evaluate(()=>sessionStorage.getItem('eo-eva-synthetic-state'))).includes('fake-catalog-test'));
  await page.getByLabel('输入',{exact:true}).first().fill('7');
  await page.getByRole('button',{name:/^选择模型 \(/}).click();await page.getByRole('dialog').getByRole('button',{name:'使用 2 个模型',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  assert.equal(await page.getByLabel('输入',{exact:true}).first().inputValue(),'7');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('eo-catalog-reads')),'1','reopening/searching never refetches');
  await page.getByLabel('价格币种',{exact:true}).fill('CNY');
  await page.getByRole('button',{name:/^选择模型 \(/}).click();await page.getByRole('dialog').getByRole('button',{name:'使用 2 个模型',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
  assert.equal(await page.getByLabel('输入',{exact:true}).first().inputValue(),'');await page.getByText(/目录报价为 USD，未写入当前 CNY/).waitFor();
  await base.fill('https://slow.example.invalid/v1');await key.fill('fake-catalog-test');await page.getByRole('button',{name:'获取模型',exact:true}).click();
  await page.getByText('正在获取模型清单…',{exact:true}).waitFor();await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByText('正在获取模型清单…',{exact:true}).waitFor({state:'detached'});
  assert.equal(await page.locator('[data-model-catalog]').count(),0);assert.equal(await ids.count(),2);
  await base.fill('https://openrouter.ai/api/v1');await key.fill('bad-catalog-key');await page.getByRole('button',{name:'获取模型',exact:true}).click();
  await page.getByText('Parlor 操作未完成。',{exact:true}).waitFor();assert.equal(await ids.count(),2);assert(!(await page.locator('body').innerText()).includes('bad-catalog-key'));
  await base.fill('https://slow.example.invalid/v1');await key.fill('fake-catalog-test');await page.getByRole('button',{name:'获取模型',exact:true}).click();
  await page.getByRole('button',{name:'返回 Parlor 设置',exact:true}).click();await page.getByRole('heading',{name:'设置',exact:true}).waitFor();assert.equal(await page.locator('[data-model-catalog]').count(),0);
  await settings();await provider.selectOption({label:'Directory test'});assert.equal(await ids.first().inputValue(),'alpha/chat-pro');
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state')).messages.length),0,'directory discovery never starts inference');
  console.log({width,longList:true,search:true,filter:true,pricing:true,currency:true,manualPreserved:true,persistence:true,cancel:true,error:true,remoteRequests:0});await context.close();
 }
 const context=await browser.newContext();await context.addInitScript(()=>{if(location.origin==='http://127.0.0.1:4187')localStorage.setItem('evaorbit.uiLanguage','zh');});const page=await context.newPage();
 await page.goto('http://127.0.0.1:4187/?noCatalog=1');await page.getByRole('button',{name:/Parlor ·/}).click();await page.getByRole('button',{name:'Parlor 设置',exact:true}).click();await page.getByRole('button',{name:/Providers & Models/}).click();
 assert(await page.getByRole('button',{name:'获取模型',exact:true}).isDisabled());await page.getByText('更新本地 Host 后可获取模型；当前仍可手动填写。',{exact:true}).waitFor();await context.close();
}finally{await browser.close();}
