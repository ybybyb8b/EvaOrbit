import assert from "node:assert/strict";
import test from "node:test";
import {runNativeForegroundTasks} from "./native-foreground-tasks.ts";
import {installNativeRequest} from "./native-bridge.ts";
test("a failed EventKit or Health task does not skip unrelated foreground maintenance",async()=>{
 const order:string[]=[];
 await assert.rejects(runNativeForegroundTasks([
  {name:"EventKit",run:async()=>{order.push("eventkit");throw Error("Calendar timeout");}},
  {name:"Health",run:async()=>{order.push("health");throw Error("Health offline");}},
  {name:"Notifications",run:async()=>{order.push("notifications");}}
 ]),/Calendar timeout.*Health offline/);
 assert.deepEqual(order,["eventkit","health","notifications"]);
});
test("account invalidation stops the rest of foreground maintenance",async()=>{
 const remove=installNativeRequest(async()=>null as never),order:string[]=[];
 try{await assert.rejects(runNativeForegroundTasks([{name:"EventKit",run:async()=>{order.push("eventkit");remove();}},{name:"Health",run:async()=>{order.push("health");}}]),/Account changed/);assert.deepEqual(order,["eventkit"]);}finally{remove();}
});
