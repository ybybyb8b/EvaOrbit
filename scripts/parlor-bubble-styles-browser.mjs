import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PARLOR_PREVIEW_ORIGIN||'http://127.0.0.1:4196',output='tmp/parlor-bubble-styles';await fs.mkdir(output,{recursive:true});
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

 const chat=page.locator('[data-native-eva-chat]');
 assert.equal(await chat.getAttribute('data-bubble-style'),'vintage');
 async function settings(){await page.getByRole('button',{name:'Parlor 设置',exact:true}).click();await page.getByRole('button',{name:'聊天外观',exact:false}).click();}
 async function back(){await page.getByRole('button',{name:'返回 Parlor 设置',exact:true}).click();await page.getByRole('button',{name:'返回上一页',exact:true}).click();await page.locator('[data-chat-bubble]').first().waitFor();}
 await settings();assert.equal(await page.getByRole('combobox',{name:'气泡样式',exact:true}).inputValue(),'vintage');
 await page.getByLabel('聊天背景',{exact:true}).setInputFiles('public/images/lucius-cover-light.png');await page.getByRole('button',{name:'恢复聊天背景',exact:true}).waitFor();await back();await page.locator('[data-parlor-wallpaper]').waitFor();
 await page.screenshot({path:`${output}/${label}-vintage.png`,animations:'disabled'});
 await settings();await page.getByRole('combobox',{name:'气泡样式',exact:true}).selectOption('frosted');await page.screenshot({path:`${output}/${label}-settings.png`,animations:'disabled'});await back();
 assert.equal(await chat.getAttribute('data-bubble-style'),'frosted');
 const avatarAlignment=await page.locator('[data-parlor-bubble-avatar]').evaluate(el=>{const avatar=el.getBoundingClientRect(),bubble=el.parentElement.querySelector('[data-chat-bubble]').getBoundingClientRect();return Math.abs(avatar.top-bubble.top-8);});
 assert(avatarAlignment<=1,'Frosted avatar must align to the first line of its bubble');
 const glass=await page.locator('[data-chat-bubble]').first().evaluate(el=>{const s=getComputedStyle(el);return {filter:s.backdropFilter,background:s.backgroundColor,radius:parseFloat(s.borderTopLeftRadius)};});
 assert(glass.filter.includes('14px'));assert(glass.background.includes('0.7'));assert(glass.radius>=42);
 await page.screenshot({path:`${output}/${label}-frosted-light.png`,animations:'disabled'});
 await page.evaluate(()=>document.documentElement.dataset.mode='dark');await page.screenshot({path:`${output}/${label}-frosted-dark.png`,animations:'disabled'});
 await page.reload();await page.getByRole('button',{name:/Parlor ·/}).click();await page.locator('[data-chat-bubble]').first().waitFor();assert.equal(await chat.getAttribute('data-bubble-style'),'frosted');
 await settings();await page.getByRole('switch',{name:'自动分段气泡',exact:true}).uncheck();await back();
 await page.evaluate(()=>{const s=JSON.parse(sessionStorage.getItem('eo-eva-synthetic-state'));s.messages.find(m=>m.id==='assistant-a').content='这是一段用于检查长内容阅读效果的文字。我们仍然可以清楚地区分重点、步骤和下一步行动。'.repeat(9)+'\n\n```text\n'+('long-code-line-'.repeat(20))+'\n```';sessionStorage.setItem('eo-eva-synthetic-state',JSON.stringify(s));});
 await page.reload();await page.getByRole('button',{name:/Parlor ·/}).click();await page.locator('[data-role=assistant] pre').waitFor();
 assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
 await page.screenshot({path:`${output}/${label}-frosted-long.png`,animations:'disabled'});
 await settings();await page.getByRole('combobox',{name:'气泡样式',exact:true}).selectOption('vintage');await back();assert.equal(await chat.getAttribute('data-bubble-style'),'vintage');
 const restored=await page.locator('[data-role=assistant] [data-chat-bubble]').first().evaluate(el=>({radius:getComputedStyle(el).borderTopLeftRadius,filter:getComputedStyle(el).backdropFilter}));assert.equal(restored.radius,'18px');assert.equal(restored.filter,'none');
 console.log(JSON.stringify({label,originalDefault:true,frosted:true,lightDark:true,persisted:true,wallpaper:true,longContent:true,restoreVintage:true}));await context.close();
}}finally{await browser.close();}
