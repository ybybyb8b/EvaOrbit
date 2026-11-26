import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
      const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
    `],{env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"qa.db"),VERCEL:""},encoding:"utf8"});
    assert.equal(result.status,0,result.stderr||result.stdout);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
