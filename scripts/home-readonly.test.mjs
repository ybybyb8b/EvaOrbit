import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { homeResourceKey, validateHomeResource } from "../src/lib/home-readonly.ts";

test("Home snapshot boundaries reject invalid dates, cross-account and malformed resources", () => {
  for (const key of ["2026-02-29", "2026-13-01", "../session", "latest", "2026-10-19?write=1"]) assert.throws(() => homeResourceKey({ kind:"day", key }));
  assert.deepEqual(homeResourceKey({kind:"month",key:"2026-10"}),{kind:"month",key:"2026-10"});
  const value={format:"eo-home-readonly-v1",accountId:"a",kind:"due",key:"current",capturedAt:"2026-10-19T00:00:00Z",data:[]};
  assert.equal(validateHomeResource(value,"a","due","current"),value);
  assert.throws(()=>validateHomeResource(value,"b","due","current"));
  assert.throws(()=>validateHomeResource({...value,data:{}},"a","due","current"));
  assert.throws(()=>validateHomeResource({...value,icons:{Calendar:"https://evil.invalid/icon.svg"}},"a","due","current"));
});

test("real Home day, month and reminder aggregations run behind the audited read-only repository", () => {
  const directory=mkdtempSync(path.join(tmpdir(),"eo-home-readonly-"));
  try {
    const loader=pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href;
    const result=spawnSync(process.execPath,["--experimental-loader",loader,"--input-type=module","--eval",String.raw`
      import assert from 'node:assert/strict';
      import {DatabaseSync} from 'node:sqlite';
      import {withHomeReadOnlyRepository,getRepository} from './src/lib/repositories/index.ts';
      import {getHomeDayOverview} from './src/lib/services/home-day.ts';
      import {getTimelineMonthSummary} from './src/lib/services/timeline.ts';
      import {getDueReminders} from './src/lib/services/reminder.ts';
      import {createSubscription} from './src/lib/db.ts';
      await getRepository();
      createSubscription({name:'Overdue automatic renewal',currentAmountMinor:1200,currency:'CNY',billingIntervalValue:1,billingIntervalUnit:'month',startedOn:'2026-10-01',nextRenewalOn:'2026-10-01',autoRenew:true,reminderEnabled:false,reminderDaysBefore:3,reminderTime:null,notes:'No catch-up allowed'});
      const connection=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      const tables=connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
      for(const name of tables)for(const operation of ['INSERT','UPDATE','DELETE'])connection.exec('CREATE TRIGGER "readonly_'+operation+'_'+name+'" BEFORE '+operation+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Read-only Home attempted a database write\'); END;');
      const day=await withHomeReadOnlyRepository(()=>getHomeDayOverview('2026-10-19',{readOnly:true}));
      assert.equal(day.date,'2026-10-19');
      const month=await withHomeReadOnlyRepository(()=>getTimelineMonthSummary('2026-10',{readOnly:true}));
      assert.equal(month.month,'2026-10');
      await withHomeReadOnlyRepository(()=>getDueReminders(50,new Date('2026-10-19T00:00:00Z'),{readOnly:true}));
      await assert.rejects(withHomeReadOnlyRepository(async()=>{const repository=await getRepository();return repository.createTask({title:'Forbidden'});}),/refused/);
      connection.close();
    `],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),VERCEL:""}});
    assert.equal(result.status,0,result.stderr||result.stdout);
  } finally {rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
