import test from "node:test";
import assert from "node:assert/strict";
import { homeCompletions } from "./home-completions.ts";
import type { Reminder, ReminderOccurrence, TimelineEvent } from "./types.ts";
const record=(id:number,patch:Partial<Reminder>={},occ:Partial<ReminderOccurrence>={})=>({reminder:{id,title:"Flea treatment",targetType:"cat",targetId:4,...patch} as Reminder,subjectLabel:"Luna",occurrence:{id,reminderId:id,action:"completed",scheduledFor:"2026-10-28T01:00:00.000Z",actedAt:"2026-10-28T16:10:00.000Z",createdEventId:8,...occ} as ReminderOccurrence});
const event=(patch:Partial<TimelineEvent>={})=>({id:"cat:event:8",sourceId:8,sourceType:"cat",eventType:"cat.care",title:"Flea treatment",occurredAt:"2026-10-28T16:10:00.000Z",hasExplicitTime:true,href:"/cats/4",relatedPets:[4],metadata:{kind:"event"},...patch} as TimelineEvent);
test("completion day uses Shanghai midnight, not due day or UTC day; skips are excluded",()=>{
 const rows=homeCompletions("2026-10-29",[record(1),record(2,{}, {action:"skipped"}),record(4,{}, {actedAt:"2026-10-28T15:59:59.000Z"})],[]);
 assert.equal(rows.length,1);assert.equal(rows[0].title,"Luna · Flea treatment");
 assert.equal(homeCompletions("2026-10-28",[record(1)],[]).length,0);
});
test("completion is not duplicated by its care event or retry, but different occurrences and routines remain",()=>{
 const a=record(1), b=record(2,{title:"Flea treatment"},{createdEventId:9});
 const rows=homeCompletions("2026-10-29",[a,a,b,record(1,{}, {scheduledFor:"2026-10-29T01:00:00.000Z",createdEventId:10})],[event()]);
 assert.equal(rows.length,3);
});
test("direct care and payment records remain visible without a reminder and date-only payment has no invented time",()=>{
 const rows=homeCompletions("2026-10-29",[],[event(),event({id:"subscription:2",sourceType:"subscription",eventType:"subscription.paid",title:"Renewal",occurredAt:"2026-10-29T12:00:00.000Z",hasExplicitTime:false,href:"/subscriptions/2",metadata:{subscriptionId:2,scheduledFor:"2026-10-28"}})],new Map([[4,"Luna"]]));
 assert.equal(rows.length,2);assert.equal(rows[0].title,"Luna · Flea treatment");assert.equal(rows[1].hasExplicitTime,false);
});
test("ordinary task completion uses its task row; subscription payment and reminder completion count once",()=>{
 const task=record(5,{targetType:"task",targetId:1});
 const payment=event({id:"subscription:2",sourceType:"subscription",eventType:"subscription.paid",metadata:{subscriptionId:2,scheduledFor:"2026-10-28"}});
 const rows=homeCompletions("2026-10-29",[task,record(6,{targetType:"subscription",targetId:2})],[payment]);
 assert.equal(rows.length,1);assert.equal(rows[0].href,"/subscriptions/2");
});

test("duplicate projections for one routine occurrence also suppress both generated care events",()=>{
 const a=record(1,{sourceType:"cat_routine",sourceId:12});
 const b=record(2,{sourceType:"cat_routine",sourceId:12},{createdEventId:9});
 const rows=homeCompletions("2026-10-29",[a,b],[event(),event({id:"cat:event:9",sourceId:9})]);
 assert.equal(rows.length,1);
});
