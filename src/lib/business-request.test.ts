import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {allowsBusinessRequest} from "./business-request-policy.ts";
import {businessFetch,installBusinessRequest} from "./business-request.ts";
import {isAllowedAccountEmail,isOnlineTestEmail,isLocalOnlineAccountAllowed,isNativeIntegrationAccountAllowed} from "./config.ts";

test("online business routes allow explicit operations and Tracker settings, never sync or secrets",()=>{
  for(const [path,method] of [["/api/health/weight","POST"],["/api/food/places/2","PATCH"],["/api/media/series/2","PATCH"],["/api/projects","POST"],["/api/relations/flows/2/settle","POST"],["/api/cats/records/measurement/2","DELETE"],["/api/memos?q=older%20note","GET"],["/api/trackers/1","DELETE"]])assert(allowsBusinessRequest(path,method),path);
  for(const path of ["https://evil.invalid/api/tasks","//evil/api/tasks","/api/tasks/../ai/providers","/api/tasks/%2e%2e/ai/providers","/api/tasks\\../ai/providers","/api/tasks#x","/api/native/sync","/api/ai/providers","/api/reminders/deliver","/api/eventkit/links","/api/healthkit/energy/ingest","/api/data-backup/export"])for(const method of ["GET","POST","DELETE"])assert(!allowsBusinessRequest(path,method),path);
  for(const method of ["GET","PATCH","DELETE"])assert(allowsBusinessRequest("/api/trackers/1",method));
  assert(!allowsBusinessRequest("/api/trackers/1","POST"));
  for(const path of ["/api/trackers/1/entries","/api/trackers/quick-log"])assert(!allowsBusinessRequest(path,"POST"));
  assert(allowsBusinessRequest("/api/trackers/1/fields?fieldId=2","PATCH"));assert(allowsBusinessRequest("/api/trackers/1/goals","POST"));assert(!allowsBusinessRequest("/api/trackers/1/goals","PATCH"));
  assert(!allowsBusinessRequest("/api/tasks","DELETE"));
  for(const [path,method] of [["/api/subscriptions/library","POST"],["/api/subscriptions/library/1","PATCH"],["/api/subscriptions/library/1/icon","POST"],["/api/subscriptions/library/1/icon","DELETE"]])assert(allowsBusinessRequest(path,method));
  for(const path of ["/api/subscriptions/library/0","/api/subscriptions/library/-1","/api/subscriptions/library/1/export"])assert(!allowsBusinessRequest(path,"POST"));
  const manifest=JSON.parse(readFileSync(new URL("business-routes.json",import.meta.url),"utf8")) as Array<{pattern:string;methods:string[]}>;
  assert(manifest.length>90);assert(manifest.every(route=>route.methods.length>0));
});
test("server test accounts are explicit, disabled by default, and never replace the owner",()=>{
  const primary=process.env.EVAORBIT_ALLOWED_EMAIL,extra=process.env.EVAORBIT_TEST_EMAILS;
  try{process.env.EVAORBIT_ALLOWED_EMAIL="owner@example.invalid";delete process.env.EVAORBIT_TEST_EMAILS;assert(!isAllowedAccountEmail("test@example.invalid"));process.env.EVAORBIT_TEST_EMAILS=" test@example.invalid , owner@example.invalid ";assert(isAllowedAccountEmail("TEST@example.invalid"));assert(isOnlineTestEmail("test@example.invalid"));assert(!isOnlineTestEmail("owner@example.invalid"),"Owner never enters the test-only business channel");assert(isAllowedAccountEmail("owner@example.invalid"));assert(!isAllowedAccountEmail("stranger@example.invalid"));delete process.env.EVAORBIT_ALLOWED_EMAIL;assert(!isAllowedAccountEmail("test@example.invalid"));}
  finally{if(primary===undefined)delete process.env.EVAORBIT_ALLOWED_EMAIL;else process.env.EVAORBIT_ALLOWED_EMAIL=primary;if(extra===undefined)delete process.env.EVAORBIT_TEST_EMAILS;else process.env.EVAORBIT_TEST_EMAILS=extra;}
});
test("legacy candidate helpers cannot replay a write against a newly selected account",async()=>{
  let calls=0;
  const remove=installBusinessRequest(async()=>{calls++;return Response.json([]);});
  try{await businessFetch("/api/tasks");await assert.rejects(businessFetch("/api/tasks",{method:"POST"}),/account-bound/);assert.equal(calls,1);}finally{remove();}
});

test("primary online access requires its own opt-in and native access never enables test accounts",()=>{
 const keys=["EVAORBIT_ALLOWED_EMAIL","EVAORBIT_TEST_EMAILS","EVAORBIT_LOCAL_ONLINE_ENABLED","EVAORBIT_LOCAL_NATIVE_ENABLED"];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{process.env.EVAORBIT_ALLOWED_EMAIL="owner@example.invalid";process.env.EVAORBIT_TEST_EMAILS="test@example.invalid";delete process.env.EVAORBIT_LOCAL_ONLINE_ENABLED;delete process.env.EVAORBIT_LOCAL_NATIVE_ENABLED;
 assert(!isLocalOnlineAccountAllowed("owner@example.invalid"));assert(isLocalOnlineAccountAllowed("test@example.invalid"));
 process.env.EVAORBIT_LOCAL_ONLINE_ENABLED="true";assert(isLocalOnlineAccountAllowed("OWNER@example.invalid"));assert(!isLocalOnlineAccountAllowed("stranger@example.invalid"));assert(!isNativeIntegrationAccountAllowed("owner@example.invalid"));
 process.env.EVAORBIT_LOCAL_NATIVE_ENABLED="true";assert(isNativeIntegrationAccountAllowed("owner@example.invalid"));assert(!isNativeIntegrationAccountAllowed("test@example.invalid"));assert(!isNativeIntegrationAccountAllowed("stranger@example.invalid"));
 delete process.env.EVAORBIT_LOCAL_ONLINE_ENABLED;assert(!isNativeIntegrationAccountAllowed("owner@example.invalid"));
 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
