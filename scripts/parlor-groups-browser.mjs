import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PARLOR_PREVIEW_ORIGIN||'http://127.0.0.1:4196';
const browser=await chromium.launch({channel:'chrome',headless:true});
const output=process.env.PARLOR_GROUPS_OUTPUT||'tmp/parlor-groups';await fs.mkdir(output,{recursive:true});
try{for(const [label,width,height] of [['mobile',402,874],['desktop',1280,900]]){
 const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin)&&!/^(blob:|data:)/.test(r.url()))remote.push(r.url());});
 await context.addInitScript(({bubbleStyle})=>{if(location.protocol==='http:'){localStorage.setItem('evaorbit.uiLanguage','zh');localStorage.setItem('evaorbit.appearanceMode','light');if(bubbleStyle)localStorage.setItem('evaorbit.parlor.bubbleStyle:10000000-0000-4000-8000-000000000001',bubbleStyle);}},{bubbleStyle:process.env.PARLOR_BUBBLE_STYLE});
 await page.goto(origin+'/?groupFixture=1');await page.getByRole('button',{name:/Parlor ·/}).click();
 await page.getByRole('button',{name:'创建群聊',exact:true}).click();
 await page.locator('.form-sheet-layer[data-state=open] [data-parlor-group-form]').waitFor();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('群聊名称').fill('周末会客厅');
 await dialog.getByRole('checkbox',{name:/Sebastian/}).check();await dialog.getByRole('checkbox',{name:/Ada/}).check();
 await page.screenshot({path:`${output}/${label}-create.png`,fullPage:true,animations:'disabled'});
 await dialog.getByRole('button',{name:'创建群聊',exact:true}).click();await page.getByRole('heading',{name:'周末会客厅',exact:true}).waitFor();
 await page.getByRole('textbox',{name:'消息内容',exact:true}).fill('帮我规划一个从今天就能开始的周末计划。');await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.locator('[data-role=assistant][data-status=streaming]').nth(1).waitFor();
 await page.getByText('我们先把眼前最重要的一件事挑出来。',{exact:false}).waitFor();await page.getByText('我会先检验这个想法的前提。',{exact:false}).waitFor();
 assert.equal(await page.locator('[data-role=assistant][data-status=streaming]').count(),2);
 assert.equal(await page.locator('[data-bubble-tail]').count(),0);
 const leading=await page.locator('[data-chat-bubble] p').evaluateAll(nodes=>nodes.map(node=>{
  const style=getComputedStyle(node);return parseFloat(style.lineHeight)/parseFloat(style.fontSize);
 }));
 assert(leading.length>=3&&leading.every(value=>Math.abs(value-1.425)<.015),'group and single use the same body line height');
 const alignment=await page.locator('[data-role=assistant]').evaluateAll(els=>els.map(el=>{
  const bubble=el.querySelector('[data-chat-bubble]'),content=bubble.getBoundingClientRect(),header=el.querySelector('[data-parlor-message-header] > header').getBoundingClientRect(),info=el.querySelector('[data-parlor-response-actions]').getBoundingClientRect();
  return {text:content.left+parseFloat(getComputedStyle(el.querySelector('[data-parlor-message-info]')).paddingInlineStart),header:header.left,info:info.left};
 }));
 for(const item of alignment){assert(Math.abs(item.text-item.header)<=1);assert(Math.abs(item.text-item.info)<=1);}

 assert.equal(await page.locator('[data-parlor-response-actions]').first().getByText('正在生成',{exact:true}).count(),1);
 assert.equal((await page.getByRole('button',{name:'停止 Sebastian',exact:true}).textContent()).trim(),'');
 assert.equal(await page.getByRole('button',{name:'停止 Sebastian',exact:true}).locator('svg').count(),1);
 const stopGeometry=await page.getByRole('button',{name:'停止 Sebastian',exact:true}).evaluate(el=>({hit:el.getBoundingClientRect().width,circle:parseFloat(getComputedStyle(el,'::before').width),icon:el.querySelector('svg').getBoundingClientRect().width}));
 assert.deepEqual(stopGeometry,{hit:44,circle:16,icon:14});
 await page.screenshot({path:`${output}/${label}-parallel.png`,fullPage:true,animations:'disabled'});
 const first=await page.locator('[data-role=assistant]').first().getAttribute('data-message-id');
 await page.getByRole('button',{name:'停止 Sebastian',exact:true}).click();await page.locator(`[data-message-id="${first}"][data-status=cancelled]`).waitFor();
 assert.equal(await page.locator('[data-role=assistant][data-status=streaming]').count(),1);
 const terminalRow=page.locator(`[data-message-id="${first}"] [data-parlor-response-actions]`);
 assert.equal(await terminalRow.getByRole('button',{name:'回答用量详情',exact:true}).count(),1);
 assert.equal(await terminalRow.getByRole('button',{name:'重新生成 Sebastian',exact:true}).count(),1);
 await page.screenshot({path:`${output}/${label}-stop-one.png`,fullPage:true,animations:'disabled'});
 assert.equal((await page.getByRole('button',{name:'重新生成 Sebastian',exact:true}).textContent()).trim(),'');
 assert.equal(await page.getByRole('button',{name:'重新生成 Sebastian',exact:true}).locator('svg').count(),1);
 await page.getByRole('button',{name:'重新生成 Sebastian',exact:true}).click();await page.locator('[data-role=assistant]').nth(2).waitFor();
 await page.locator('[data-role=assistant]').nth(2).getByText('我们先把眼前最重要的一件事挑出来。',{exact:false}).waitFor();
 await page.screenshot({path:`${output}/${label}-regenerate.png`,fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'停止全部',exact:true}).click();await page.locator('[data-role=assistant][data-status=streaming]').waitFor({state:'detached'});
 const before=await page.locator('[data-message-id]').allTextContents();
 await page.reload();await page.getByRole('button',{name:/Parlor ·/}).click();await page.getByRole('heading',{name:'周末会客厅',exact:true}).waitFor();
 assert.deepEqual(await page.locator('[data-message-id]').allTextContents(),before);
 await page.getByRole('textbox',{name:'消息内容',exact:true}).fill('请从执行顺序和风险两个角度给出建议。');await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.locator('[data-role=assistant][data-status=done]').nth(1).waitFor();
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state'))),rounds=Object.values(saved.rounds),replies=saved.messages.filter(m=>m.roundId===rounds.at(-1).id&&m.role==='assistant');
 assert.equal(replies.length,2);assert.deepEqual(replies.map(m=>m.usage.inputTokens),[31,32]);assert.notEqual(replies[0].providerId,replies[1].providerId);
 const requests=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('eo-group-requests')));
 assert.deepEqual(requests[0].context,requests[1].context);assert.deepEqual(requests[0].context,requests[2].context,'regeneration retains the original round context');
 await page.getByRole('textbox',{name:'消息内容',exact:true}).fill('fail-ada');await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.locator('[data-role=assistant][data-status=failed]').waitFor();await page.locator('[data-role=assistant][data-status=done]').nth(2).waitFor();
 // Create a third real UI persona, then add it through the existing member editor.
 await page.getByRole('button',{name:'Parlor 设置',exact:true}).click();await page.getByRole('button',{name:/Personas/}).click();
 await page.getByRole('button',{name:'添加人格',exact:true}).click();await page.getByLabel('名称',{exact:true}).fill('Morgan');
 await page.getByRole('button',{name:'身份与系统提示词',exact:true}).click();await page.getByLabel('人格提示词',{exact:true}).fill('You are Morgan, an independent practical collaborator.');
 await page.getByRole('combobox',{name:'默认模型',exact:true}).selectOption(JSON.stringify(['10000000-0000-4000-8000-000000000003','mock-text']));
 await page.getByRole('button',{name:'保存人格',exact:true}).click();await page.getByText('人格已保存到本机',{exact:true}).waitFor();
 await page.getByRole('button',{name:'返回 Parlor 设置',exact:true}).click();await page.getByRole('button',{name:'返回上一页',exact:true}).click();
 await page.getByRole('button',{name:'群聊成员',exact:true}).click();await page.locator('.form-sheet-layer[data-state=open] [data-parlor-group-form]').waitFor();await page.getByRole('checkbox',{name:/Morgan/}).check();await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('textbox',{name:'消息内容',exact:true}).fill('请分别提出一个具体行动。');await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.getByRole('button',{name:'停止 Morgan',exact:true}).waitFor();
 await page.screenshot({path:`${output}/${label}-three-personas.png`,fullPage:true,animations:'disabled'});
 await page.locator('[data-role=assistant][data-status=done]').nth(5).waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 const bounds=await page.locator('body').evaluate(el=>({width:el.scrollWidth,viewport:innerWidth}));assert(bounds.width<=bounds.viewport);
 console.log(JSON.stringify({label,parallel:true,mixedProviders:true,isolatedStop:true,regeneration:true,frozenContext:true,history:true,usage:true,failureIsolation:true,threePersonas:true,personaCreation:true,bounds}));await context.close();
}}finally{await browser.close();}
