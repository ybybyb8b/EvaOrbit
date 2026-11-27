import assert from "node:assert/strict";
import test from "node:test";
import { defaultStackIds, parseStackIds } from "./home-tracker-stack.ts";

test("stack defaults to existing Poo and Shower, preserves saved order and an intentionally empty stack", () => {
  const trackers = [
    {id:"3",name:"Reading",lastOccurredAt:null},
    {id:"2",name:"Shower",lastOccurredAt:null},
    {id:"1",name:"Poo",lastOccurredAt:null},
  ];
  assert.deepEqual(defaultStackIds(trackers),["1","2"]);
  assert.deepEqual(defaultStackIds(trackers.slice(0,1)),[]);
  assert.deepEqual(parseStackIds('["2","1","2"]'),["2","1"]);
  assert.deepEqual(parseStackIds('[]'),[]);
  for (const input of [null, "bad", '{}', '[1]', '["1",null]']) assert.equal(parseStackIds(input),null);
});
