// Real shared components and forms with synthetic data; never reaches a business API.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {createServer as probeServer} from 'node:net';
import {freeLocalPort} from './local-navigation-browser.mjs';
const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const directory=await fs.mkdtemp(path.resolve('tmp/disclosure-qa-'));
const fixture=`import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Disclosure} from '../../src/components/disclosure';
import {FormSheet} from '../../src/components/form-sheet';
import {LocaleController} from '../../src/components/locale-controller';
import {DevelopmentDetails} from '../../src/components/development-details';
import {ExpenseItemsInput} from '../../src/components/expense-items-input';
import {CatRecordEditor} from '../../src/app/cats/cat-record-editor';
import {TrainingPlanEditor} from '../../src/app/health/training-plan-editor';
import {HealthDataProvider} from '../../src/components/health-data-context';
import {CatsDataProvider} from '../../src/components/cats-data-context';
import {trainingTemplate} from '../../src/lib/training-plan';
const read=async()=>Response.json([]);
function App(){const[pane,setPane]=useState(''),[items,setItems]=useState(''),[active,setActive]=useState('a');
return <LocaleController localOnly><HealthDataProvider read={read}><CatsDataProvider read={read}><main className="page" style={{maxWidth:700}}>
<h1>Shared disclosure checks</h1><div className="page-actions"><button className="button secondary" onClick={()=>setPane('general')}>General</button><button className="button secondary" onClick={()=>setPane('cats')}>Cats</button><button className="button secondary" onClick={()=>setPane('plan')}>Plan</button></div>
<DevelopmentDetails><p>Development content stays available.</p></DevelopmentDetails>
{pane==='general'&&<FormSheet title="Disclosure validation" onClose={()=>setPane('')} formId="qa-form" submitLabel="Save"><form id="qa-form" style={{display:'grid',gap:14}} onSubmit={e=>{e.preventDefault();(window as any).__saved=((window as any).__saved||0)+1;}}>
<Disclosure title="History" trailing={0}><p>Empty history.</p></Disclosure>
<Disclosure title="Outer"><Disclosure title="Inner"><label className="field"><span>Required detail</span><input required aria-label="Required detail"/></label></Disclosure></Disclosure>
<Disclosure title="Accordion A" open={active==='a'} onOpenChange={open=>setActive(open?'a':'')}><label className="field"><span>A draft</span><input aria-label="A draft"/></label></Disclosure><Disclosure title="Accordion B" open={active==='b'} onOpenChange={open=>setActive(open?'b':'')}><p>Second panel.</p></Disclosure>
<ExpenseItemsInput value={items} onValueChange={setItems}/></form></FormSheet>}
{pane==='cats'&&<FormSheet title="Cat medication" onClose={()=>setPane('')}><CatRecordEditor pets={[{id:1,name:'Fixture cat',isActive:true} as any]} initialKind="medication" onSaved={()=>{}} onCancel={()=>setPane('')}/></FormSheet>}
{pane==='plan'&&<TrainingPlanEditor plan={{...trainingTemplate(),version:1,updatedAt:''}} suggestions={{teachers:[],courses:[],presets:[]}} onSaved={()=>{}} onClose={()=>setPane('')}/>}
</main></CatsDataProvider></HealthDataProvider></LocaleController>;}createRoot(document.getElementById('root')!).render(<App/>);`;
await fs.writeFile(path.join(directory,'fixture.tsx'),fixture);
await fs.writeFile(path.join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/app/globals.css"><div id="root"></div><script type="module" src="./fixture.tsx"></script>');
const port=await freeLocalPort(),server=await createServer({configFile:path.resolve('vite.trackers.config.ts'),root:process.cwd(),optimizeDeps:{entries:[path.join(directory,'fixture.tsx')]},server:{host:'127.0.0.1',port,strictPort:true}});
let browser;const errors=[],requests=[];
try{
 await server.listen();console.log(JSON.stringify({pid:process.pid,port,directory}));
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:402,height:874},isMobile:true,hasTouch:true});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('evaorbit.uiLanguage','en');localStorage.setItem('evaorbit.appearanceMode','light');});
 await page.route('**/api/**',route=>{requests.push(route.request().method());return route.fulfill({json:[]});});
 await page.goto(`http://127.0.0.1:${port}/${path.relative(process.cwd(),directory).replaceAll('\\','/')}/index.html`,{waitUntil:'domcontentloaded',timeout:30000});
 const close=async()=>{await page.locator('.form-sheet-header button').click();const discard=page.getByRole('button',{name:'Discard and close',exact:true});if(await discard.isVisible())await discard.click();await page.locator('.form-sheet-panel').waitFor({state:'detached'});};
 await page.getByRole('button',{name:'Development info',exact:true}).focus();await page.keyboard.press('Enter');await page.getByText('Development content stays available.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'General',exact:true}).click();await page.locator('.form-sheet-layer[data-state="open"]').waitFor();
 assert.equal(await page.getByRole('button',{name:'History 0',exact:true}).locator('.eo-disclosure-trailing').textContent(),'0');
 await page.locator('button[form="qa-form"]').click();const required=page.getByRole('textbox',{name:'Required detail',exact:true});await required.waitFor();
 assert(await required.evaluate(el=>el===document.activeElement));assert.equal(await page.evaluate(()=>window.__saved||0),0);
 await required.fill('Keep nested input');await page.getByRole('button',{name:'Inner',exact:true}).click();await page.getByRole('button',{name:'Outer',exact:true}).click();
 await page.getByRole('button',{name:'Outer',exact:true}).click();await page.getByRole('button',{name:'Inner',exact:true}).click();assert.equal(await required.inputValue(),'Keep nested input');
 await page.getByRole('textbox',{name:'A draft',exact:true}).fill('Controlled draft');await page.getByRole('button',{name:'Accordion B',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Accordion A',exact:true}).getAttribute('aria-expanded'),'false');
 await page.getByRole('button',{name:'Accordion A',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'A draft',exact:true}).inputValue(),'Controlled draft');
 await page.getByRole('button',{name:'Paste item list',exact:true}).click();await page.getByRole('textbox',{name:'Items, one label | amount per line',exact:true}).fill('Dinner | 180');
 await page.getByRole('button',{name:'Paste item list',exact:true}).click();await page.getByRole('button',{name:'Paste item list',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Items, one label | amount per line',exact:true}).inputValue(),'Dinner | 180');
 for(const width of [402,1280])for(const theme of ['vintage'])for(const mode of ['light','dark']){
  await page.setViewportSize({width,height:874});await page.evaluate(({theme,mode})=>{document.documentElement.dataset.designTheme=theme;document.documentElement.dataset.mode=mode;},{theme,mode});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({animations:'disabled',path:path.join(directory,`${theme}-${mode}-${width}.png`)});
  const input=page.getByRole('textbox',{name:'Items, one label | amount per line',exact:true});
  for(const state of ['normal','focus','disabled']){
    if(state==='focus')await input.focus();
    if(state==='disabled')await input.evaluate(el=>{el.disabled=true;});
    const style=await input.evaluate(el=>{const s=getComputedStyle(el);return{border:parseFloat(s.borderTopWidth),radius:parseFloat(s.borderTopLeftRadius),outline:s.outlineStyle,padding:parseFloat(s.paddingTop)};});
    assert(style.border<=1&&style.radius>=8&&style.padding>=10,`${theme}/${mode}/${state}: shared text field material`);assert.equal(style.outline,'none');
  }
  await input.evaluate(el=>{el.disabled=false;});
 }
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.eo-disclosure-content').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('button[form="qa-form"]').click();await page.waitForFunction(()=>window.__saved===1);await close();
 await page.getByRole('button',{name:'Cats',exact:true}).click();await page.getByRole('button',{name:'Reason, end date and notes · Optional',exact:true}).click();
 const catPanel=page.getByRole('button',{name:'Reason, end date and notes · Optional',exact:true}).locator('xpath=../..');const note=catPanel.getByRole('textbox',{name:'Notes',exact:true});await note.fill('Retained cat medication note');
 await catPanel.getByRole('button').first().click();await catPanel.getByRole('button').first().click();assert.equal(await note.inputValue(),'Retained cat medication note');await page.screenshot({animations:'disabled',path:path.join(directory,'cat-form.png')});await close();
 await page.getByRole('button',{name:'Plan',exact:true}).click();const days=page.locator('.training-plan-day');await days.first().waitFor();
 const name=days.first().getByRole('textbox',{name:'Day name',exact:true});await name.fill('');await days.nth(1).locator('.eo-disclosure-trigger').first().click();
 assert.equal(await days.first().getAttribute('data-expanded'),'false');await page.locator('button[form="training-plan-form"]').click();await name.waitFor();assert(await name.evaluate(el=>el===document.activeElement));
 await name.fill('Retained training day');await days.nth(1).locator('.eo-disclosure-trigger').first().click();await days.first().locator('.eo-disclosure-trigger').first().click();assert.equal(await name.inputValue(),'Retained training day');await page.screenshot({animations:'disabled',path:path.join(directory,'training-plan.png')});await close();
 assert.deepEqual(errors,[]);assert(requests.every(method=>method==='GET'));
 console.log(JSON.stringify({passed:true,directory,controlledAndNested:true,zeroCount:true,invalidRevealAndFocus:true,expenseCatAndPlanDrafts:true,keyboard:true,reducedMotion:true,themes:2,modes:2,widths:[402,1280],businessWrites:0}));
}finally{
 await browser?.close();await server.close();await new Promise((resolve,reject)=>{const probe=probeServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});console.log(JSON.stringify({closedTestPort:port}));
}
