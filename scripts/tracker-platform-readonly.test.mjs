import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { readonlyTrackerState, fetchReadonlyTrackers } from "../src/lib/tracker-readonly.ts";

function fixture(native, methods=[]) {
  const calls=[], snapshot={format:"eo-trackers-readonly-v1",accountId:"10000000-0000-4000-8000-000000000001",capturedAt:"2026-10-19T00:00:00Z",details:[]};
  const imports={"../lib/native-bridge":{nativeCall:async(method,parameters)=>{calls.push({method,parameters});return method==="host.getInfo"?{methods}:method==="trackers.acceptanceStatus"?{pending:1,frozen:1}:snapshot;}},"../lib/response-error":{responseError:async()=>"error"},"../lib/tracker-readonly":{readonlyTrackerState,fetchReadonlyTrackers}};
  const code=ts.transpileModule(readFileSync("src/local-trackers/platform.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
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
