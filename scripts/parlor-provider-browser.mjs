const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
import fs from 'node:fs/promises';
const origin=process.env.PARLOR_PREVIEW_ORIGIN||'http://127.0.0.1:4187';
const browser=await chromium.launch({channel:'chrome',headless:true});
await fs.mkdir('tmp/provider-review',{recursive:true});
try{for(const [label,width,height] of [['mobile',402,874],['desktop',1280,900]]){
 const page=await browser.newPage({viewport:{width,height}});
 await page.goto(origin);
 await page.getByRole('button',{name:/Parlor ·/}).click();
 await page.getByRole('button',{name:/Parlor (settings|设置)/}).click();
 await page.getByRole('button',{name:/Providers & Models/}).click();
 await page.getByRole('tab',{name:/API/}).waitFor();
 await page.screenshot({path:`tmp/provider-review/${label}-api.png`,fullPage:true,animations:"disabled"});
 await page.getByRole('tab',{name:/Subscription|订阅登录/}).click();
 await page.screenshot({path:`tmp/provider-review/${label}-subscription.png`,fullPage:true,animations:"disabled"});
 await page.getByRole('button',{name:/Sign in with ChatGPT|使用 ChatGPT 登录/}).click();
 await page.getByRole('button',{name:/Refresh models|刷新模型/}).waitFor();
 await page.getByRole('button',{name:/Use in Parlor|在 Parlor 中使用/}).click();
 await page.getByRole('button',{name:/In use|使用中/}).waitFor();
 await page.locator('.action-toast').waitFor({state:'detached'});
 await page.screenshot({path:`tmp/provider-review/${label}-connected.png`,fullPage:true,animations:"disabled"});
 await page.evaluate(()=>document.documentElement.dataset.mode='dark');
 await page.screenshot({path:`tmp/provider-review/${label}-connected-dark.png`,fullPage:true,animations:"disabled"});
 await page.evaluate(()=>document.documentElement.dataset.mode='light');
 await page.getByRole('button',{name:/All Parlor settings|返回 Parlor 设置/}).click();
 await page.screenshot({path:`tmp/provider-review/${label}-settings.png`,fullPage:true,animations:"disabled"});
 await page.getByRole('button',{name:/Personas/}).click();
 await page.screenshot({path:`tmp/provider-review/${label}-persona.png`,fullPage:true,animations:"disabled"});
 await page.getByRole('button',{name:/All Parlor settings|返回 Parlor 设置/}).click();
 await page.getByRole('button',{name:/Back to previous page|返回上一页/}).click();
 await page.getByRole('textbox',{name:/Message|消息内容/}).fill('Subscription UI regression');
 if(!await page.getByRole('button',{name:/^Send$|^发送$/}).isEnabled())throw new Error('Subscription must enable Send without an API Key');

 console.log(label,await page.locator('body').evaluate(el=>({width:el.scrollWidth,viewport:innerWidth})));await page.close();
}}finally{await browser.close();}
