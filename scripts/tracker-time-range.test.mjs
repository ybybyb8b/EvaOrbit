import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("Tracker time range migration preserves old fields, entries and keys; create/edit derive duration", () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"eo-tracker-range-"));
  const databasePath=path.join(directory,"test.db");
  const loader=pathToFileURL(path.join(process.cwd(),"scripts/typescript-test-loader.mjs")).href;
  function run(program) { const result=spawnSync(process.execPath,["--experimental-loader",loader,"--input-type=module","--eval",program],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:databasePath,VERCEL:""}});assert.equal(result.status,0,result.stderr||result.stdout); }
  try {
    run(`import * as db from './src/lib/db.ts'; import {parseNewTracker,parseNewTrackerField,parseNewTrackerEntry} from './src/lib/validation.ts';
      const tracker=db.createTracker(parseNewTracker({name:'Existing'}));
      const field=db.createTrackerField(parseNewTrackerField({name:'Legacy number',type:'number',unit:'hours'},tracker.id));
      db.createTrackerEntry(parseNewTrackerEntry({values:{[field.key]:2}},tracker.id));
      const archived=db.createTrackerField(parseNewTrackerField({name:'Archived',type:'text'},tracker.id));db.deleteTrackerField(archived.id);`);
    const old=new DatabaseSync(databasePath);
    const schema=old.prepare("SELECT sql FROM sqlite_master WHERE name='tracker_fields'").get().sql.replace(/CREATE TABLE "?tracker_fields"?/,"CREATE TABLE tracker_fields_old").replace(",'time_range'","");
    old.exec(`BEGIN; ${schema}; INSERT INTO tracker_fields_old SELECT * FROM tracker_fields; DROP TABLE tracker_fields; ALTER TABLE tracker_fields_old RENAME TO tracker_fields; CREATE INDEX idx_tracker_fields_tracker ON tracker_fields(tracker_id,sort_order,id); CREATE UNIQUE INDEX idx_tracker_fields_key ON tracker_fields(tracker_id,field_key); DELETE FROM migrations WHERE version=69; UPDATE sqlite_sequence SET seq=50 WHERE name='tracker_fields'; COMMIT;`);
    const before=old.prepare("SELECT * FROM tracker_fields ORDER BY id").all();old.close();
    run(`import assert from 'node:assert/strict';import * as db from './src/lib/db.ts';import {createTrackerField,createTrackerEntry,updateTrackerEntry,getTrackerDetail} from './src/lib/services/tracker.ts';import {parseNewTrackerField,parseNewTrackerEntry,parseTrackerEntryPatch} from './src/lib/validation.ts';
      const fields=db.listTrackerFields(1);assert.equal(fields.length,2);assert.ok(fields[1].archivedAt);assert.equal(db.listTrackerEntries(1)[0].values[fields[0].key],2);
      const range=await createTrackerField(parseNewTrackerField({name:'Stay',type:'time_range',includeInStats:true,required:true},1));assert.ok(range.id>50);assert.equal(range.unit,'min');
      const entry=await createTrackerEntry(parseNewTrackerEntry({values:{[range.key]:{startAt:'2026-10-05T23:30:00+08:00',endAt:'2026-10-06T01:00:00+08:00',durationMinutes:999}}},1));assert.equal(entry.values[range.key].durationMinutes,90);assert.equal(entry.endAt,null);
      const updated=await updateTrackerEntry(entry.id,parseTrackerEntryPatch({values:{[range.key]:{startAt:'2026-10-05T23:30:00+08:00',endAt:'2026-10-06T02:00:00+08:00',durationMinutes:1}}}));assert.equal(updated.values[range.key].durationMinutes,150);
      const detail=await getTrackerDetail(1);assert.equal(detail.insights.numericFields.find(item=>item.fieldKey===range.key).average,150);
      await assert.rejects(createTrackerEntry(parseNewTrackerEntry({values:{[range.key]:{startAt:'2026-10-05T12:00:00Z',endAt:'2026-10-05T11:00:00Z'}}},1)));
      await assert.rejects(updateTrackerEntry(entry.id,{values:{[range.key]:{startAt:'2026-10-05T12:00:00Z'}}}));
      await createTrackerEntry(parseNewTrackerEntry({values:{}},1));`);
    run(`import './src/lib/db.ts';`);
    const migrated=new DatabaseSync(databasePath);
    assert.deepEqual(migrated.prepare("SELECT * FROM tracker_fields WHERE id<=2 ORDER BY id").all(),before);
    assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(),[]);
    assert.equal(migrated.prepare("SELECT count(*) AS count FROM migrations WHERE version=69").get().count,1);
    migrated.close();
  } finally { fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50}); }
});
