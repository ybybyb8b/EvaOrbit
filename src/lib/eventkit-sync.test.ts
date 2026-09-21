import assert from "node:assert/strict";
import test from "node:test";
import { mergeEventKitSnapshots } from "./eventkit-sync.ts";

test("three-way reconcile merges non-overlapping fields",()=>{const base={title:"Dentist",notes:"",startAt:"2026-09-21T02:00:00Z"},eo={...base,notes:"bring card"},apple={...base,startAt:"2026-09-21T03:00:00Z"},result=mergeEventKitSnapshots(base,eo,apple);assert.deepEqual(result.conflicts,[]);assert.equal(result.merged.notes,"bring card");assert.equal(result.merged.startAt,"2026-09-21T03:00:00Z");});
test("three-way reconcile reports same-field conflicts",()=>{const base={title:"A"},result=mergeEventKitSnapshots(base,{title:"EO"},{title:"Apple"});assert.deepEqual(result.conflicts,["title"]);});
test("equal edits suppress echo conflicts",()=>{const base={completed:false},result=mergeEventKitSnapshots(base,{completed:true},{completed:true});assert.deepEqual(result.conflicts,[]);assert.equal(result.merged.completed,true);});
