import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PARLOR_PREVIEW_ORIGIN||'http://127.0.0.1:4196';
const output='tmp/parlor-discussion';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const [label,width,height] of [['mobile',402,874],['desktop',1280,900]]){
 const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();page.setDefaultTimeout(18000);
 const errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin)&&!/^(blob:|data:)/.test(r.url()))remote.push(r.url());});
 await context.addInitScript(()=>{if(location.protocol==='http:'){localStorage.setItem('evaorbit.uiLanguage','zh');localStorage.setItem('evaorbit.appearanceMode','light');}});
 const saved=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state')));
 const requests=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('eo-group-requests')||'[]'));
 const send=async text=>{await page.getByRole('textbox',{name:'消息内容',exact:true}).fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();};
 await page.goto(origin+'/?groupFixture=1');await page.getByRole('button',{name:/Parlor ·/}).click();
 await page.getByRole('button',{name:'创建群聊',exact:true}).click();await page.locator('.form-sheet-layer[data-state=open] [data-parlor-group-form]').waitFor();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('群聊名称').fill('圆桌讨论');assert.equal(await dialog.getByLabel('模式',{exact:true}).inputValue(),'parallel');
 await dialog.getByLabel('模式',{exact:true}).selectOption('discussion');await dialog.getByLabel('最多讨论轮数').selectOption('3');
 await dialog.getByRole('checkbox',{name:/Sebastian/}).check();await dialog.getByRole('checkbox',{name:/Ada/}).check();
 await page.screenshot({path:`${output}/${label}-create.png`,fullPage:true,animations:'disabled'});
 await dialog.getByRole('button',{name:'创建群聊',exact:true}).click();await page.getByRole('heading',{name:'圆桌讨论',exact:true}).waitFor();
 await send('如何验证一个新想法？');
 await page.getByText('Ada 提到的前提值得保留；我会补充一步风险验证。',{exact:false}).waitFor();
 await page.screenshot({path:`${output}/${label}-discussion.png`,fullPage:true,animations:'disabled'});
 const req=await requests();assert.deepEqual(req[0].context,req[1].context);assert.deepEqual(req[2].context,req[3].context);
 assert(req[2].context.some(m=>m.content.includes('[Ada]')));assert(req[2].context.some(m=>m.content.includes('[Sebastian]')));
 await page.locator('[data-parlor-discussion][data-discussion-status=completed]').waitFor();
 let state=await saved();assert.equal(state.discussions[0].roundsStarted,3);assert.equal(state.messages.filter(m=>m.role==='assistant').length,6);assert.equal(state.messages.filter(m=>m.role==='user').length,1);
 assert(state.messages.filter(m=>m.role==='assistant').every(m=>m.status==='done'&&m.usage.source==='provider'));assert.equal(new Set(state.messages.filter(m=>m.role==='assistant').map(m=>m.providerId)).size,2);
 // Start a new run, interrupt with a user direction, then pause and regenerate one persona.
 await send('hold：继续检验投入时机');await page.locator('[data-role=assistant][data-status=streaming]').nth(1).waitFor();
 await page.locator('[data-role=assistant][data-status=streaming]').first().getByText('我们先把眼前最重要的一件事挑出来。',{exact:false}).waitFor();
 await send('先只讨论预算，不谈扩张。');await page.getByText('先只讨论预算，不谈扩张。',{exact:true}).waitFor();
 await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state')).discussions[0].roundsStarted===2);
 const intervened=await saved(),active=intervened.discussions[0];assert.equal(active.maxRounds,3);assert.equal(intervened.messages.filter(m=>m.discussionId===active.id&&m.role==='user').length,1);
 assert((await requests()).at(-1).context.some(m=>m.content==='先只讨论预算，不谈扩张。'));
 await page.getByRole('button',{name:'暂停',exact:true}).click();await page.locator('[data-parlor-discussion][data-discussion-status=paused]').waitFor();
 assert.equal(await page.locator('[data-status=streaming][data-role=assistant]').count(),0);
 await page.screenshot({path:`${output}/${label}-paused.png`,fullPage:true,animations:'disabled'});
 const stopped=await saved(),target=stopped.messages.filter(m=>m.discussionId===active.id&&m.role==='assistant').at(-1);
 await page.locator(`[data-message-id="${target.id}"]`).getByRole('button',{name:`重新生成 ${target.personaName}`,exact:true}).click();
 await page.locator('[data-role=assistant][data-status=streaming]').waitFor();await page.getByRole('button',{name:`停止 ${target.personaName}`,exact:true}).click();
 await page.locator('[data-role=assistant][data-status=streaming]').waitFor({state:'detached'});
 const regenerated=await saved();assert(regenerated.messages.some(m=>m.supersedesId===target.id));
 await page.getByRole('button',{name:'继续',exact:true}).click();await page.locator('[data-parlor-discussion][data-discussion-status=running]').waitFor();
 await page.getByRole('button',{name:'结束讨论',exact:true}).click();await page.locator('[data-parlor-discussion][data-discussion-status=ended]').waitFor();
 // The chosen persona alone summarizes; status and usage remain attached to that reply.
 await page.getByRole('button',{name:'总结',exact:true}).click();await page.locator('.form-sheet-layer[data-state=open]').waitFor();await page.getByRole('dialog').getByRole('button',{name:'Ada',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'整理讨论结论',exact:true}).click();
 await page.getByText('讨论结论：先做小规模验证。',{exact:false}).waitFor();await page.locator('[data-parlor-discussion][data-discussion-status=ended]').waitFor();
 state=await saved();const summary=state.messages.filter(m=>m.purpose==='summary');assert.equal(summary.length,1);assert.equal(summary[0].personaName,'Ada');assert.equal(summary[0].status,'done');assert.equal(summary[0].usage.source,'provider');
 await page.screenshot({path:`${output}/${label}-summary.png`,fullPage:true,animations:'disabled'});
 const ids=state.messages.map(m=>m.id);await page.reload();await page.getByRole('button',{name:/Parlor ·/}).click();await page.getByRole('heading',{name:'圆桌讨论',exact:true}).waitFor();assert.deepEqual((await saved()).messages.map(m=>m.id),ids);
 await page.getByRole('button',{name:'Parlor 设置',exact:true}).click();await page.getByRole('button',{name:/Group Chat/}).click();await page.getByRole('button',{name:/圆桌讨论 · 2 · Discussion/}).click();await page.getByRole('heading',{name:'圆桌讨论',exact:true}).waitFor();
 // A failed persona is suspended in following rounds; its peer completes its budget.
 await send('fail-ada');await page.locator('[data-parlor-discussion][data-discussion-status=completed]').waitFor();state=await saved();const failedRun=state.discussions[0],failure=state.messages.filter(m=>m.discussionId===failedRun.id);assert.equal(failure.filter(m=>m.personaName==='Ada').length,1);assert.equal(failure.filter(m=>m.personaName==='Sebastian').length,3);assert.equal(failure.find(m=>m.personaName==='Ada').status,'failed');
 // Stop a single persona without pausing the peer; no automatic role restart.
 await send('hold：独立停止');await page.locator('[data-role=assistant][data-status=streaming]').nth(1).waitFor();await page.getByRole('button',{name:'停止 Sebastian',exact:true}).click();assert.equal(await page.locator('[data-role=assistant][data-status=streaming]').count(),1);await page.getByRole('button',{name:'结束讨论',exact:true}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 console.log(JSON.stringify({viewport:label,passed:true,checks:['default Parallel','bounded rounds','frozen cross-persona snapshots','interjection','pause/continue/end','individual retry/stop','summary persona/usage','reopen','failure isolation','mixed providers']}));await context.close();
}
 const legacy=await browser.newContext(),oldPage=await legacy.newPage();await oldPage.addInitScript(()=>localStorage.setItem('evaorbit.uiLanguage','zh'));
 await oldPage.goto(origin+'/?groupFixture=1&noDiscussion=1');await oldPage.getByRole('button',{name:/Parlor ·/}).click();await oldPage.getByRole('button',{name:'创建群聊',exact:true}).click();await oldPage.locator('.form-sheet-layer[data-state=open]').waitFor();
 assert.equal(await oldPage.getByRole('dialog').getByLabel('模式',{exact:true}).inputValue(),'parallel');assert.equal(await oldPage.getByRole('option',{name:'Discussion',exact:true}).evaluate(el=>el.disabled),true);await legacy.close();console.log(JSON.stringify({oldGroupHost:true,discussionDisabled:true}));
}finally{await browser.close();}
