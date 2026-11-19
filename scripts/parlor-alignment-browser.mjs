import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PARLOR_PREVIEW_ORIGIN||'http://127.0.0.1:4196',output='tmp/parlor-alignment';await fs.mkdir(output,{recursive:true});
const avatar='data:image/png;base64,'+(await fs.readFile('public/images/lucius-portrait.png')).toString('base64');
const account='10000000-0000-4000-8000-000000000001',conversation='70000000-0000-4000-8000-000000000001';
const provider={id:'10000000-0000-4000-8000-000000000003',name:'Mock Provider',baseURL:'https://mock.example.invalid/v1',enabled:true,hasKey:true,models:[{id:'mock-text',name:'Mock text'}],currency:'USD',priceUpdatedAt:''};
const persona={id:'sebastian',name:'Sebastian',chineseName:'塞巴斯蒂安',nickname:'赛巴斯酱',systemPrompt:'Test persona',preferredAddress:'',humor:'subtle',formality:'natural',closeness:'warm'};
const messages=[{id:'user-a',conversationId:conversation,role:'user',content:'帮我把今天的事情理清楚。',status:'done',createdAt:'2026-11-16T12:00:00Z',seq:0,requestCount:0},{id:'assistant-a',conversationId:conversation,role:'assistant',content:'先选出今天最重要的一件事。\n\n给它留出一段不被打扰的时间。\n\n其他事情按轻重缓急逐一安排。',status:'done',createdAt:'2026-11-16T12:00:00Z',requestId:'req-a',seq:1,requestCount:1,personaId:'sebastian',personaName:'Sebastian',personaAvatar:avatar,model:provider.models[0],usage:{inputTokens:31,outputTokens:65,source:'provider'}}];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const [label,width,height] of [['mobile',402,874],['desktop',1280,900]]){
 const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();page.setDefaultTimeout(15000);
 await context.addInitScript(({account,conversation,provider,persona,messages})=>{if(location.protocol!=='http:')return;localStorage.setItem('evaorbit.uiLanguage','zh');localStorage.setItem('evaorbit.appearanceMode','light');localStorage.setItem('eo:eva:last:'+account,conversation);localStorage.setItem('evaorbit.hermes.segmentReplies:'+account,'true');if(!sessionStorage.getItem('eo-eva-synthetic-state'))sessionStorage.setItem('eo-eva-synthetic-state',JSON.stringify({providers:[provider],persona,personas:[persona],groups:[],conversations:[{id:conversation,title:'今天的安排',updatedAt:messages[0].createdAt}],messages}));},{account,conversation,provider,persona,messages});
 await page.goto(origin);await page.getByRole('button',{name:/Parlor ·/}).click();await page.locator('[data-segment]').nth(2).waitFor();await page.evaluate(()=>document.fonts.ready);
 const bounds=async()=>page.locator('[data-message-id]').evaluateAll(els=>els.map(el=>{const bubble=el.querySelector('[data-chat-bubble]'),r=bubble.getBoundingClientRect();return {role:el.getAttribute('data-role'),x:r.x,width:r.width,height:r.height};}));
 if(process.env.PARLOR_ALIGNMENT_BASELINE){await fs.writeFile(`${output}/${label}-baseline.json`,JSON.stringify(await bounds()));await page.screenshot({path:`${output}/${label}-before.png`,animations:'disabled'});await context.close();continue;}
 const baseline=JSON.parse(await fs.readFile(`${output}/${label}-baseline.json`,'utf8')),current=await bounds();
 for(let i=0;i<current.length;i++)for(const key of ['x','width'])assert(Math.abs(current[i][key]-baseline[i][key])<=1,`${label} ${current[i].role} bubble ${key}: ${current[i][key]} != ${baseline[i][key]}`);
 // Avatar placement and metadata are tied to actual bubble rows, never the screen edge.
 for(const placement of ['first','last','all']){
  await page.getByRole('button',{name:'Parlor 设置',exact:true}).click();await page.getByRole('button',{name:'聊天外观',exact:false}).click();await page.getByRole('combobox',{name:'单聊头像位置',exact:true}).selectOption(placement);
  await page.getByRole('button',{name:'返回 Parlor 设置',exact:true}).click();await page.getByRole('button',{name:'返回上一页',exact:true}).click();await page.locator('[data-segment]').nth(2).waitFor();
  const rows=page.locator('[data-parlor-bubble-row]'),avatars=rows.locator('[data-parlor-bubble-avatar]');assert.equal(await avatars.count(),placement==='all'?3:1);
  const checks=await page.locator('[data-role=assistant]').evaluate(el=>{const bubbles=[...el.querySelectorAll('[data-chat-bubble]')],avatar=[...el.querySelectorAll('[data-parlor-bubble-avatar]')],meta=el.querySelector('[aria-label="回答用量详情"]');return {bubbleLeft:bubbles[0].getBoundingClientRect().left,metaLeft:meta.getBoundingClientRect().left,inset:parseFloat(getComputedStyle(bubbles[0]).borderTopLeftRadius)*.6,avatarTop:avatar.map(a=>a.getBoundingClientRect().top),bubbleTop:bubbles.map(b=>b.getBoundingClientRect().top)};});
  assert(Math.abs(checks.bubbleLeft+checks.inset-checks.metaLeft)<=1);assert(checks.avatarTop.every((top,index)=>Math.abs(top-8-checks.bubbleTop[placement==='last'?2:placement==='first'?0:index])<=1));
  await page.screenshot({path:`${output}/${label}-single-${placement}.png`,animations:'disabled'});
 }
 await page.reload();await page.getByRole('button',{name:/Parlor ·/}).click();await page.locator('[data-parlor-bubble-avatar]').nth(2).waitFor();assert.equal(await page.locator('[data-parlor-bubble-avatar]').count(),3);
 assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
 console.log(JSON.stringify({label,bubbleWidthPreserved:true,userWidthPreserved:true,firstLastAll:true,avatarAnchors:true,metadataAligned:true,persisted:true}));await context.close();
}}finally{await browser.close();}
