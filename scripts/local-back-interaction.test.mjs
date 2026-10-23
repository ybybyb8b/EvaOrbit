import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import ts from "typescript";

test("native back uses the current page action, preserves modal drafts, and releases old handlers",()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 const target=new EventTarget();let modal=false,cursor=0,context;
 const slots=[],effects=[],calls=[];
 const jsx=(type,props)=>({type,props});
 const react={
  createContext:()=>context={value:null,Provider:"provider"},
  useContext:()=>context.value,
  useCallback:callback=>callback,
  useRef:value=>({current:value}),
  useState:initial=>{const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],next=>{slots[index]=typeof next==="function"?next(slots[index]):next;}];},
  useLayoutEffect:effect=>effect(),
  useEffect:(effect,deps)=>{const index=cursor++,previous=slots[index];if(!previous||deps.some((value,i)=>value!==previous.deps[i])){previous?.cleanup?.();effects.push(()=>slots[index]={deps,cleanup:effect()});}},
 };
 const api={};
 const code=ts.transpileModule(readFileSync("src/local-trackers/navigation-header.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function("require","exports",code)(name=>{
  if(name==="react")return react;
  if(name==="react/jsx-runtime")return{jsx,jsxs:jsx};
  if(name.endsWith("navigation-back-control"))return{NavigationBackControl:"button"};
  if(name.endsWith("download-status"))return{DownloadStatusButton:"button"};
  throw Error(name);
 },api);
 globalThis.window=target;
 globalThis.document={querySelector:selector=>{assert.equal(selector,'[role="dialog"][aria-modal="true"]');return modal?{}:null;}};
 const render=fallback=>{cursor=0;context.value=api.LocalNavigationProvider({children:null,fallback}).props.value;effects.splice(0).forEach(effect=>effect());};
 const back=()=>!target.dispatchEvent(new Event("evaorbit:native-back",{cancelable:true}));
 const start=()=>!target.dispatchEvent(new Event("evaorbit:native-back-start",{cancelable:true}));
 const fallback=()=>calls.push("module");
 try{
  render(undefined);assert.equal(start(),false);assert.equal(back(),false);assert.deepEqual(calls,[],"Home without a destination stays put");
  render(fallback);assert.equal(start(),true);assert.deepEqual(calls,[],"Starting a drag must not navigate");assert.equal(back(),true);assert.deepEqual(calls,["module"]);
  const releaseFirst=context.value.register({back:()=>calls.push("detail")});render(fallback);
  back();assert.equal(calls.at(-1),"detail","Page destination takes precedence over module fallback");
  modal=true;assert.equal(start(),false);assert.equal(back(),false);assert.equal(calls.length,2,"Open form or drawer cannot be left by swiping");modal=false;
  const releaseSecond=context.value.register({back:()=>calls.push("new detail")});releaseFirst();render(fallback);
  back();assert.equal(calls.at(-1),"new detail","Old cleanup cannot clear a newer destination");
  releaseSecond();render(fallback);back();assert.equal(calls.at(-1),"module");
  const count=calls.length;slots.forEach(slot=>slot?.cleanup?.());assert.equal(start(),false);assert.equal(back(),false);assert.equal(calls.length,count,"Unmount removes the native event listener");
 }finally{
  slots.forEach(slot=>slot?.cleanup?.());
  if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
 }
});

test("native transition waits for React paint only after an accepted back action",async()=>{
 const source=readFileSync("ios/EvaOrbitHost/Sources/WebViewController.swift","utf8");
 const script=source.match(/static let localBackCommitScript = #"""\s*([\s\S]*?)\s*"""#/)?.[1];
 assert.ok(script);
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 for(const accepted of [false,true]){
  const target=new EventTarget();let navigations=0,frames=0;
  target.addEventListener("evaorbit:native-back",event=>{if(accepted){navigations++;event.preventDefault();}});
  const result=await new AsyncFunction("window","Event","requestAnimationFrame",script)(target,Event,callback=>{frames++;queueMicrotask(callback);});
  assert.equal(result,accepted);assert.equal(navigations,accepted?1:0);assert.equal(frames,accepted?2:0);
 }
});
