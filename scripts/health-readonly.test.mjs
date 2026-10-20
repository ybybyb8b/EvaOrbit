import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('Health aggregation reuses services without business writes, preserves date-only records and rejects writes',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eo-health-readonly-'));
 try{
  const result=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',String.raw`
   import assert from 'node:assert/strict';
   import {DatabaseSync} from 'node:sqlite';
   import {seedHealth} from './scripts/health-readonly-fixture.mjs';
   import {getRepository,withHealthReadOnlyRepository} from './src/lib/repositories/index.ts';
   import {getHealthReadonlySnapshot} from './src/lib/services/health-readonly.ts';
   import {readHealthSnapshot,validateHealthSnapshot} from './src/lib/health-readonly.ts';
   const {record}=await seedHealth();
   const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
   for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const op of ['INSERT','UPDATE','DELETE'])db.exec('CREATE TRIGGER "health_no_'+op+'_'+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Health readonly wrote business data\'); END;');
   const snapshot=await getHealthReadonlySnapshot('a');
   assert.equal(snapshot.records[0].occurredHasExplicitTime,false);
   assert.equal(snapshot.weights[0].occurredHasExplicitTime,false);
   assert.equal(snapshot.flows[0].occurredHasExplicitTime,false);
   assert.equal(snapshot.plan.currentDayId,'day-1');
   assert.equal(snapshot.energy.totalExpenditureKcal,null);
   assert.equal(snapshot.reminders.length,0,'readonly must not create a medication reminder');
   for(const p of ['/api/health/records?status=active','/api/health/weight?limit=1000','/api/health/training/plan','/api/health/training/suggestions','/api/health/periods?activeOnly=true','/api/health/menstrual-flow?limit=30','/api/health/medications?limit=100','/api/health/medication-doses?limit=30','/api/notifications','/api/health/sleep?date='+snapshot.today,'/api/nutrition/daily?date='+snapshot.today])assert.equal(readHealthSnapshot(snapshot,p).status,200,p);
   assert.equal((await readHealthSnapshot(snapshot,'/api/health/records/'+record.id).json()).title,record.title);
   assert.equal(readHealthSnapshot(snapshot,'/api/health/sleep?date=2000-01-01').status,404);
   for(const method of ['POST','PUT','PATCH','DELETE'])assert.throws(()=>readHealthSnapshot(snapshot,'/api/health/records',{method}),/refused a write/);
   assert.throws(()=>readHealthSnapshot(snapshot,'/api/native/devices'),/refused/);
   assert.throws(()=>validateHealthSnapshot(snapshot,'b'),/cache preserved/);
   for(const change of [v=>v.weights.push(v.weights[0]),v=>v.flows[0].occurredHasExplicitTime=null,v=>v.sleep.date='2000-01-01',v=>v.plan.days[0].videoUrls=['javascript:alert(1)'],v=>v.energy.totalExpenditureKcal=NaN]){const invalid=structuredClone(snapshot);change(invalid);assert.throws(()=>validateHealthSnapshot(invalid,'a'));}
   await assert.rejects(withHealthReadOnlyRepository(async()=>(await getRepository()).deleteHealthRecord(record.id)),/refused/);
   assert.equal((await (await getRepository()).getTrainingPlan()).currentDayId,'day-1');
   db.close();
  `],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(dir,'test.db'),VERCEL:''}});
  assert.equal(result.status,0,result.stderr||result.stdout);
 }finally{rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
