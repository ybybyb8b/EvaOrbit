import assert from "node:assert/strict";
import test from "node:test";
import {readModuleSyncStatus} from "../local-trackers/sync-resources.ts";
import {syncModules} from "./sync-modules.ts";
import type {TrackerPlatform} from "../local-trackers/platform";

test("sync overview inspects caches without requesting a network refresh",async()=>{
 const account={accountId:"account-a",email:"a@example.invalid"},calls:unknown[][]=[],stamp="2026-10-22T00:00:00Z";
 const platform=new Proxy({},{get:(_target,key)=>(...args:unknown[])=>{calls.push([key,...args]);return Promise.resolve({capturedAt:stamp,complete:false});}}) as TrackerPlatform;
 for(const selectedModule of syncModules.filter(row=>row.id!=="trackers"))assert.equal((await readModuleSyncStatus(platform,account,selectedModule.id)).capturedAt,stamp);
 assert.equal(calls.length,13);
 assert(calls.every(call=>call[1]===account));
 assert(calls.every(call=>call[0]==="homeResource"?call[2]==="day"&&call[3]==="latest":call.at(-1)===false));
 assert.equal(calls.filter(call=>call[0]==="workspaceSnapshot").length,3);
});

test("explicit update refreshes full Home bundle and preserves partial-history facts",async()=>{
 const calls:unknown[][]=[],account={accountId:"account-b",email:"b@example.invalid"};
 const platform={homeResource:async(...args:unknown[])=>{calls.push(args);return{capturedAt:"2026-10-22T00:00:00Z"};},workspaceSnapshot:async()=>({capturedAt:"2026-10-22T00:00:00Z",data:{complete:false}})} as unknown as TrackerPlatform;
 await readModuleSyncStatus(platform,account,"home",true);
 assert.deepEqual(calls.map(call=>call[1]),["day","month","due"]);assert(calls.every(call=>call[0]===account&&call[3]===true));
 assert.equal((await readModuleSyncStatus(platform,account,"projects")).complete,false);
});

test("cache inspection distinguishes missing data and rejects transport errors without replacing it",async()=>{
 const account={accountId:"account-c",email:"c@example.invalid"};
 const platform={memoSnapshot:async()=>null,mediaSnapshot:async()=>{throw Error("Account changed");}} as unknown as TrackerPlatform;
 assert.equal((await readModuleSyncStatus(platform,account,"memo")).capturedAt,undefined);
 await assert.rejects(readModuleSyncStatus(platform,account,"media",true),/Account changed/);
 await assert.rejects(readModuleSyncStatus(platform,account,"trackers"),/versioned replica/);
});
