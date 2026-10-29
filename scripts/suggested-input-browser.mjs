import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {freeLocalPort} from './local-navigation-browser.mjs';

const {chromium}=await import(process.env.EVAORBIT_PLAYWRIGHT_MODULE||'playwright');
const directory=await fs.mkdtemp(path.resolve('tmp/suggestions-browser-'));
await fs.writeFile(path.join(directory,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
await fs.writeFile(path.join(directory,'main.tsx'),`
import {useState} from 'react';import{createRoot}from'react-dom/client';
import{FormSheet}from'@/components/form-sheet';import{SuggestedInput}from'@/components/suggested-input';
import{TrainingExercises}from'@/app/health/training-exercises';import '@/app/globals.css';
function App(){const[value,setValue]=useState(''),[items,setItems]=useState([{id:'one',name:'',sets:null,target:'',completedSets:0,completed:false}]);
return <FormSheet title="训练候选填写" onClose={()=>{}}><form><div style={{height:200}}/><div className="field"><span>老师</span>
<SuggestedInput suggestionLabel="老师" value={value} onValueChange={setValue} suggestions={['王老师','王教练','李老师',...Array.from({length:20},(_,i)=>'老师'+i)]}/></div>
<TrainingExercises items={items} onChange={setItems} suggestions={['哑铃划船','哑铃深蹲']}/><div style={{height:400}}/></form></FormSheet>}
createRoot(document.getElementById('root')!).render(<App/>);`);
const port=await freeLocalPort(),base='http://127.0.0.1:'+port;
const server=await createServer({configFile:false,root:directory,resolve:{alias:{'@':path.resolve('src')}},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[process.cwd()]}}});
let browser;
try{
  await server.listen();browser=await chromium.launch({channel:'chrome',headless:true});
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:402,height:874}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(10000);
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForSelector('.form-sheet-layer[data-state="open"]');
    const input=page.getByRole('combobox',{name:'老师',exact:true});
    const choose=async option=>mobile?option.tap():option.click();
    const bounds=async()=>{
      await page.waitForTimeout(150);
      const b=await page.locator('.eo-select-dropdown').evaluate(el=>{const r=el.getBoundingClientRect(),v=window.visualViewport,s=document.querySelector('.form-sheet-body').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,visible:getComputedStyle(el).visibility,top:Math.max(v.offsetTop,s.top),end:Math.min(v.offsetTop+v.height,s.bottom),left:v.offsetLeft,width:v.width};});
      assert.equal(b.visible,'visible');assert(b.x>=b.left&&b.right<=b.left+b.width+1,JSON.stringify(b));assert(b.y>=b.top&&b.bottom<=b.end+1,JSON.stringify(b));
    };
    await input.fill('王');await bounds();await choose(page.getByRole('option',{name:'王老师',exact:true}));assert.equal(await input.inputValue(),'王老师');assert.equal(await page.locator('.eo-select-dropdown').count(),0);
    await input.fill('王');await input.dispatchEvent('compositionstart');await choose(page.getByRole('option',{name:'王老师',exact:true}));assert.equal(await input.inputValue(),'王老师');
    if(mobile){
      await input.fill('王');
      // Keep the real event target so the existing keyboard listeners receive this resize.
      await page.evaluate(()=>{const v=window.visualViewport;for(const [key,value]of Object.entries({width:402,height:350,offsetTop:120,offsetLeft:0}))Object.defineProperty(v,key,{value,configurable:true});v.dispatchEvent(new Event('resize'));});
      await bounds();
      // A partially clipped field still offers visible choices inside the sheet.
      await page.locator('.form-sheet-body').evaluate(el=>{const row=el.querySelector('.suggested-input-row').getBoundingClientRect(),bottom=el.getBoundingClientRect().bottom;el.scrollTop-=bottom-row.bottom+12;});
      await bounds();await choose(page.getByRole('option',{name:'王老师',exact:true}));assert.equal(await input.inputValue(),'王老师');
    }
    await input.fill('');await bounds();const before=await page.locator('.form-sheet-body').evaluate(el=>el.scrollTop);
    await input.press('ArrowUp');await bounds();assert.equal(await page.locator('.form-sheet-body').evaluate(el=>el.scrollTop),before,'list navigation must not scroll the form');
    await page.screenshot({path:path.join(directory,mobile?'mobile-keyboard.png':'desktop.png')});
    await page.keyboard.press('Enter');assert.notEqual(await input.inputValue(),'');
    // Reuse the real exercise name component, not a teacher-only test control.
    const exercise=page.getByRole('combobox',{name:'动作 1',exact:true});await exercise.fill('哑');await bounds();await choose(page.getByRole('option',{name:'哑铃划船',exact:true}));assert.equal(await exercise.inputValue(),'哑铃划船');
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log(JSON.stringify({result:'PASS mouse/touch, IME commit, exercise name, keyboard viewport/offset, partial clipping, long-list navigation',artifacts:directory,port}));
}finally{await browser?.close();await server.close();await assert.rejects(fetch(base),'temporary test listener must close');}
