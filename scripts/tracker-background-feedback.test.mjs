import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import ts from "typescript";

test("background Tracker initialization reports to sync status; explicit capture still reports errors",async()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 const events=new EventTarget(),documentEvents=new EventTarget(),slots=[],effects=[],updates=[];
 let cursor=0,context;
 const react={useMemo:fn=>fn(),useCallback:fn=>fn,useRef:value=>({current:value}),useSyncExternalStore:(_,get)=>get(),useState:initial=>{const index=cursor++;if(!(index in slots))slots[index]=typeof initial==="function"?initial():initial;return[slots[index],next=>{slots[index]=typeof next==="function"?next(slots[index]):next;}];},useEffect:fn=>{if(!context)effects.push(fn);}};
 const store={subscribe:()=>()=>{},getSnapshot:()=>({records:[],outbox:[]}),initialize:async()=>{throw Error("Tracker storage temporarily unavailable");}};
 const platform={readOnly:()=>false};
 const jsx=(type,props)=>({type,props}),api={};
 const code=ts.transpileModule(readFileSync("src/local-trackers/quick-log.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function("require","exports",code)(name=>{
  if(name==="react")return react;
  if(name==="react/jsx-runtime")return{jsx,jsxs:jsx};
  if(name.endsWith("tracker-session"))return{trackerSession:()=>store,trackerSyncActivity:()=>({update:value=>updates.push(value)})};
  if(name.endsWith("online-business"))return{useOnlineBusiness:()=>true,useOnlineReader:fn=>fn};
  if(name.endsWith("business-request-context"))return{useBusinessRequest:()=>()=>{throw Error("No business write is permitted in this fixture");}};
  if(name.endsWith("bottom-log-core"))return{useBottomLog:()=>null};
  if(name.endsWith("locale-controller"))return{useLocale:()=>({english:true})};
  if(name.endsWith("time"))return{dateInEvaOrbit:()=>"2026-10-27"};
  if(name.endsWith("platform"))return{isPreviewAccount:()=>false};
  if(name.endsWith("health-quick-log"))return{getHealthQuickLog:()=>undefined};
  if(name.endsWith("quick-log-options"))return{QUICK_LOG_OPTIONS:[]};
  return new Proxy({},{get:(_,key)=>String(key)});
 },api);
 const nodes=node=>!node||typeof node!=="object"?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
 const render=()=>{cursor=0;const tree=nodes(api.LocalQuickLog({account:{accountId:"test"},platform}));context=true;return tree;};
 globalThis.window=Object.assign(events,{setInterval:()=>0});globalThis.document=Object.assign(documentEvents,{visibilityState:"visible"});
 let cleanup=[];
 try{
  render();cleanup=effects.map(fn=>fn()).filter(Boolean);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(updates,[{error:"Tracker storage temporarily unavailable"}]);
  assert.equal(render().some(node=>node.type==="ErrorNotice"),false,"No cross-page error banner from background work");
  events.dispatchEvent(new Event("online"));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(updates.length,2);assert.equal(render().some(node=>node.type==="ErrorNotice"),false);
  render().find(node=>node.type==="QuickLogTrigger").props.onClick();
  render().find(node=>node.type==="QuickLogPicker").props.onChoose("tracker");await new Promise(resolve=>setImmediate(resolve));
  assert.equal(render().find(node=>node.type==="ErrorNotice").props.children,"Tracker storage temporarily unavailable");
  events.dispatchEvent(new Event("online"));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(render().find(node=>node.type==="ErrorNotice").props.children,"Tracker storage temporarily unavailable","Background work cannot overwrite the current action error");
 }finally{cleanup.forEach(fn=>fn());globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
