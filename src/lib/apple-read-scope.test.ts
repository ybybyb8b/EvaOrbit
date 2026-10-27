import assert from "node:assert/strict";
import test from "node:test";
import {appleDateInScope,appleItemInScope,appleReadStart,calendarReadPage,calendarPriorityWindow} from "./apple-read-scope.ts";
import {eventKitCalendarSyncRange} from "./eventkit-sync.ts";
import {eventKitWorkState} from "./eventkit-work-state.ts";

test("Apple scope includes October 1 in the object's timezone and has no upper business date",()=>{
 assert.equal(appleDateInScope("2026-09-30"),false);assert.equal(appleDateInScope("2026-10-01"),true);
 assert.equal(appleDateInScope("2026-09-30T10:00:00Z","Pacific/Kiritimati"),true);
 assert.equal(appleDateInScope("2026-09-30T09:59:59Z","Pacific/Kiritimati"),false);
 assert.equal(appleDateInScope("2099-12-31"),true);assert.equal(appleDateInScope("2026-99-99"),false);
 assert.equal(eventKitCalendarSyncRange().to,undefined);
 let cursor=appleReadStart();for(let page=0;page<8;page++)cursor=calendarReadPage(cursor).to;
 assert.equal(cursor.getFullYear(),2028);assert.equal(cursor.getMonth(),9,"Paging continues after October 2027");
 const recent=calendarPriorityWindow(new Date(2026,9,2));assert.equal(recent.from.getTime(),appleReadStart().getTime());
});

test("Reminder scope uses due or completion dates and creation date only when undated",()=>{
 assert.equal(appleItemInScope("reminder",{dueDate:"2026-09-30",createdAt:"2026-10-05T00:00:00Z"}),false);
 assert.equal(appleItemInScope("reminder",{dueDate:"2026-10-01",createdAt:"2020-01-01T00:00:00Z"}),true);
 assert.equal(appleItemInScope("reminder",{completed:true,completionDate:"2026-10-05T00:00:00Z",dueDate:"2026-09-30"}),true);
 assert.equal(appleItemInScope("reminder",{createdAt:"2026-10-02T00:00:00Z"}),true);
 assert.equal(appleItemInScope("reminder",{createdAt:"2026-09-20T00:00:00Z"}),false);
 assert.equal(appleItemInScope("reminder",{}),false,"Unknown creation dates are not invented");
});

test("work checkpoints resume per account, source and installation and reject stale-account saves",()=>{
 const previous=globalThis.localStorage,values=new Map([["evaorbit.eventkit.account.v1","account-A"]]);
 globalThis.localStorage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}} as Storage;
 try{
  const a=eventKitWorkState("install","calendar",["source"]);a.state.cursor="2028-01-01";a.state.checked=["opaque-hash"];a.state.foregroundDone=true;a.save();
  assert.equal(eventKitWorkState("install","calendar",["source"]).state.cursor,"2028-01-01");
  assert.equal(eventKitWorkState("other-install","calendar",["source"]).state.cursor,"2026-10-01");
  assert.equal(eventKitWorkState("install","calendar",["other-source"]).state.cursor,"2026-10-01");
  values.set("evaorbit.eventkit.account.v1","account-B");
  assert.equal(eventKitWorkState("install","calendar",["source"]).state.checked.length,0);
  assert.throws(()=>a.save(),/Account changed/);
 }finally{globalThis.localStorage=previous;}
});
