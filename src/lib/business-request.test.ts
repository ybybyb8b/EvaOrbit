import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {allowsBusinessRequest} from "./business-request-policy.ts";
import {businessFetch,installBusinessRequest} from "./business-request.ts";
import {isAllowedAccountEmail,isOnlineTestEmail} from "./config.ts";

test("online business routes permit explicit operations without exposing sync, secrets, or system integrations",()=>{
  for(const [path,method] of [["/api/health/weight","POST"],["/api/food/places/2","PATCH"],["/api/media/series/2","PATCH"],["/api/projects","POST"],["/api/relations/flows/2/settle","POST"],["/api/cats/records/measurement/2","DELETE"],["/api/memos?q=older%20note","GET"]])assert(allowsBusinessRequest(path,method),path);
  for(const path of ["https://evil.invalid/api/tasks","//evil/api/tasks","/api/tasks/../ai/providers","/api/tasks/%2e%2e/ai/providers","/api/tasks\\../ai/providers","/api/tasks#x","/api/native/sync","/api/ai/providers","/api/reminders/deliver","/api/eventkit/links","/api/healthkit/energy/ingest","/api/data-backup/export","/api/trackers/1"])for(const method of ["GET","POST","DELETE"])assert(!allowsBusinessRequest(path,method),path);
  assert(!allowsBusinessRequest("/api/tasks","DELETE"));
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
