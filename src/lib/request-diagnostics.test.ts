import assert from "node:assert/strict";
import test from "node:test";
import {diagnosticFetch,diagnosticMessage,requestFailure,requestOperation} from "./request-diagnostics.ts";
import {responseError} from "./response-error.ts";
import {rawNativeCall,NativeBridgeError} from "./native-bridge.ts";

test("request context removes queries, fragments, host credentials and unsupported paths",()=>{
 assert.equal(requestOperation("https://user:secret@example.invalid/api/tasks?title=private#token","POST"),"POST /api/tasks");
 assert.equal(requestOperation("file:///private/secret","POST"),"POST API request");
 assert.equal(requestOperation("/api/tasks?token=secret","bad\nsecret"),"REQUEST /api/tasks");
 assert.equal(diagnosticMessage("Failure","secret with spaces"),"Failure [EO:unexpected_error]");
});

test("network, cancellation, decoding, quota and access failures stay distinct without leaking raw errors",()=>{
 for(const [name,code] of [["TimeoutError","network_timeout"],["AbortError","operation_cancelled"],["SyntaxError","json_decode_failed"],["QuotaExceededError","storage_full"],["SecurityError","access_denied"],["TypeError","request_failed"],["Error","operation_failed"]]){
  const error=new Error("secret response body and https://user:password@example.invalid");error.name=name;
  const failure=requestFailure(error,"Home · response");
  assert.match(failure.message,new RegExp(`\\[EO:${code}\\]`));assert.match(failure.message,/Home · response/);assert.doesNotMatch(failure.message,/secret|password/);
  if(name==="AbortError")assert.equal(failure.name,"AbortError");
 }
 const preserved=new NativeBridgeError("Reconnect [EO:session_expired]","session_expired");
 assert.equal(requestFailure(preserved,"another context"),preserved);
});

test("failed writes make one attempt and report uncertain results; reads do not claim a write",async()=>{
 let calls=0;const request=async()=>{calls++;throw new TypeError("private URL");};
 await assert.rejects(diagnosticFetch("/api/tasks?token=secret",{method:"POST"},request),error=>{
  assert.match(String(error),/POST \/api\/tasks/);assert.match(String(error),/save result is unknown/);assert.match(String(error),/nothing retries automatically/);assert.doesNotMatch(String(error),/secret|private URL/);return true;
 });assert.equal(calls,1);
 await assert.rejects(diagnosticFetch("/api/tasks",{},request),error=>{assert.doesNotMatch(String(error),/save result is unknown/);return true;});assert.equal(calls,2);
});

test("HTTP diagnostics preserve business copy and codes but never include HTML or query data",async()=>{
 const response=Response.json({error:"Resolve this conflict first.",code:"eventkit_identity_conflict"},{status:409,headers:{"X-EvaOrbit-Operation":"PUT /api/eventkit/links?token=secret"}});
 const message=await responseError(response,"fallback");
 assert.match(message,/Resolve this conflict first/);assert.match(message,/HTTP 409/);assert.match(message,/EO:eventkit_identity_conflict/);assert.match(message,/PUT \/api\/eventkit\/links/);assert.doesNotMatch(message,/secret/);
 const upstream=await responseError(new Response("<html>private payload</html>",{status:502}),"Server temporarily unavailable.");
 assert.match(upstream,/EO:http_502/);assert.doesNotMatch(upstream,/private|html/);
});

test("bridge failures retain operation and authentication code, reject malformed replies, and avoid parameter content",async()=>{
 const previous=globalThis.window;let result:unknown={ok:false,error:{code:"session_expired",message:"Reconnect the account."}};
 globalThis.window={EvaOrbitNative:{version:1,call:async()=>result}} as unknown as Window & typeof globalThis;
 try{
  await assert.rejects(rawNativeCall("native.api",{method:"PUT",path:"/api/eventkit/links?token=secret",bodyBase64:"secret"}),error=>{
   assert.ok(error instanceof NativeBridgeError);assert.equal(error.code,"session_expired");assert.match(error.message,/PUT \/api\/eventkit\/links/);assert.doesNotMatch(error.message,/secret/);return true;
  });
  result=null;await assert.rejects(rawNativeCall("home.readOnlyResource",{key:"private"}),/EO:bridge_invalid_response/);
  result={ok:false,error:{code:"eventkit_fetch_failed",message:"Read failed."}};
  await assert.rejects(rawNativeCall("native.invoke",{method:"eventkit.fetch",arguments:{kind:"reminder",calendarIdentifiers:["private"]}}),error=>{assert.match(String(error),/eventkit.fetch \(Reminders\)/);assert.doesNotMatch(String(error),/private/);return true;});
 }finally{globalThis.window=previous;}
});
