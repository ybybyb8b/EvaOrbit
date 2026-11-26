import assert from "node:assert/strict";
import test from "node:test";
import { calendarDayDifference, importantDateStats, importantDateInYear, importantDateReminderAt, importantDateFromRow, importantDateToRow, nextImportantDate, sortImportantDates, type ImportantDateInput } from "./important-dates.ts";
import { parseImportantDate } from "./important-dates-validation.ts";
import { reminderSourceAllows } from "./reminder-source-registry.ts";
import { cacheReadPolicy, dataDependencies } from "./cache-policy.ts";
import { allowsBusinessRequest } from "./business-request-policy.ts";
import { featuredImportantDates, importantDateCategoryColor } from "./important-dates.ts";
const draft = (patch: Partial<ImportantDateInput> = {}): ImportantDateInput => ({ title:"A day",date:"2024-02-29",recurrence:"yearly",category:"Life",note:"",pinned:false,archived:false,reminderTime:null,reminderDaysBefore:0,...patch });

test("featured dates prioritize manual pins, fall back to the nearest day, and ignore archived dates",()=>{
  const item=(id:number,patch:Partial<ImportantDateInput>)=>({...draft({recurrence:"none",...patch}),id,createdAt:"",updatedAt:""});
  const items=[item(1,{date:"2026-11-26"}),item(2,{date:"2026-11-27"}),item(3,{date:"2026-01-01",pinned:true}),item(4,{date:"2026-11-26",pinned:true,archived:true})];
  assert.equal(featuredImportantDates(items,"2026-11-26")[0].id,3);
  assert.deepEqual(featuredImportantDates([...items,{...items[1],id:5},{...items[1],id:6}],"2026-11-26").map(item=>item.id),[3,1,2]);
  assert.equal(featuredImportantDates(items.map(item=>({...item,pinned:false})),"2026-11-26")[0].id,1);
  assert.deepEqual(sortImportantDates(items,"2026-11-26",false).map(item=>item.id),[1,4,2,3]);
  assert.equal(featuredImportantDates(items.map(item=>({...item,archived:true})),"2026-11-26").length,0);
  assert.equal(importantDateCategoryColor("Life"),importantDateCategoryColor(" Life "));
  assert.equal(importantDateCategoryColor("Life","#ABCDEF"),"#ABCDEF");
  assert.equal(parseImportantDate({...draft(),categoryColor:null}).categoryColor,null);
  for(const patch of [{categoryColor:"red"},{categoryColor:"#fff"},{category:"",categoryColor:"#ABCDEF"}]) assert.throws(()=>parseImportantDate({...draft(),...patch}));
  assert.equal(allowsBusinessRequest("/api/important-dates/categories","GET"),true);
});

test("important dates preserve their original date across anniversaries, leap years and year boundaries", () => {
  const item=draft();
  assert.deepEqual(importantDateStats(item,"2025-02-28"),{next:"2025-02-28",remaining:0,elapsed:365,years:1});
  assert.equal(nextImportantDate(item,"2025-03-01"),"2026-02-28");
  assert.equal(importantDateInYear(item.date,2028),"2028-02-29");
  assert.equal(item.date,"2024-02-29");
  assert.equal(nextImportantDate(draft({date:"2026-01-01"}),"2026-12-31"),"2027-01-01");
  assert.equal(nextImportantDate(draft({date:"2030-01-01"}),"2026-12-31"),"2030-01-01");
  assert.equal(nextImportantDate(draft({date:"2024-01-01"}),"9999-12-31"),null);
  assert.equal(calendarDayDifference("2026-03-08","2026-03-09"),1);
  assert.equal(importantDateStats(draft({recurrence:"none"}),"2025-02-28").remaining,-365);
});

test("reminder times are explicit and independent of date-only events; archive and one-time past dates cancel", () => {
  assert.equal(importantDateReminderAt(draft(),"2026-02-01"),null);
  assert.equal(importantDateReminderAt(draft({reminderTime:"09:30",reminderDaysBefore:1}),"2026-02-01"),"2026-02-27T01:30:00.000Z");
  assert.equal(importantDateReminderAt(draft({reminderTime:"09:30",archived:true}),"2026-02-01"),null);
  assert.equal(importantDateReminderAt(draft({reminderTime:"09:30",recurrence:"none"}),"2026-02-01"),null);
  assert.equal(reminderSourceAllows("important_date","web_push"),true);
  assert.equal(reminderSourceAllows("important_date","native_local"),false);
});

test("important dates validate boundaries and round-trip storage without inventing times", () => {
  const input=parseImportantDate({...draft(),title:"  Anniversary  "});
  assert.equal(input.title,"Anniversary");assert.equal(input.reminderTime,null);
  const item=importantDateFromRow({...importantDateToRow(input),id:1,created_at:"created",updated_at:"updated"});
  assert.deepEqual(item,{...input,id:1,createdAt:"created",updatedAt:"updated"});
  for(const patch of [{date:"2026-02-29"},{date:"2026-04-31"},{date:"0000-01-01"},{date:"2026-01-01T00:00:00Z"},{title:" "},{pinned:"yes"},{recurrence:"monthly"},{reminderTime:"24:00"},{reminderDaysBefore:1.5},{reminderDaysBefore:367},{user_id:"another"}]) assert.throws(()=>parseImportantDate({...draft(),...patch}),JSON.stringify(patch));
  const items=[{...item,id:1,date:"2026-11-30"},{...item,id:2,date:"2026-01-01",recurrence:"none" as const},{...item,id:3,date:"2026-12-01",pinned:true}];
  assert.deepEqual(sortImportantDates(items,"2026-11-26").map(item=>item.id),[3,1,2]);
  assert.ok(cacheReadPolicy("/api/important-dates"));
  assert.ok(dataDependencies("/api/home-day").includes("important-dates"));
  assert.equal(allowsBusinessRequest("/api/important-dates/1","PUT"),true);
  assert.equal(allowsBusinessRequest("/api/important-dates/1","PATCH"),false);
});
