import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";

test("SQLite important dates save, archive, restore, reschedule and cancel without duplicate reminders", () => {
  const directory=mkdtempSync(path.join(tmpdir(),"eo-days-"));
  try {
    const result=spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",String.raw`
      import assert from 'node:assert/strict';
      import {getRepository} from './src/lib/repositories/index.ts';
      import {parseImportantDate} from './src/lib/important-dates-validation.ts';
      import {cancelReminder,completeReminder,getDueReminders} from './src/lib/services/reminder.ts';
      import {DatabaseSync} from 'node:sqlite';
      const repo=await getRepository();
      const input=parseImportantDate({title:'Anniversary',date:'2096-02-29',recurrence:'yearly',reminderTime:'09:30',reminderDaysBefore:1});
      const item=await repo.saveImportantDate(null,input);
      let reminders=await repo.listReminders({targetType:'important_date',targetId:item.id});
      assert.equal(reminders.length,1);const reminderId=reminders[0].id;
      assert.equal(reminders[0].nextDueAt,'2096-02-28T01:30:00.000Z');
      await repo.updateReminder(reminderId,{status:'sent',lastNotifiedAt:new Date().toISOString()});
      await repo.saveImportantDate(item.id,{...input,title:'Renamed'});
      assert.equal((await repo.getReminder(reminderId)).status,'sent');
      await repo.saveImportantDate(item.id,{...input,archived:true});
      assert.equal((await repo.getReminder(reminderId)).isActive,false);
      await repo.saveImportantDate(item.id,{...input,archived:false,reminderTime:'10:30'});
      assert.equal((await repo.getReminder(reminderId)).nextDueAt,'2096-02-28T02:30:00.000Z');
      assert.equal((await repo.listReminders({targetType:'important_date',targetId:item.id})).length,1);
      await assert.rejects(()=>completeReminder(reminderId),/重要日子/);
      assert.deepEqual(await getDueReminders(50,new Date('2096-03-01T00:00:00Z'),{readOnly:true}),[]);
      await cancelReminder(reminderId);assert.equal((await repo.listImportantDates())[0].reminderTime,null);
      assert.equal((await repo.getReminder(reminderId)).isActive,false);
      await repo.deleteImportantDate(item.id);assert.equal((await repo.listImportantDates()).length,0);
      const first=await repo.saveImportantDate(null,{...input,category:'Life',categoryColor:'#75846F'});
      const second=await repo.saveImportantDate(null,{...input,category:'Life'});
      assert.equal(second.categoryColor,'#75846F');
      await repo.saveImportantDate(first.id,{...input,category:'Life',categoryColor:'#718597'});
      assert.equal((await repo.listImportantDates()).find(item=>item.id===second.id).categoryColor,'#718597');
      assert.equal(await repo.saveImportantDate(999999,{...input,category:'Life',categoryColor:'#897181'}),null);
      assert.equal((await repo.listImportantDateCategories())[0].color,'#718597');
      await repo.saveImportantDate(second.id,{...input,category:'Life',categoryColor:null});
      assert.equal((await repo.listImportantDates()).find(item=>item.id===first.id).categoryColor,null);
      assert.deepEqual(await repo.listImportantDateCategories(),[{name:'Life',color:null}]);
      const lunarInput=parseImportantDate({title:'农历生日',calendar:'lunar',lunar:{year:2025,month:6,day:1,leap:true},recurrence:'yearly',reminderTime:'09:30'});
      const lunar=await repo.saveImportantDate(null,lunarInput);
      assert.equal(lunar.date,'2025-07-25');assert.deepEqual(lunar.lunar,lunarInput.lunar);
      const before=(await repo.listReminders({targetType:'important_date',targetId:lunar.id}))[0];
      const legacy={...input,title:lunar.title,date:lunar.date,reminderTime:'09:30'};
      await repo.saveImportantDate(lunar.id,legacy);
      assert.equal((await repo.listImportantDates()).find(item=>item.id===lunar.id).calendar,'lunar');
      await assert.rejects(()=>repo.saveImportantDate(lunar.id,{...legacy,date:'2025-07-26'}),/农历与公历/);
      await repo.saveImportantDate(lunar.id,{...lunarInput,lunarLeapPolicy:'skip'});
      const after=(await repo.listReminders({targetType:'important_date',targetId:lunar.id}))[0];
      assert.equal(before.id,after.id);assert.notEqual(before.nextDueAt,after.nextDueAt);
      await repo.saveImportantDate(lunar.id,{...lunarInput,archived:true});
      assert.equal((await repo.getReminder(before.id)).isActive,false);
      for(const recurrence of ['weekly','monthly']){
        const repeated=await repo.saveImportantDate(null,parseImportantDate({title:'Cycle',date:'2096-01-31',recurrence,displayMode:'elapsed',countMode:'ordinal',reminderTime:'09:30',reminderDaysBefore:1}));
        assert.equal(repeated.recurrence,recurrence);assert.equal(repeated.displayMode,'elapsed');assert.equal(repeated.countMode,'ordinal');
        assert.equal((await repo.listReminders({targetType:'important_date',targetId:repeated.id})).length,1);
        await repo.saveImportantDate(repeated.id,{...parseImportantDate({title:repeated.title,date:repeated.date,recurrence,reminderTime:'09:30',reminderDaysBefore:1}),archived:true});
        assert.equal((await repo.listReminders({targetType:'important_date',targetId:repeated.id}))[0].isActive,false);
      }
      const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
      await repo.saveImportantDateCategory('Independent category','#718597');
      const photo=await repo.saveImportantDate(null,parseImportantDate({title:'Photo day',date:'2016-05-28',category:'Independent category',countMode:'ordinal',background:{kind:'photo',image,x:40,y:60,shade:.3,zoom:1.5}}));
      assert.equal(photo.countMode,'ordinal');assert.equal(photo.categoryColor,'#718597');assert.equal(photo.background.image,undefined);
      assert.equal(await repo.getImportantDateBackground(photo.id,photo.backgroundImageVersion),image);
      assert.equal(await repo.getImportantDateBackground(photo.id,'wrong'),null);
      const cropped=await repo.saveImportantDate(photo.id,{...parseImportantDate({title:photo.title,date:photo.date}),background:{kind:'photo',x:70,y:20,shade:.5,zoom:2}});
      assert.equal(cropped.countMode,'ordinal');assert.equal(cropped.backgroundImageVersion,photo.backgroundImageVersion);assert.equal(cropped.background.zoom,2);
      await assert.rejects(()=>repo.saveImportantDate(null,parseImportantDate({title:'Missing photo',date:'2026-01-01',background:{kind:'photo'}})),/背景图片/);
      await repo.saveImportantDate(photo.id,parseImportantDate({title:photo.title,date:photo.date,background:{kind:'none'}}));
      assert.equal(await repo.getImportantDateBackground(photo.id,photo.backgroundImageVersion),null);
      assert.ok((await repo.listImportantDateCategories()).some(item=>item.name==='Independent category'&&item.color==='#718597'));
      const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
    `],{env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"qa.db"),VERCEL:""},encoding:"utf8"});
    assert.equal(result.status,0,result.stderr||result.stdout);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});


test("Days repeat migration preserves existing photos, categories, indexes and autoincrement history",()=>{
 const directory=mkdtempSync(path.join(tmpdir(),"eo-days-repeat-")),file=path.join(directory,"upgrade.db");
 const run=code=>spawnSync(process.execPath,["--experimental-loader",pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,"--input-type=module","--eval",code],{env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:file,VERCEL:""},encoding:"utf8"});
 try{
  const seed=run(`import {getRepository} from './src/lib/repositories/index.ts';import {parseImportantDate} from './src/lib/important-dates-validation.ts';const repo=await getRepository();await repo.saveImportantDateCategory('Life','#718597');await repo.saveImportantDate(null,parseImportantDate({title:'Keep me',date:'2016-05-28',category:'Life',countMode:'ordinal',background:{kind:'solid',color:'#718597'}}));`);
  assert.equal(seed.status,0,seed.stderr);
  const db=new DatabaseSync(file);
  // Recreate the previously shipped shape, with a deleted high ID and an attached index.
  db.exec("ALTER TABLE important_dates DROP COLUMN display_mode; DELETE FROM migrations WHERE version=108;");
  const schema=db.prepare("SELECT sql FROM sqlite_master WHERE name='important_dates'").get().sql;
  db.exec(schema.replace(/CREATE TABLE\s+"?important_dates"?/i,'CREATE TABLE important_dates_old').replace("'none','weekly','monthly','yearly'","'none','yearly'"));
  db.exec("INSERT INTO important_dates_old SELECT * FROM important_dates;DROP TABLE important_dates;ALTER TABLE important_dates_old RENAME TO important_dates;CREATE INDEX days_test_category ON important_dates(category);UPDATE sqlite_sequence SET seq=99 WHERE name='important_dates';");db.close();
  const migrated=run(`import assert from 'node:assert/strict';import {getRepository} from './src/lib/repositories/index.ts';import {parseImportantDate} from './src/lib/important-dates-validation.ts';const repo=await getRepository();const rows=await repo.listImportantDates();assert.equal(rows.length,1);assert.equal(rows[0].title,'Keep me');assert.equal(rows[0].countMode,'ordinal');assert.equal(rows[0].displayMode,'auto');assert.equal(rows[0].background.color,'#718597');assert.equal(rows[0].categoryColor,'#718597');const next=await repo.saveImportantDate(null,parseImportantDate({title:'Weekly',date:'2026-01-01',recurrence:'weekly'}));assert.equal(next.id,100);`);
  assert.equal(migrated.status,0,migrated.stderr);const checked=new DatabaseSync(file);assert.equal(checked.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='days_test_category'").get().n,1);assert.deepEqual(checked.prepare('PRAGMA foreign_key_check').all(),[]);checked.close();
 }finally{rmSync(directory,{recursive:true,force:true});}
});
