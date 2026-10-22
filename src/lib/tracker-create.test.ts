import assert from "node:assert/strict";
import test from "node:test";
import {createTrackerWithProperties} from "../app/trackers/create-tracker.ts";
import type {TrackerCreateInput} from "../app/trackers/tracker-create-sheet";

const input:TrackerCreateInput={iconFile:null,draft:{name:"Shared create",groupName:"Tests",quickCaptureEnabled:false},fields:[{clientId:"field-1",name:"Choice",type:"single_select",options:"A， B",required:false,includeInStats:true,unit:"",precision:"0"}]};
test("shared online Tracker creation preserves all property types and ordering",async()=>{
 const calls:Array<{path:string;body:Record<string,unknown>}>=[];
 const result=await createTrackerWithProperties(async(path,init)=>{calls.push({path,body:JSON.parse(String(init?.body))});return Response.json({id:42});},input);
 assert.equal(result.tracker.id,42);assert.deepEqual(result.followUpErrors,[]);assert.equal(calls.length,2);assert.equal(calls[1].path,"/api/trackers/42/fields");assert.deepEqual(calls[1].body.options,["A","B"]);assert.equal(calls[1].body.type,"single_select");assert.equal(calls[1].body.defaultValue,null);
});
test("acknowledged creation survives a failed follow-up without replaying creation",async()=>{
 let creates=0;
 const result=await createTrackerWithProperties(async path=>{if(path==="/api/trackers"){creates++;return Response.json({id:42});}throw Error("lost property response");},input);
 assert.equal(creates,1);assert.equal(result.tracker.id,42);assert.equal(result.followUpErrors.length,1);assert.match(result.followUpErrors[0],/refresh before retrying/);
});
