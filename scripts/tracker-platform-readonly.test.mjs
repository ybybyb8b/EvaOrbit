import {buildChronicleSnapshot,validateChronicleSnapshot} from "../src/lib/chronicle-readonly.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { readonlyTrackerState, fetchReadonlyTrackers } from "../src/lib/tracker-readonly.ts";
import {validateFoodSnapshot} from "../src/lib/food-readonly.ts";
import {validateCatsSnapshot} from "../src/lib/cats-readonly.ts";
import {validateSubscriptionsSnapshot} from "../src/lib/subscriptions-readonly.ts";
import {foodResourceKey,validateFoodResource} from "../src/lib/food-readonly-resource.ts";
import { homeResourceKey, validateHomeResource } from "../src/lib/home-readonly.ts";

function fixture(native, methods=[]) {
  const calls=[], snapshot={format:"eo-trackers-readonly-v1",accountId:"10000000-0000-4000-8000-000000000001",capturedAt:"2026-10-19T00:00:00Z",details:[]};
  const imports={"../lib/native-bridge":{nativeCall:async(method,parameters)=>{calls.push({method,parameters});return method==="host.getInfo"?{methods}:method==="trackers.acceptanceStatus"?{pending:1,frozen:1}:snapshot;}},"../lib/response-error":{responseError:async()=>"error"},"../lib/tracker-readonly":{readonlyTrackerState,fetchReadonlyTrackers}};
  const code=ts.transpileModule(readFileSync("src/local-trackers/platform.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  imports["../lib/home-readonly"]={homeResourceKey,validateHomeResource};imports["../lib/home-preview"]={previewHomeResource:()=>{throw Error("Preview not used in this fixture");}};
  imports["../lib/food-readonly"]={validateFoodSnapshot};
  imports["../lib/cats-readonly"]={validateCatsSnapshot};
  imports["../lib/chronicle-readonly"]={buildChronicleSnapshot,validateChronicleSnapshot};
  imports["../lib/subscriptions-readonly"]={validateSubscriptionsSnapshot};
  imports["../lib/food-readonly-resource"]={foodResourceKey,validateFoodResource};
  const loaded={};new Function("require","exports","window",code)(name=>{if(!(name in imports))throw Error(name);return imports[name];},loaded,{EvaOrbitNative:native?{}:undefined});
  return {platform:loaded.trackerPlatform(),calls,account:{accountId:snapshot.accountId,email:"test@example.invalid"}};
}

test("real-account writes and legacy synchronization fail closed before any bridge or storage call",async()=>{
 for(const native of [true,false]) {
  const {platform,calls,account}=fixture(native);
  assert.equal(platform.readOnly(account),true);
  await assert.rejects(platform.sync({}),/只读验收/);
  await assert.rejects(platform.storage(account).commit(0,{}),/只读验收/);
  assert.deepEqual(calls,[]);
 }
 const old=fixture(true);
 await assert.rejects(old.platform.storage(old.account).read(),/新版开发 Host/);
 assert.deepEqual(old.calls.map(call=>call.method),["host.getInfo"]);
});

test("old Host cannot fall back to an unsafe Cats read path",async()=>{
  const {platform,account,calls}=fixture(true);
  await assert.rejects(platform.catsSnapshot(account,true),/updated development Host/);
  assert.deepEqual(calls.map(call=>call.method),["host.getInfo"]);
});

test("old Host cannot fall back to subscription GETs with automatic payment side effects",async()=>{
  const {platform,account,calls}=fixture(true);
  await assert.rejects(platform.subscriptionsSnapshot(account,true),/updated development Host/);
  assert.deepEqual(calls.map(call=>call.method),["host.getInfo"]);
});

test("read-only native cache and refresh use capability detection and account-scoped methods",async()=>{
 const f=fixture(true,["trackers.readOnlySnapshot","trackers.acceptanceStatus"]);
 const state=await f.platform.storage(f.account).read();
 assert.deepEqual(state.outbox,[]);
 await f.platform.refreshReadonly(f.account);
 const inspection=await f.platform.inspection(f.account);
 assert.equal(inspection.frozen,1);
 assert(f.calls.filter(call=>call.method!=="host.getInfo").every(call=>call.parameters.accountId===f.account.accountId));
 assert(!f.calls.some(call=>["trackers.sync","trackers.commitState","trackers.readState"].includes(call.method)));
});

test("old Host cannot fall back to Chronicle network or queue writes",async()=>{
 const {platform,account,calls}=fixture(true);
 await assert.rejects(platform.chronicleSnapshot(account,true),/updated development Host/);
 assert.deepEqual(calls.map(call=>call.method),["host.getInfo"]);
});
