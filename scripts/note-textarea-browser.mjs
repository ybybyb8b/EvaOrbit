import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {freeLocalPort} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve('tmp/note-textarea-preview');await fs.mkdir(root,{recursive:true});
await fs.writeFile(path.join(root,'index.html'),'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/main.tsx"></script>');
await fs.writeFile(path.join(root,'main.tsx'),`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {NoteTextarea} from '@/components/note-textarea';import {TaskEditor,emptyTaskDraft} from '@/app/tasks/task-editor';
import {TrackerEntryEditor} from '@/app/trackers/tracker-entry-editor';import {Disclosure} from '@/components/disclosure';
import {LocaleController} from '@/components/locale-controller';import '@/app/globals.css';
function Preview(){const [draft,setDraft]=useState(emptyTaskDraft),[note,setNote]=useState(''),[hidden,setHidden]=useState('first\\nsecond\\nthird\\nfourth'),[tracker,setTracker]=useState(false);
return <LocaleController localOnly defaults={{uiLanguage:'en'}}><main style={{maxWidth:600,padding:20,margin:'auto'}}>
<button onClick={()=>setTracker(true)}>Tracker form</button>
<form className='editor-card'><TaskEditor draft={draft} setDraft={setDraft}/></form>
<label className='field'><span>Standalone note</span><NoteTextarea value={note} onChange={e=>setNote(e.target.value)}/></label>
<Disclosure title='Existing note'><label className='field'><span>Prefilled note</span><NoteTextarea value={hidden} onChange={e=>setHidden(e.target.value)}/></label></Disclosure>
<label className='field'><span>Article content</span><textarea rows={10} defaultValue='Long form content'/></label>
{tracker&&<TrackerEntryEditor trackerId={1} fields={[]} onSaved={()=>{}} onClose={()=>setTracker(false)} saveRecord={async()=>{}}/>}
</main></LocaleController>;}createRoot(document.getElementById('root')).render(<Preview/>);
`);
const server=await createServer({configFile:false,root,publicDir:path.resolve('public'),resolve:{alias:{'@':path.resolve('src')}},define:{'process.env.EVAORBIT_TIME_ZONE':JSON.stringify('Asia/Shanghai')},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:await freeLocalPort(),strictPort:true,fs:{allow:[process.cwd()]}},plugins:[{name:'strip-client',transform(code,id){if(/\.[jt]sx?$/.test(id))return code.replace(/^["']use client["'];?\s*/,'');}}]});
let browser;const errors=[];
try{
  await server.listen();const port=server.httpServer.address().port;console.log(JSON.stringify({pid:process.pid,previewPort:port}));
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:402,height:874}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle'});
    assert.deepEqual(errors,[]);
    const note=page.locator('form textarea[data-note-input]'),height=()=>note.evaluate(e=>e.getBoundingClientRect().height);
    const initial=await height();assert(initial>=32&&initial<=52);
    await note.fill('One line');assert(Math.abs(await height()-initial)<2);
    await note.press('End');await note.press('Enter');await note.pressSequentially('Second line');assert(await height()>initial+12);
    await note.fill('Long note\n'.repeat(30));const metrics=await note.evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,max:parseFloat(getComputedStyle(e).maxHeight)}));assert(metrics.scroll>metrics.height);assert(metrics.height<=metrics.max+1);
    await note.fill('');assert(Math.abs(await height()-initial)<2);
    await note.fill('Wrapping text '.repeat(20));assert(await height()>initial+12);await note.fill('');
    await page.getByRole('button',{name:'Existing note',exact:true}).click();
    const prefilled=page.locator('.eo-disclosure-content textarea');await prefilled.waitFor();await page.waitForTimeout(100);assert((await prefilled.boundingBox()).height>initial+40);
    const article=page.locator('textarea:not([data-note-input])');assert.equal(await article.getAttribute('rows'),'10');assert((await article.boundingBox()).height>initial*2);
    await page.getByRole('button',{name:'Tracker form',exact:true}).click();await page.locator('.form-sheet-layer[data-state="open"]').waitFor();
    const tracker=page.locator('#tracker-entry-form [data-note-input]');assert((await tracker.boundingBox()).height<=52);
    await page.waitForTimeout(300);await page.screenshot({path:`tmp/note-default-${mobile?'mobile':'desktop'}.png`});
    await tracker.fill('A saved note\nwith another line');assert((await tracker.boundingBox()).height>initial+12);
    await page.screenshot({path:`tmp/note-expanded-${mobile?'mobile':'desktop'}.png`});
    await page.waitForTimeout(300);await page.screenshot({path:`tmp/compact-note-${mobile?'mobile':'desktop'}.png`});
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile one-line notes, wrapping, Enter, clear, long-text scrolling, hidden prefilled notes, Tracker override, article sizing preserved.');
}finally{await browser?.close();await server.close();}
