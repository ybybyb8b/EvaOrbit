import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PARLOR_PREVIEW_ORIGIN||'http://127.0.0.1:4187',output='tmp/parlor-echo';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const [label,width,height] of [['mobile',402,874],['desktop',1280,900]]){
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[],remote=[];
    page.setDefaultTimeout(15000);
    await context.addInitScript(()=>{localStorage.setItem('evaorbit.uiLanguage','zh');localStorage.setItem('evaorbit.appearanceMode','light');});
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('request',r=>{if(!r.url().startsWith(origin)&&!/^(blob:|data:)/.test(r.url()))remote.push(r.url());});
    const capture=async name=>{await page.evaluate(async()=>await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime!==Infinity).map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:`${output}/${label}-${name}.png`,fullPage:true});};
    const open=async()=>{await page.getByRole('button',{name:/Parlor ·/}).click();await page.getByRole('button',{name:'Parlor 设置',exact:true}).click();await page.getByRole('button',{name:'Memory',exact:true}).click();};
    await page.goto(origin+'/?groupFixture=1&memoryFixture=1&echoFixture=1');await open();
    const echo=page.locator('[data-parlor-echo]'),memory=page.locator('[data-parlor-memory]');await echo.getByRole('button',{name:'Echo Shared Memory',exact:true}).click();
    assert.equal(await echo.getByRole('switch',{name:'读取 Echo 共享记忆',exact:true}).isChecked(),false);
    assert.equal(await echo.getByRole('switch',{name:'允许主动分享至 Echo',exact:true}).isChecked(),false);
    await echo.getByRole('switch',{name:'读取 Echo 共享记忆',exact:true}).check();await echo.getByRole('switch',{name:'允许主动分享至 Echo',exact:true}).check();await echo.getByRole('button',{name:'保存 Echo 权限',exact:true}).click();
    await echo.getByRole('button',{name:'分享选定聊天片段',exact:true}).waitFor({state:'visible'});
    await memory.getByRole('button').filter({hasText:'答应在周末'}).click();await memory.getByRole('button',{name:'分享到 Echo',exact:true}).click();
    const form=page.locator('[data-echo-share]');await form.getByRole('button',{name:'查找实体',exact:true}).click();await form.getByLabel('Echo 事实主体',{exact:true}).selectOption({label:'用户 · Echo 测试实体'});await form.getByRole('button',{name:'预览具体提交内容',exact:true}).click();
    await form.getByText('观察或推断；分享不等于确认其为事实。',{exact:true}).waitFor();
    await form.getByText('周末一起整理散步路线，先选安静、有树荫的地方。',{exact:true}).waitFor();
    const before=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state')));assert.equal(before.echoShares[0].status,'preview');assert.equal(before.echoConfig.apiAttempts,2);assert(!before.echoShares[0].candidateId);
    await capture("share-preview");assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await form.getByRole('button',{name:'确认分享这份预览',exact:true}).click();await form.getByText(/已提交 ·/).waitFor();
    await capture("share-submitted");
    await form.getByRole('button',{name:'关闭预览',exact:true}).click();await page.getByRole('button',{name:'返回记忆列表',exact:true}).click();
    await echo.getByRole('button',{name:'刷新本地状态',exact:true}).click();await echo.getByRole('button',{name:'分享记录',exact:true}).click();await echo.getByText('等待 Echo 审核',{exact:true}).waitFor();
    await echo.getByRole('button',{name:'查询 Echo 状态',exact:true}).click();
    await capture("echo-settings");
    await echo.getByRole('button',{name:'分享选定聊天片段',exact:true}).click();
    const chatForm=page.locator('[data-echo-share]');await chatForm.getByLabel('来源会话',{exact:true}).selectOption({label:'周末散步的约定'});await chatForm.getByLabel('来源消息',{exact:true}).selectOption({index:1});
    await chatForm.getByRole('button',{name:'查找实体',exact:true}).click();await chatForm.getByLabel('Echo 事实主体',{exact:true}).selectOption({index:1});await chatForm.getByRole('button',{name:'预览具体提交内容',exact:true}).click();
    await chatForm.getByText('用户直接原话，仍需 Echo 审核。',{exact:true}).waitFor();await chatForm.getByRole('button',{name:'关闭预览',exact:true}).click();
    const result=await page.evaluate(async()=>{
      const accountId='10000000-0000-4000-8000-000000000001',state=JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state'));
      const cross=await window.EvaOrbitNative.call('ai.echoGet',{accountId:'81000000-0000-4000-8000-000000000001',personaId:'sebastian'});
      const peer=await window.EvaOrbitNative.call('ai.echoGet',{accountId,personaId:'20000000-0000-4000-8000-000000000002'});
      const exported=await window.EvaOrbitNative.call('ai.exportBackup',{accountId});const restored=await window.EvaOrbitNative.call('ai.restoreBackup',{accountId,document:exported.result,confirmReplace:true});
      return {state,cross,peer,exported,restored,after:JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state'))};
    });
    assert.equal(result.cross.ok,false);assert.equal(result.peer.result.shares.length,0);assert.equal(result.state.echoShares.length,2);assert.equal(result.state.echoConfig.apiAttempts,9);assert.equal(result.exported.result.version,4);assert.equal(result.restored.ok,true);assert.equal(result.after.echoConfig.readEnabled,false);assert.equal(result.after.echoConfig.writeEnabled,false);assert.equal(result.after.echoShares[0].candidateId,result.state.echoShares[0].candidateId);assert.equal(JSON.parse(result.state.echoShares[0].payloadJSON).submission.reviewMode,'manual');
    await page.evaluate(()=>{const key='eo-eva-synthetic-state',s=JSON.parse(sessionStorage.getItem(key)),now=new Date().toISOString();s.echoConfig={...s.echoConfig,readEnabled:true,lastRecallAt:now,lastStatus:'partial'};s.echoSnapshots=[{id:crypto.randomUUID(),accountId:s.echoConfig.accountId,query:'安静 步道',fetchedAt:now,expiresAt:new Date(Date.now()+600000).toISOString(),status:'partial',complete:false,truncated:true,contextJSON:JSON.stringify({coverage:{complete:false,truncated:true,reasons:['character_budget'],matched_count:8,returned_count:2}})}];sessionStorage.setItem(key,JSON.stringify(s));});
    await page.reload();await open();await echo.getByRole('button',{name:'Echo Shared Memory',exact:true}).click();await echo.getByText(/召回覆盖 · 2\/8 · 不完整 · 已截断/).waitFor();await echo.getByText(/缓存 · 有效/).waitFor();await capture("recall-status");
    await echo.getByRole('switch',{name:'读取 Echo 共享记忆',exact:true}).uncheck();await echo.getByRole('button',{name:'保存 Echo 权限',exact:true}).click();await echo.getByText(/缓存 · 无可用缓存/).waitFor();
    const disabled=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state')));assert(!disabled.echoSnapshots[0].contextJSON);assert.equal(disabled.echoConfig.apiAttempts,9);assert.equal(disabled.memories.filter(m=>m.status==='active').length,1);
    assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);await context.close();console.log(`${label}: default-off, memory/chat source previews, epistemic labels, explicit confirmation, pending receipt, query, isolation, v4 backup, partial/truncated cache UI and disable cleanup; 9 synthetic API attempts; 0 real Echo / inference`);
  }
  const context=await browser.newContext(),page=await context.newPage();await context.addInitScript(()=>localStorage.setItem('evaorbit.uiLanguage','zh'));await page.goto(origin+'/?groupFixture=1&memoryFixture=1');await page.getByRole('button',{name:/Parlor ·/}).click();await page.getByRole('button',{name:'Parlor 设置',exact:true}).click();await page.getByRole('button',{name:'Memory',exact:true}).click();assert.equal(await page.locator('[data-parlor-echo]').count(),0);await page.getByText('更新 Host 后可连接 Echo，本地记忆继续独立运行。',{exact:true}).waitFor();await context.close();console.log('Old Host: optional Echo capability gracefully unavailable; local memory UI retained.');
}finally{await browser.close();}
