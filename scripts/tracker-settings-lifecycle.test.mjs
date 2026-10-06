import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import test from 'node:test';

test('Tracker settings preserve archive history, enforce ownership, and atomically purge only one property',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'eo-tracker-settings-'));
  try{
    const loader=pathToFileURL(path.join(process.cwd(),'scripts/typescript-test-loader.mjs')).href;
    const result=spawnSync(process.execPath,['--experimental-loader',loader,'--input-type=module','--eval',`
      import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
      import * as db from './src/lib/db.ts';import * as service from './src/lib/services/tracker.ts';
      import {parseNewTracker,parseNewTrackerField,parseNewTrackerEntry,parseNewTrackerReminder,parseTrackerPatch,parseTrackerFieldPatch} from './src/lib/validation.ts';
      const tracker=await service.createTracker(parseNewTracker({name:'Stay'}));
      const other=await service.createTracker(parseNewTracker({name:'Other'}));
      const field=await service.createTrackerField(parseNewTrackerField({name:'Duration',type:'number'},tracker.id));
      const keep=await service.createTrackerField(parseNewTrackerField({name:'Context',type:'text'},tracker.id));
      const outside=await service.createTrackerField(parseNewTrackerField({name:'External',type:'text'},other.id));
      const entry=await service.createTrackerEntry(parseNewTrackerEntry({values:{[field.key]:90,[keep.key]:'Kept'},note:'Keep note'},tracker.id));
      const updated=await service.updateTrackerField(tracker.id,field.id,parseTrackerFieldPatch({name:'Stay minutes',required:true,includeInStats:true}));
      assert.equal(updated.key,field.key);assert.equal(updated.type,'number');assert.equal(updated.required,true);
      assert.equal(await service.updateTrackerField(tracker.id,outside.id,{name:'Wrong'}),null);
      assert.equal(await service.purgeTrackerField(tracker.id,outside.id),false);
      assert.throws(()=>parseTrackerFieldPatch({type:'text'}));assert.throws(()=>parseTrackerPatch({archived:'yes'}));
      await service.updateTrackerField(tracker.id,field.id,parseTrackerFieldPatch({archived:true}));
      assert.equal(db.getTrackerEntry(entry.id).values[field.key],90);assert.ok(db.listTrackerFields(tracker.id).find(f=>f.id===field.id).archivedAt);
      await service.updateTrackerField(tracker.id,field.id,parseTrackerFieldPatch({archived:false}));
      assert.equal(db.listTrackerFields(tracker.id).find(f=>f.id===field.id).archivedAt,null);
      const reminder=await service.createTrackerReminder(parseNewTrackerReminder({reminderMode:'standard',periodDays:1,configuredTime:'20:00',anchorDate:'2026-10-06',timezone:'Asia/Shanghai'},tracker.id));
      const archived=await service.updateTracker(tracker.id,parseTrackerPatch({archived:true}));assert.ok(archived.archivedAt);
      assert.equal((await service.listQuickLogTrackers()).some(t=>t.id===tracker.id),false);
      assert.equal(db.getTrackerEntry(entry.id).note,'Keep note');assert.equal(db.getTrackerReminder(reminder.id).enabled,false);assert.equal(db.getReminder(reminder.reminderId).isActive,false);
      await assert.rejects(service.createTrackerEntry(parseNewTrackerEntry({values:{}},tracker.id)));
      await assert.rejects(service.updateTrackerReminder(reminder.id,parseNewTrackerReminder({enabled:true,reminderMode:'standard',periodDays:1,configuredTime:'20:00',anchorDate:'2026-10-06',timezone:'Asia/Shanghai'},tracker.id)));
      await service.updateTracker(tracker.id,parseTrackerPatch({archived:false,groupName:'Visits',quickCaptureEnabled:false}));
      assert.equal(db.getTracker(tracker.id).archivedAt,null);assert.equal(db.getTracker(tracker.id).groupName,'Visits');assert.equal(db.getTracker(tracker.id).quickCaptureEnabled,false);assert.equal(db.getTrackerReminder(reminder.id).enabled,false);
      db.updateTrackerEntry(entry.id,{values:{...entry.values,[String(field.id)]:91,['field_'+field.id]:92}});
      const connection=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      connection.exec("CREATE TRIGGER reject_field_delete BEFORE DELETE ON tracker_fields BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
      await assert.rejects(service.purgeTrackerField(tracker.id,field.id));assert.equal(db.getTrackerEntry(entry.id).values[field.key],90);assert.ok(db.listTrackerFields(tracker.id).some(f=>f.id===field.id));
      connection.exec('DROP TRIGGER reject_field_delete');
      assert.equal(await service.purgeTrackerField(tracker.id,field.id),true);
      const remaining=db.getTrackerEntry(entry.id);assert.deepEqual(remaining.values,{[keep.key]:'Kept'});assert.equal(remaining.note,entry.note);assert.equal(remaining.occurredAt,entry.occurredAt);
      assert.equal(db.listTrackerFields(other.id).length,1);assert.equal(await service.purgeTrackerField(tracker.id,field.id),false);
      assert.equal(await service.deleteTracker(tracker.id),true);assert.equal(db.getTracker(tracker.id),null);assert.equal(db.listTrackerEntries(tracker.id).length,0);assert.equal(db.listTrackerFields(tracker.id).length,0);assert.equal(db.listTrackerReminders(tracker.id).length,0);assert.equal(db.getReminder(reminder.reminderId),null);assert.ok(db.getTracker(other.id));
      assert.equal(connection.prepare('SELECT count(*) AS count FROM migrations WHERE version=70').get().count,1);assert.deepEqual(connection.prepare('PRAGMA foreign_key_check').all(),[]);connection.close();
    `],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'test.db'),VERCEL:''}});
    assert.equal(result.status,0,result.stderr||result.stdout);
  }finally{fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
