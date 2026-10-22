import assert from "node:assert/strict";
import test from "node:test";
import {installNativeApiRequest} from "./native-api.ts";
import {captureNativeSessionGuard,installNativeRequest,reconcileNativeNotifications} from "./native-bridge.ts";

test("native reconciliation cannot continue against the next account after an awaited request",{timeout:5000},async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,"window");Object.defineProperty(globalThis,"window",{configurable:true,value:{EvaOrbitNative:{}}});
 let fetched!:()=>void,release!:()=>void;
 const started=new Promise<void>(resolve=>{fetched=resolve;}),pending=new Promise<void>(resolve=>{release=resolve;});
 const aCalls:string[]=[],bCalls:string[]=[];
 const removeA=installNativeRequest(async<T>(method:string)=>{
  aCalls.push(method);
  if(method==="host.getInfo")return {methods:["notification.getStatus","notification.requestAuthorization","notification.schedule","notification.cancel","notification.listPending","notification.openSettings"]} as T;
  return {permission:"authorized"} as T;
 });
 const removeRead=installNativeApiRequest(async()=>{fetched();await pending;return Response.json({nativeNotifications:[]});});
 let removeB:(()=>void)|undefined;
 try{
  const guard=captureNativeSessionGuard(),run=reconcileNativeNotifications();await started;
  removeA();removeB=installNativeRequest(async<T>(method:string)=>{bCalls.push(method);return {} as T;});release();
  await assert.rejects(run,/Account changed/);assert.throws(guard,/Account changed/);
  assert.deepEqual(bCalls,[]);assert(!aCalls.includes("notification.schedule"));
 }finally{release();removeA();removeB?.();removeRead();if(original)Object.defineProperty(globalThis,"window",original);else Reflect.deleteProperty(globalThis,"window");}
});
