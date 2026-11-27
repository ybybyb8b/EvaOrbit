import assert from "node:assert/strict";
import test from "node:test";
import {nextImportantDate,importantDateDisplay,importantDateReminderAt} from "./important-dates.ts";
import {parseImportantDate,parseImportantDatePatch} from "./important-dates-validation.ts";
import {lunarMonths,lunarToSolar} from "./lunar-calendar.ts";
import {shiftDate} from "./time.ts";

test("weekly and monthly repeats preserve their anchor through leap years, short months and range end",()=>{
 const weekly={date:"2026-11-27",recurrence:"weekly" as const};
 assert.equal(nextImportantDate(weekly,"2026-11-26"),"2026-11-27");assert.equal(nextImportantDate(weekly,"2026-11-27"),"2026-11-27");assert.equal(nextImportantDate(weekly,"2026-11-28"),"2026-12-04");
 const monthly={date:"2024-01-31",recurrence:"monthly" as const};
 for(const [today,expected] of [["2024-02-01","2024-02-29"],["2024-03-01","2024-03-31"],["2025-02-01","2025-02-28"],["2025-04-01","2025-04-30"],["2025-05-01","2025-05-31"],["2025-12-31","2025-12-31"],["2026-01-01","2026-01-31"]])assert.equal(nextImportantDate(monthly,today),expected);
 assert.equal(nextImportantDate({date:"2026-01-01",recurrence:"weekly"},"9999-12-31"),null);
 assert.equal(nextImportantDate({date:"2026-01-01",recurrence:"monthly"},"9999-12-31"),null);
});
test("monthly lunar dates include leap months, clamp day 30, and restore it in long months",()=>{
 const original={year:2025,month:1,day:30,leap:false};const date=lunarToSolar(original)!;
 const item={date,calendar:"lunar" as const,lunar:original,recurrence:"monthly" as const};
 let last="";
 for(const month of [...lunarMonths(2025),...lunarMonths(2026)]){
  const expected=shiftDate(month.date,Math.min(30,month.days)-1);if(expected<date)continue;
  assert.equal(nextImportantDate(item,month.date),expected);assert.equal(nextImportantDate(item,expected),expected);assert.ok(expected>last);last=expected;
 }
 const leap=lunarToSolar({year:2025,month:6,day:30,leap:true},true)!;assert.equal(nextImportantDate(item,leap),leap);
 assert.equal(nextImportantDate(item,"2101-02-01"),null);
});
test("count direction and start-day inclusion are independent of repeat and reminders",()=>{
 const base=parseImportantDate({title:"Month",date:"2025-01-31",recurrence:"monthly",reminderTime:"09:00",reminderDaysBefore:1});
 assert.equal(importantDateDisplay(base,"2025-03-01").value,30);
 assert.equal(importantDateDisplay({...base,displayMode:"elapsed"},"2025-03-01").value,29);
 assert.equal(importantDateDisplay({...base,displayMode:"elapsed",countMode:"ordinal"},"2025-03-01").text,"第 30");
 assert.equal(importantDateDisplay({...base,displayMode:"countdown",countMode:"ordinal"},"2025-03-01").unit,"天后");
 assert.equal(importantDateReminderAt(base,"2025-03-01"),importantDateReminderAt({...base,displayMode:"elapsed",countMode:"ordinal"},"2025-03-01"));
 assert.equal(importantDateDisplay({...base,displayMode:"elapsed"},"2025-01-30").unit,"天后");
 for(const recurrence of ["weekly","monthly"]){const max=recurrence==="weekly"?6:27;assert.throws(()=>parseImportantDate({...base,recurrence,reminderDaysBefore:max+1}),/跨越/);assert.doesNotThrow(()=>parseImportantDate({...base,recurrence,reminderDaysBefore:max}));}
 assert.throws(()=>parseImportantDate({...base,displayMode:"invalid"}),/展示/);
 const current={...base,id:1,createdAt:"",updatedAt:"",displayMode:"elapsed" as const,countMode:"ordinal" as const};assert.equal(parseImportantDatePatch({note:"Keep settings"},current).displayMode,"elapsed");
});
