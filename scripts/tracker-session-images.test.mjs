import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import ts from "typescript";
import {LocalTrackerStore} from "../src/lib/tracker-local-store.ts";
import {requestFailure} from "../src/lib/request-diagnostics.ts";

function fixture(){
 const api={},account={accountId:"10000000-0000-4000-8000-000000000001"};
 const code=ts.transpileModule(readFileSync("src/local-trackers/tracker-session.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function("require","exports",code)(name=>{
  if(name.endsWith("tracker-local-store"))return{LocalTrackerStore};
  if(name.endsWith("platform"))return{isPreviewAccount:()=>false};
  if(name.endsWith("request-diagnostics"))return{requestFailure};
  return{};
 },api);
 let disk=null,images,downloads=0,revision=0;
 const storage={read:async()=>disk?structuredClone({...disk,...(images?{readOnly:{images,settings:{}}}:{})}):null,commit:async(expected,next)=>{if((disk?.revision??0)!==expected)return false;disk=structuredClone(next);return true;}};
 const platform={storage:()=>storage,readOnly:()=>false,sync:async request=>({protocolVersion:2,accountId:request.accountId,results:[],snapshot:{complete:true,revision:++revision,records:[{resourceType:"tracker",serverId:1,version:1,payload:{name:"Sleep",iconType:"image"}}]}}),refreshReadonly:async()=>{downloads++;images={1:{version:"v1",dataUrl:"data:image/png;base64,test"}};}};
 return{api,account,platform,downloads:()=>downloads,store:api.trackerSession(account,platform)};
}

test("fresh editable sync restores image cache once without replacing replica records",async()=>{
 const {api,account,platform,downloads,store}=fixture();
 await api.synchronizeTrackerSession(account,platform);
 assert.equal(downloads(),1);
 assert.equal(store.getSnapshot().records[0].version,1);
 assert.equal(store.getSnapshot().readOnly.images[1].dataUrl,"data:image/png;base64,test");
 await api.synchronizeTrackerSession(account,platform);
 assert.equal(downloads(),1,"The foreground timer must not redownload the snapshot every minute");
 assert.equal(api.trackerSyncActivity(store).getSnapshot().error,"");
});

test("failed icon download preserves acknowledged sync and a new local draft, then can recover",async()=>{
 const {api,account,platform,store}=fixture(),download=platform.refreshReadonly;
 platform.refreshReadonly=async()=>{await store.createTracker({name:"Unsent draft"});throw Error("offline");};
 await api.synchronizeTrackerSession(account,platform);
 const before=structuredClone(store.getSnapshot()),activity=api.trackerSyncActivity(store).getSnapshot();
 assert.equal(before.remoteRevision,1);
 assert.equal(before.outbox.length,1);
 assert.ok(activity.lastSyncedAt);
 assert.equal(activity.syncing,false);
 assert.match(activity.error,/records synced, but icons/);
 // Restore assets directly as a cache refresh would; initialization must retain the queued draft.
 await download();await store.initialize();
 assert.deepEqual(store.getSnapshot().records,before.records);
 assert.deepEqual(store.getSnapshot().outbox,before.outbox);
 assert.ok(store.getSnapshot().readOnly.images[1]);
});
