import assert from "node:assert/strict";
import test from "node:test";
import {parseImportantDate,parseImportantDatePatch,parseImportantDateCategory} from "./important-dates-validation.ts";
import {importantDateDisplay,importantDateStats,importantDateReminderAt,type ImportantDate} from "./important-dates.ts";
import {parseImportantDateBackground,importantDateBackgroundRow} from "./important-date-background.ts";

test("ordinal days include the starting day without changing countdowns, annual dates or reminders",()=>{
 const base=parseImportantDate({title:"A day",date:"2016-05-28",reminderTime:"09:00"});
 assert.equal(importantDateDisplay(base,"2016-05-28").text,"今天");
 assert.equal(importantDateDisplay({...base,countMode:"ordinal"},"2016-05-28").text,"第 1");
 assert.equal(importantDateDisplay({...base,countMode:"ordinal"},"2016-05-29",true).text,"Day 2");
 assert.equal(importantDateDisplay({...base,countMode:"ordinal"},"2016-05-27").unit,"天后");
 assert.equal(importantDateDisplay({...base,countMode:"ordinal",recurrence:"yearly"},"2017-05-28").value,366);
 assert.deepEqual(importantDateStats(base,"2026-11-27"),importantDateStats({...base,countMode:"ordinal"} as typeof base,"2026-11-27"));
 assert.equal(importantDateReminderAt(base,"2016-05-27"),importantDateReminderAt({...base,countMode:"ordinal"},"2016-05-27"));
 assert.throws(()=>parseImportantDate({...base,countMode:"other"}),/计数/);
 const current={...base,countMode:"ordinal",background:{kind:"photo",x:20,y:30,shade:.4,zoom:2},id:1,createdAt:"",updatedAt:""} as ImportantDate;
 const patched=parseImportantDatePatch({title:"Renamed"},current);
 assert.equal(patched.countMode,"ordinal");assert.deepEqual(patched.background,current.background);
});
test("backgrounds validate image signatures, size, colors and crop bounds, separating photo data from settings",()=>{
 const image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=";
 const photo=parseImportantDateBackground({kind:"photo",image,x:50,y:40,shade:.4,zoom:1.5});
 assert.deepEqual(importantDateBackgroundRow(photo),{background:{kind:"photo",x:50,y:40,shade:.4,zoom:1.5},background_image:image});
 for(const background of [{kind:"photo",x:101},{kind:"photo",shade:NaN},{kind:"photo",zoom:.5},{kind:"solid",color:"red"},{kind:"photo",image:"data:image/svg+xml;base64,AAAA"},{kind:"photo",image:image.replace("image/png","image/jpeg")},{kind:"none",image}])assert.throws(()=>parseImportantDateBackground(background));
 assert.throws(()=>parseImportantDateBackground({kind:"photo",image:"data:image/png;base64,"+Buffer.alloc(140000).toString("base64")}));
 const raw=Buffer.alloc(99999);raw.set([137,80,78,71,13,10,26,10]);assert.doesNotThrow(()=>parseImportantDateBackground({kind:"photo",image:"data:image/png;base64,"+raw.toString("base64")}));
 assert.throws(()=>parseImportantDateBackground({kind:"photo",image:"data:image/png;base64,"+Buffer.concat([raw,Buffer.from([0])]).toString("base64")}));
 assert.deepEqual(parseImportantDateCategory({name:"  Life  ",color:"#718597"}),{name:"Life",color:"#718597"});
 assert.throws(()=>parseImportantDateCategory({name:"Life",color:"red"}));
});
