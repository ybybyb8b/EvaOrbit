import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {registerLocalRefresh,refreshLocalPage} from "../src/local-trackers/refresh.ts";

test("Web adapter keeps route invalidation and router refresh behind the shared gesture",()=>{
 const calls=[],api={};
 const code=ts.transpileModule(readFileSync("src/components/pull-to-refresh.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function("require","exports",code)(name=>{
  if(name==="react")return{useCallback:callback=>callback};
  if(name==="react/jsx-runtime")return{jsx:(type,props)=>({type,props})};
  if(name==="next/navigation")return{usePathname:()=>"/media",useRouter:()=>({refresh:()=>calls.push("refresh")})};
  if(name.endsWith("pull-to-refresh-core"))return{PullToRefreshView:"shared"};
  if(name.endsWith("client-data-cache"))return{invalidateClientData:domains=>calls.push(domains)};
  if(name.endsWith("cache-policy"))return{dataDependencies:path=>{assert.equal(path,"/media");return["media"];}};
  throw Error(name);
 },api);
 const view=api.PullToRefresh({enabled:false});
 assert.equal(view.type,"shared");assert.equal(view.props.enabled,false);assert.equal(view.props.pathname,"/media");
 view.props.onRefresh();assert.deepEqual(calls,[["media"],"refresh"]);
});

test("local pull waits for mounted readers, releases old routes and preserves error ownership",async()=>{
 let release,finished=false,reads=0;
 const stop=registerLocalRefresh(()=>{reads++;return new Promise(resolve=>{release=resolve;});});
 const work=refreshLocalPage().then(()=>{finished=true;});
 await Promise.resolve();assert.equal(reads,1);assert.equal(finished,false);
 release();await work;assert.equal(finished,true);
 stop();await refreshLocalPage();assert.equal(reads,1);
 const stopStale=registerLocalRefresh(()=>{throw Error("A removed route cannot be refreshed");});
 const scheduled=refreshLocalPage();stopStale();await scheduled;
 const stopFailure=registerLocalRefresh(()=>Promise.reject(Error("Cached data is preserved")));
 try{await assert.rejects(refreshLocalPage(),/Cached data is preserved/);}finally{stopFailure();}
 await refreshLocalPage();
});
