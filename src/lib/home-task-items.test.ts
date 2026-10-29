import test from "node:test";
import assert from "node:assert/strict";
import { homeReminderTitle, homeTaskItems } from "./home-task-items.ts";
import type { DueReminder } from "./types.ts";

const task=(id:number,title="Same title")=>({id,title,completed:false,dueTime:null,priority:"medium"});
const reminder=(id:number,targetType="task",targetId:number|null=1)=>({id,targetType,targetId,title:"Same title"} as DueReminder);

test("cat care titles use the real subject name without duplicating it or exposing module labels",()=>{
  assert.equal(homeReminderTitle({targetType:"cat",subjectLabel:"Luna",title:"体外驱虫"}),"Luna · 体外驱虫");
  assert.equal(homeReminderTitle({targetType:"cat",subjectLabel:"Luna",title:"Luna · 体外驱虫"}),"Luna · 体外驱虫");
  assert.equal(homeReminderTitle({targetType:"cat",subjectLabel:"Cat",title:"体外驱虫"}),"体外驱虫");
  assert.equal(homeReminderTitle({targetType:"cat_household",subjectLabel:"Household",title:"更换猫砂"}),"Household · 更换猫砂");
  assert.equal(homeReminderTitle({targetType:"task",subjectLabel:"Task",title:"整理照片"}),"整理照片");
});

test("merges by target identity and retains every independent reminder operation",()=>{
  const rows=homeTaskItems([task(1),task(2)],[reminder(10),reminder(11),reminder(10),reminder(12,"cat",1)]);
  assert.equal(rows.length,3);
  assert.deepEqual(rows[0].reminders.map(item=>item.id),[10,11]);
  assert.equal(rows[0].task?.id,1);
  assert.equal(rows[1].key,"reminder:12");
  assert.equal(rows[2].task?.id,2);
});
test("standalone reminders with null targets are not incorrectly merged",()=>{
  assert.equal(homeTaskItems([],[reminder(1,"custom",null),reminder(2,"custom",null)]).length,2);
});
test("different routines for the same cat remain separate; duplicate source projections merge",()=>{
  const a={...reminder(1,"cat",4),sourceType:"cat_routine",sourceId:11};
  const b={...reminder(2,"cat",4),sourceType:"cat_routine",sourceId:12};
  const c={...a,id:3};
  const rows=homeTaskItems([],[a,b,c]);
  assert.equal(rows.length,2);
  assert.deepEqual(rows[0].reminders.map(item=>item.id),[1,3]);
});
test("keeps completed tasks, future times, empty states and all rows beyond four",()=>{
  assert.deepEqual(homeTaskItems([],[]),[]);
  const tasks=Array.from({length:30},(_,id)=>({...task(id),completed:id===1,dueTime:id===2?"23:30":null}));
  const rows=homeTaskItems(tasks,[]);
  assert.equal(rows.length,30);
  assert.equal(rows[1].task?.completed,true);
  assert.equal(rows[2].task?.dueTime,"23:30");
  assert.equal(rows[0].task?.dueTime,null);
});
