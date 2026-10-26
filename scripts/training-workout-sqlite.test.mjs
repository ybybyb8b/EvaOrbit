import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import test from 'node:test';

test('SQLite workout details preserve identity and facts; pending query, Timeline, manual CRUD and cache agree',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'eo-workout-'));
  try{
    const program=String.raw`
      import assert from 'node:assert/strict';
      import {DatabaseSync} from 'node:sqlite';
      import {getRepository} from './src/lib/repositories/index.ts';
      import {updateTrainingLog,deleteTrainingLog} from './src/lib/services/training.ts';
      import {buildTrainingTimelineEvents} from './src/lib/timeline.ts';
      import {readHealthSnapshot} from './src/lib/health-readonly.ts';
      const r=await getRepository(),db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      const manual=await r.createTrainingLog({occurredAt:'2026-10-26T06:00:00.123Z',occurredHasExplicitTime:true,trainingType:'strength',bodyParts:['背'],teacher:'',course:'',durationMinutes:30,notes:'',trainingContent:'Manual exercises'});
      assert.equal(manual.trainingContent,'Manual exercises');
      const workout={metric:'workout',operation:'upsert',sampleId:'946e6cf1-96f2-4e47-9d45-b0fab32db24d',streamId:'946e6cf1-96f2-4e47-9d45-b0fab32db24e',revision:1,startAt:'2026-10-26T06:00:00.123Z',endAt:'2026-10-26T07:00:00.456Z',timeZone:'Asia/Shanghai',timeZoneSource:'metadata',workout:{activityType:50,activityName:'traditionalStrengthTraining',durationSeconds:3540.333,activeEnergyKcal:234.567}};
      db.prepare('update training_logs set workout=?,body_parts=? where id=?').run(JSON.stringify(workout),'[]',manual.id);
      assert.equal((await r.listTrainingLogs({pendingDetails:true})).length,1);
      await updateTrainingLog(manual.id,{bodyParts:['背','核心'],trainingContent:'Rows 3 × 12',teacher:'Eva',course:'Pull',notes:'Good'});
      let log=await r.getTrainingLog(manual.id);
      assert(log.detailsCompletedAt);assert.deepEqual(log.workout,workout);assert.equal(log.trainingContent,'Rows 3 × 12');
      assert.equal((await r.listTrainingLogs({pendingDetails:true})).length,0);
      await updateTrainingLog(manual.id,{trainingContent:'Rows 4 × 12'});
      await assert.rejects(updateTrainingLog(manual.id,{occurredAt:'2026-10-26T00:00:00Z'}),/read only/);
      await assert.rejects(deleteTrainingLog(manual.id),/Apple Health/);
      const events=buildTrainingTimelineEvents(await r.listTrainingLogs());
      assert.equal(events.length,1);assert.equal(events[0].endAt,workout.endAt);assert.equal(events[0].occurredAt,workout.startAt);assert.equal(events[0].href,'/health?training='+manual.id);
      const snapshot={training:[],recentTraining:[],pendingTraining:[log]};
      assert.equal((await readHealthSnapshot(snapshot,'/api/health/training?pendingDetails=true').json())[0].id,manual.id);
      assert.equal((await readHealthSnapshot(snapshot,'/api/health/training/'+manual.id).json()).id,manual.id);
      db.prepare('update training_logs set workout_deleted=1 where id=?').run(manual.id);
      assert.equal((await r.listTrainingLogs()).length,0);await assert.rejects(updateTrainingLog(manual.id,{notes:'late edit'}),/deleted/);
      assert.equal(buildTrainingTimelineEvents([await r.getTrainingLog(manual.id)]).length,0);
      const independent=await r.createTrainingLog({...manual,id:undefined,workout:undefined,trainingContent:'Independent'});
      await r.updateTrainingLog(independent.id,{notes:'Changed'});assert(await r.deleteTrainingLog(independent.id));
      assert.equal(await r.getTrainingPlan(),null);db.close();
    `;
    const result=spawnSync(process.execPath,['--conditions=react-server','--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',program],{encoding:'utf8',timeout:30000,env:{...process.env,NODE_ENV:'development',EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'qa.db'),VERCEL:''}});
    assert.equal(result.status,0,result.stderr||result.stdout);
  }finally{fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
