import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PARLOR_PREVIEW_ORIGIN||'http://127.0.0.1:4187',output='tmp/parlor-processing';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const [label,width,height] of [['mobile',402,874],['desktop',1280,900]]){
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[],remote=[];
    await context.addInitScript(()=>{localStorage.setItem('evaorbit.uiLanguage','zh');localStorage.setItem('evaorbit.appearanceMode','light');});
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('request',r=>{if(!r.url().startsWith(origin)&&!/^(blob:|data:)/.test(r.url()))remote.push(r.url());});
    await page.goto(origin+'/?groupFixture=1&memoryFixture=1');await page.getByRole('button',{name:/Parlor ·/}).click();await page.getByRole('button',{name:'Parlor 设置',exact:true}).click();await page.getByRole('button',{name:'Memory',exact:true}).click();
    const surface=page.locator('[data-memory-processing]');await surface.getByRole('button',{name:'自动记忆与整理',exact:true}).click();
    assert.equal(await surface.getByLabel('自动记忆',{exact:true}).isChecked(),false);
    await surface.getByLabel('记忆模型',{exact:true}).selectOption('dedicated');
    await surface.getByLabel('Memory Provider / Model',{exact:true}).selectOption({label:'Mock Provider · Mock text'});
    await surface.getByLabel('未整理消息阈值',{exact:true}).fill('20');await surface.getByLabel('离开会话后整理',{exact:true}).check();
    await surface.getByRole('button',{name:'保存整理设置',exact:true}).click();await page.getByText('已保存记忆整理设置',{exact:true}).waitFor();
    await surface.getByLabel('整理会话',{exact:true}).selectOption({label:'周末散步的约定'});
    await surface.getByRole('button',{name:'整理未处理消息',exact:true}).click();
    await surface.getByRole('heading',{name:'待审核提案 · 1',exact:true}).waitFor();
    await surface.getByRole('button',{name:'整理历史与用量',exact:true}).click();
    await surface.getByText('API Key · 消息 1 · 请求 1',{exact:true}).waitFor();
    await page.getByText('已保存记忆整理设置',{exact:true}).waitFor({state:'hidden'});
    await page.screenshot({path:`${output}/${label}-processing.png`,fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await surface.getByLabel('提案正文',{exact:true}).fill('已确认：用户偏好安静的周末步行路线。');await surface.getByRole('button',{name:'接受记忆',exact:true}).click();
    await surface.getByRole('heading',{name:'待审核提案 · 0',exact:true}).waitFor();
    const memory=page.locator('[data-parlor-memory]');await memory.getByRole('button').filter({hasText:'已确认：用户偏好安静的周末步行路线。'}).waitFor();
    const result=await page.evaluate(async()=>{
      const accountId='10000000-0000-4000-8000-000000000001',before=JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state'));
      const cross=await window.EvaOrbitNative.call('ai.memoryProcessingGet',{accountId:'40000000-0000-4000-8000-000000000001',personaId:'sebastian'});
      const backup=await window.EvaOrbitNative.call('ai.exportBackup',{accountId});
      const restored=await window.EvaOrbitNative.call('ai.restoreBackup',{accountId,document:backup.result,confirmReplace:true});
      return {before,cross,backup,restored,after:JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state'))};
    });
    assert.equal(result.cross.ok,false);assert.equal(result.backup.result.version,4);assert.equal(result.restored.ok,true);assert.equal(result.after.processingJobs.length,1);assert.equal(result.after.processingProposals[0].status,'accepted');assert.equal(result.before.processingJobs[0].attempts[0].usage.inputTokens,95);assert.equal(result.before.processingJobs[0].attempts[0].usage.outputTokens,67);assert.equal(result.after.processingConfigs[0].automatic,false);
    assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);await context.close();console.log(`${label}: default-off, dedicated model, threshold/end controls, manual proposal edit/accept, usage and v4 backup; 1 synthetic dispatch, 95/67 synthetic tokens, 0 real inference`);
  }
  const context=await browser.newContext(),page=await context.newPage();await context.addInitScript(()=>localStorage.setItem('evaorbit.uiLanguage','zh'));await page.goto(origin+'/?noProcessing=1');await page.getByRole('button',{name:/Parlor ·/}).click();await page.getByRole('button',{name:'Parlor 设置',exact:true}).click();await page.getByRole('button',{name:'Memory',exact:true}).click();assert.equal(await page.locator('[data-memory-processing]').count(),0);await context.close();
}finally{await browser.close();}
