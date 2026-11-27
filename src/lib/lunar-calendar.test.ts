import assert from "node:assert/strict";
import test from "node:test";
import { lunarMonths,lunarToSolar,solarToLunar,lunarDateLabel } from "./lunar-calendar.ts";
import { nextImportantDate,importantDateStats,importantDateToRow,importantDateFromRow,type ImportantDateInput } from "./important-dates.ts";
import { parseImportantDate } from "./important-dates-validation.ts";

const birthday=(year:number,month:number,day:number,leap=false):ImportantDateInput=>parseImportantDate({title:"农历生日",calendar:"lunar",lunar:{year,month,day,leap},recurrence:"yearly"});

test("lunar conversion matches HKO New Year and leap-month boundaries, including the ICU 2027 regression",()=>{
  for(const [year,date] of [[2024,"2024-02-10"],[2025,"2025-01-29"],[2026,"2026-02-17"],[2027,"2027-02-06"],[2033,"2033-01-31"]] as const)assert.equal(lunarToSolar({year,month:1,day:1,leap:false}),date);
  assert.equal(lunarToSolar({year:2025,month:6,day:1,leap:true}),"2025-07-25");
  assert.equal(lunarToSolar({year:2033,month:11,day:1,leap:true}),"2033-12-22");
  assert.deepEqual(solarToLunar("2027-02-05"),{year:2026,month:12,day:29,leap:false});
  assert.deepEqual(solarToLunar("2027-02-06"),{year:2027,month:1,day:1,leap:false});
});

test("every supported lunar day round-trips, all month boundaries are continuous, and range ends return null",()=>{
  let previous:string|null=null,count=0;
  for(let year=1901;year<=2100;year++)for(const month of lunarMonths(year))for(let day=1;day<=month.days;day++){
    const lunar={year,month:month.month,day,leap:month.leap},solar=lunarToSolar(lunar)!;
    assert.deepEqual(solarToLunar(solar),lunar);
    if(previous)assert.equal(Date.parse(solar)-Date.parse(previous),86400000);
    previous=solar;count++;
  }
  assert.ok(count>73000);
  assert.equal(solarToLunar("1901-02-18"),null);assert.equal(solarToLunar("2101-01-29"),null);
  assert.equal(lunarToSolar({year:2026,month:6,day:1,leap:true}),null);
});

test("annual lunar recurrence handles leap policies, short months, year boundaries and future original dates",()=>{
  const leap=birthday(2025,6,1,true);
  assert.equal(nextImportantDate(leap,"2026-11-27"),"2027-07-04");
  assert.equal(nextImportantDate({...leap,lunarLeapPolicy:"skip"},"2026-11-27"),"2036-07-23");
  const eve=birthday(2023,12,30);
  assert.equal(nextImportantDate(eve,"2024-02-10"),"2025-01-28");
  assert.equal(nextImportantDate(eve,"2026-11-27"),"2027-02-05");
  assert.equal(importantDateStats(eve,"2027-02-05").years,3);
  assert.equal(nextImportantDate(eve,"2101-01-29"),null);
  const future=birthday(2033,11,1,true);assert.equal(nextImportantDate(future,"2026-01-01"),"2033-12-22");
  assert.equal(nextImportantDate({...eve,recurrence:"none"},"2026-11-27"),"2024-02-09");
});

test("lunar input validation derives the real Gregorian anchor and preserves it through both repository formats",()=>{
  const input=birthday(2025,6,1,true);assert.equal(input.date,"2025-07-25");
  for(const patch of [{date:"2025-06-25"},{lunar:{year:2025,month:6,day:31,leap:true}},{lunar:{year:2025,month:6,day:1,leap:"yes"}},{lunar:{year:2026,month:6,day:1,leap:true}},{lunar:{year:1900,month:1,day:1,leap:false}},{lunarLeapPolicy:"both"}])assert.throws(()=>parseImportantDate({...input,...patch}));
  const row={...importantDateToRow(input),id:1,created_at:"",updated_at:""};
  for(const lunar_date of [row.lunar_date,JSON.stringify(row.lunar_date)])assert.deepEqual(importantDateFromRow({...row,lunar_date}),{...input,id:1,createdAt:"",updatedAt:""});
  assert.match(lunarDateLabel(input.lunar!),/闰六月初一/);
});
