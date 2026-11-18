import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PARLOR_PREVIEW_ORIGIN||'http://127.0.0.1:4196',output='tmp/parlor-model-switch';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const [label,width,height] of [['mobile',402,874],['desktop',1280,900]]){
 const ctx=await browser.newContext({viewport:{width,height}}),page=await ctx.newPage();page.setDefaultTimeout(18000);
 const errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin)&&!/^(data:|blob:)/.test(r.url()))remote.push(r.url());});
 await ctx.addInitScript(()=>{if(location.protocol==='http:'){localStorage.setItem('evaorbit.uiLanguage','zh');localStorage.setItem('evaorbit.appearanceMode','light');}});
 const state=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state')));
 const send=async text=>{await page.getByRole('textbox',{name:'消息内容',exact:true}).fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();};
 const sheet=()=>page.getByRole('dialog');
 const waitSheet=()=>page.locator('.form-sheet-layer[data-state=open]').waitFor();
 const model=()=>page.getByRole('button',{name:'切换会话模型',exact:true});
 const choose=async name=>{await sheet().getByRole('button',{name,exact:true}).click();};
 const modelButton=async()=>{await model().click();await waitSheet();};
 const groupModels=async persona=>{await page.getByRole('button',{name:'模型',exact:true}).click();await waitSheet();await sheet().getByRole('button',{name:new RegExp(persona)}).click();};
 await page.goto(origin+'/?groupFixture=1&modelFixture=1');await page.getByRole('button',{name:/Parlor ·/}).click();await model().getByText('Mock text',{exact:true}).waitFor();
 await page.getByRole('button',{name:'切换人格',exact:true}).click();await waitSheet();
 const cards=await page.locator('[data-persona-choices] > button').evaluateAll(els=>els.slice(0,2).map(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom})));assert(cards[1].top-cards[0].bottom>=11.5);
 await page.screenshot({path:`${output}/${label}-personas.png`,animations:'disabled',fullPage:true});
 await sheet().getByRole('button',{name:/Ada/}).click();await model().getByText('GPT preview',{exact:true}).waitFor();
 await page.getByRole('button',{name:'切换人格',exact:true}).click();await waitSheet();await sheet().getByRole('button',{name:/Sebastian/}).click();
 await modelButton();await choose('ChatGPT (fixture) · GPT preview');await model().getByText('GPT preview',{exact:true}).waitFor();
 let saved=await state(),first=saved.conversationModels[0].conversationId;assert.equal(saved.persona.modelId,'mock-text');assert.equal(saved.conversationModels[0].providerId,'00000000-0000-4000-8000-000000000220');
 await page.reload();await page.getByRole('button',{name:/Parlor ·/}).click();await model().getByText('GPT preview',{exact:true}).waitFor();
 await page.screenshot({path:`${output}/${label}-single.png`,animations:'disabled',fullPage:true});
 await page.getByRole('button',{name:'新对话',exact:true}).click();await model().getByText('Mock text',{exact:true}).waitFor();
 await send('stop single model change');await page.locator('[data-role=assistant]').getByText('先别急着和整张待办清单决斗。',{exact:false}).waitFor();
 await modelButton();await choose('Mock Provider · Mock text');assert.equal(await sheet().getByRole('button',{name:'停止并切换',exact:true}).count(),0);assert.equal((await state()).messages.at(-1).status,'streaming');await choose('Mock Provider · Reasoning Display');await sheet().getByRole('button',{name:'停止并切换',exact:true}).click();await model().getByText('Reasoning Display',{exact:true}).waitFor();
 saved=await state();const old=saved.messages.find(m=>m.role==='assistant');assert.equal(old.status,'cancelled');assert.equal(old.model.id,'mock-text');assert(old.content.length>0);assert.equal(saved.persona.modelId,'mock-text');
 assert.equal(saved.conversationModels.find(c=>c.conversationId===first).modelId,'gpt-preview');
 await send('Explain the next step');await page.locator('[data-role=assistant][data-status=done]').waitFor();saved=await state();assert.equal(saved.messages.at(-1).model.id,'mock-alt');
 // Group changes are per participant, preserving defaults, history and original retry snapshots.
 await page.getByRole('button',{name:'创建群聊',exact:true}).click();await waitSheet();await sheet().getByLabel('群聊名称').fill('模型试映室');await sheet().getByRole('checkbox',{name:/Sebastian/}).check();await sheet().getByRole('checkbox',{name:/Ada/}).check();await sheet().getByRole('button',{name:'创建群聊',exact:true}).click();await page.getByRole('heading',{name:'模型试映室',exact:true}).waitFor();
 await groupModels('Sebastian');await choose('Mock Provider · Reasoning Display');await page.getByRole('dialog').waitFor({state:'detached'});
 await send('hold parallel model change');await page.locator('[data-role=assistant][data-status=streaming]').nth(1).waitFor();await page.getByText('我会先检验这个想法的前提。',{exact:false}).waitFor();
 saved=await state();const ada=saved.messages.find(m=>m.personaName==='Ada');await groupModels('Ada');await choose('Mock Provider · Mock text');await sheet().getByRole('button',{name:'停止并切换',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(await page.locator('[data-role=assistant][data-status=streaming]').count(),1);saved=await state();assert.equal(saved.messages.find(m=>m.id===ada.id).status,'cancelled');assert.equal(saved.groups[0].participants.find(p=>p.name==='Ada').modelId,'gpt-preview');
 await page.getByRole('button',{name:'停止全部',exact:true}).click();await page.locator('[data-role=assistant][data-status=streaming]').waitFor({state:'detached'});
 await page.locator(`[data-message-id="${ada.id}"]`).getByRole('button',{name:'重新生成 Ada',exact:true}).click();await page.locator('[data-role=assistant][data-status=streaming]').waitFor();saved=await state();assert.equal(saved.messages.at(-1).model.id,'gpt-preview');await page.getByRole('button',{name:'停止 Ada',exact:true}).click();await page.locator('[data-role=assistant][data-status=streaming]').waitFor({state:'detached'});
 await page.getByRole('button',{name:'模型',exact:true}).click();await waitSheet();await page.screenshot({path:`${output}/${label}-group-models.png`,animations:'disabled',fullPage:true});await sheet().getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 // A discussion pauses before replacing its next-round configuration; its budget stays intact.
 await page.getByRole('button',{name:'群聊成员',exact:true}).click();await waitSheet();await sheet().getByLabel('模式',{exact:true}).selectOption('discussion');await sheet().getByLabel('最多讨论轮数').selectOption('3');await sheet().getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await send('hold discussion switch');await page.locator('[data-role=assistant][data-status=streaming]').nth(1).waitFor();await page.locator('[data-role=assistant][data-status=streaming]').first().getByText('我们先把眼前最重要的一件事挑出来。',{exact:false}).waitFor();
 await groupModels('Sebastian');await choose('ChatGPT (fixture) · GPT preview');await sheet().getByRole('button',{name:'暂停并切换',exact:true}).click();await page.locator('[data-parlor-discussion][data-discussion-status=paused]').waitFor();
 saved=await state();assert.equal(saved.discussions[0].roundsStarted,1);assert.equal(saved.discussions[0].maxRounds,3);assert.equal(await page.locator('[data-role=assistant][data-status=streaming]').count(),0);
 await page.getByRole('button',{name:'继续',exact:true}).click();await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state')).discussions[0].roundsStarted===2);saved=await state();const round2=saved.messages.filter(m=>m.discussionRound===2);assert.equal(round2.find(m=>m.personaName==='Sebastian').model.id,'gpt-preview');assert.equal(round2.find(m=>m.personaName==='Ada').model.id,'mock-text');
 await page.getByRole('button',{name:'结束讨论',exact:true}).click();await page.locator('[data-parlor-discussion][data-discussion-status=ended]').waitFor();
 await page.getByRole('button',{name:'模型',exact:true}).click();await waitSheet();await sheet().getByRole('button',{name:/Sebastian/}).click();await page.screenshot({path:`${output}/${label}-picker.png`,animations:'disabled',fullPage:true});await sheet().getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 saved=await state();const ids=saved.messages.map(m=>m.id),choices=saved.conversationModels;await page.reload();await page.getByRole('button',{name:/Parlor ·/}).click();await page.getByRole('heading',{name:'模型试映室',exact:true}).waitFor();assert.deepEqual((await state()).messages.map(m=>m.id),ids);assert.deepEqual((await state()).conversationModels,choices);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);console.log(JSON.stringify({viewport:label,personaSpacing:true,displayName:true,persistedOverride:true,defaultsUnchanged:true,parallelPeerContinues:true,originalRetrySnapshot:true,discussionPauseAndBudget:true,history:true}));await ctx.close();
}
 const old=await browser.newContext(),page=await old.newPage();await old.addInitScript(()=>localStorage.setItem('evaorbit.uiLanguage','zh'));await page.goto(origin+'/?groupFixture=1&noModelSwitch=1');await page.getByRole('button',{name:/Parlor ·/}).click();const button=page.getByRole('button',{name:'切换会话模型',exact:true});await button.waitFor();assert.equal(await button.isDisabled(),true);assert.equal(await button.textContent(),'Mock text');await old.close();console.log(JSON.stringify({oldHostFallback:true}));
}finally{await browser.close();}
