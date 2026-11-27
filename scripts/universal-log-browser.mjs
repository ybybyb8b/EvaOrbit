import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {freeLocalPort} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve('tmp/universal-log-preview');
await fs.mkdir(root,{recursive:true});
await fs.writeFile(path.join(root,'index.html'),'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/main.tsx"></script>');
await fs.writeFile(path.join(root,'navigation.ts'),'export const useRouter=()=>({refresh(){}});export const usePathname=()=>"/";');
await fs.writeFile(path.join(root,'main.tsx'),`
import React from 'react';import {createRoot} from 'react-dom/client';
import {HomeQuickLog} from '@/app/home-quick-log';import {LocalQuickLog} from '@/local-trackers/quick-log';
import {BottomLogProvider,BottomLogScope} from '@/components/bottom-log-core';
import {BusinessRequestContext} from '@/components/business-request-context';
import {LocaleController} from '@/components/locale-controller';import {ErrorFeedbackProvider} from '@/components/error-feedback';
import '@/app/globals.css';
const account={accountId:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.invalid'};
const state={schemaVersion:1,accountId:account.accountId,revision:0,records:[],outbox:[]};
const people=[{id:1,name:'Test Person',nickname:null,archivedAt:null}];
const platform={readOnly:()=>true,storage:()=>({read:async()=>state}),relationsSnapshot:async()=>({people,details:[]})};
const params=new URLSearchParams(location.search),local=params.has('local'),preview=params.has('preview');
window.saved=0;
createRoot(document.getElementById('root')).render(<LocaleController localOnly defaults={{uiLanguage:'en'}}><ErrorFeedbackProvider><BusinessRequestContext.Provider value={preview?null:fetch}><BottomLogProvider pathname='/'><BottomLogScope selectedDate='2026-10-15' onSaved={async()=>{window.saved++;}}/>{local?<LocalQuickLog account={account} platform={platform}/>:<HomeQuickLog/>}</BottomLogProvider></BusinessRequestContext.Provider></ErrorFeedbackProvider></LocaleController>);
`);
const server=await createServer({configFile:false,root,publicDir:path.resolve('public'),resolve:{alias:{'@':path.resolve('src'),'next/navigation':path.join(root,'navigation.ts')}},define:{'process.env.EVAORBIT_TIME_ZONE':JSON.stringify('Asia/Shanghai')},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:await freeLocalPort(),strictPort:true,fs:{allow:[process.cwd()]}},plugins:[{name:'strip-client',transform(code,id){if(/\.[jt]sx?$/.test(id))return code.replace(/^["']use client["'];?\s*/,'');}}]});
let browser;const errors=[],writes=[];
try{
  await server.listen();const port=server.httpServer.address().port;
  console.log(JSON.stringify({pid:process.pid,previewPort:port,syntheticData:true}));
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const local of [false,true])for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:402,height:874}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,timezoneId:'Asia/Shanghai'});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));let fail=false;
    await page.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(req.method()==='GET')return route.fulfill({json:url.pathname==='/api/relations/people'?[{id:1,name:'Test Person',nickname:null,archivedAt:null}]:[]});
      if(fail)return route.fulfill({status:500,json:{error:'Synthetic save failure'}});
      writes.push({path:url.pathname,body:req.postDataJSON()});return route.fulfill({status:201,json:{id:1}});
    });
    await page.goto(`http://127.0.0.1:${port}/${local?'?local':''}`,{waitUntil:'networkidle'});
    const open=async name=>{await page.getByRole('button',{name:'Quick Log',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();await page.locator('.form-sheet-panel input[type=date]').first().waitFor();assert.equal(await page.locator('.form-sheet-panel input[type=date]').first().inputValue(),'2026-10-15');};
    const save=()=>page.locator('.form-sheet-footer button.primary').click();
    for(const name of ['Task','Memo','Chronicle','Exchange']){
      await open(name);
      assert.equal(await page.locator('input[type=time]').count(),0);
      if(name==='Exchange')await page.getByRole('checkbox',{name:'Test Person',exact:true}).check();
      else {await page.locator('.form-sheet-panel input:not([type])').first().fill('Synthetic '+name);if(name!=='Task')await page.locator('.form-sheet-panel textarea').fill('Synthetic content');}
      if(mobile&&!local&&(name==='Task'||name==='Exchange')){
        await page.locator('.form-sheet-layer[data-state="open"]').waitFor();await page.waitForTimeout(300);
        await page.screenshot({path:`tmp/universal-log-${name.toLowerCase()}-mobile.png`});
      }
      if(name==='Task'){
        fail=true;await save();await page.getByRole('alert').first().waitFor();assert.equal(await page.locator('.form-sheet-panel input:not([type])').first().inputValue(),'Synthetic Task');fail=false;
      }
      await save();await page.waitForFunction(()=>!document.querySelector('.form-sheet-layer'));
    }
    assert.equal(await page.evaluate(()=>window.saved),4);
    const recent=writes.slice(-4);assert.equal(recent[0].body.dueDate,'2026-10-15');assert.equal(recent[0].body.dueTime,null);assert.equal(recent[1].body.eventDate,'2026-10-15');assert.equal(recent[1].body.confirmedAt,null);assert.equal(recent[2].body.date,'2026-10-15');assert.equal(recent[3].body.occurredHasExplicitTime,false);assert.equal(recent[3].body.occurredAt.slice(0,10),'2026-10-15');
    await page.getByRole('button',{name:'Quick Log',exact:true}).click();
    const panel=page.locator('.form-sheet-panel');const rect=await panel.boundingBox();assert(rect.x>=0&&rect.width<=(mobile?402:1280));
    await page.locator('.form-sheet-layer[data-state="open"]').waitFor();await page.waitForTimeout(300);
    await page.screenshot({path:`tmp/universal-log-${local?'local':'web'}-${mobile?'mobile':'desktop'}.png`});
    if(local){await page.goto(`http://127.0.0.1:${port}/?local&preview`,{waitUntil:'networkidle'});await open('Task');assert.equal(await page.locator('.form-sheet-footer button.primary').isDisabled(),true);}
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: Web/local desktop/mobile; four saves, date-only payloads, retry preserves draft, refresh callbacks, preview write guard.');
}finally{await browser?.close();await server.close();}
