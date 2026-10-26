import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {parseHealthKitReadChanges} from '../src/lib/healthkit-read.ts';
import {trainingTemplate,trainingDayDraft} from '../src/lib/training-plan.ts';

export const workoutFixture = () => ({operation:'upsert',metric:'workout',sampleId:randomUUID(),streamId:randomUUID(),revision:1,
  startAt:'2026-10-26T06:00:00.123Z',endAt:'2026-10-26T07:00:00.456Z',timeZone:'Asia/Shanghai',timeZoneSource:'metadata',
  sourceName:'Synthetic Watch',sourceBundle:'test.workout',syncVersion:1,
  workout:{activityType:50,activityName:'traditionalStrengthTraining',durationSeconds:3540.333,activeEnergyKcal:234.567,distance:120.456,distanceUnit:'m',deviceModel:'Test Watch'}});

test('Workout wire preserves raw precision, rejects malformed facts and accepts tombstones',()=>{
  const workout=workoutFixture();
  assert.deepEqual(parseHealthKitReadChanges([workout])[0],workout);
  for(const facts of [{durationSeconds:-1},{activityType:1.1},{distance:-1},{distanceUnit:'km'},{activeEnergyKcal:Infinity},{deviceModel:4}])assert.throws(()=>parseHealthKitReadChanges([{...workout,workout:{...workout.workout,...facts}}]));
  assert.equal(parseHealthKitReadChanges([{metric:'workout',operation:'delete',sampleId:workout.sampleId,streamId:workout.streamId,revision:2}])[0].operation,'delete');
});

test('Workout migration: idempotency, details, stale retries, deletions, RLS, atomicity, energy and plans',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;`);
    for(const migration of ['202608310002_training_logs','202609010001_healthkit_energy','202610050002_healthkit_sleep_read_samples','202610150001_training_plans','202610260003_training_session_details','202610270001_healthkit_workouts'])await db.exec(readFileSync(`supabase/migrations/${migration}.sql`,'utf8'));
    const owner=randomUUID(),other=randomUUID(),installation=randomUUID();
    await db.query('insert into auth.users values($1),($2)',[owner,other]);
    const manual=(await db.query(`insert into training_logs(user_id,occurred_at,training_type,body_parts,notes) values($1,now(),'mixed','["全身"]','legacy') returning *`,[owner])).rows[0];
    await db.exec(readFileSync('supabase/migrations/202610270001_healthkit_workouts.sql','utf8'));
    assert.equal((await db.query('select notes from training_logs where id=$1',[manual.id])).rows[0].notes,'legacy');
    const fixture=workoutFixture();
    const ingest=async(changes,user=owner,device=installation)=> (await db.query('select ingest_healthkit_read_changes($1::uuid,$2::uuid,$3::jsonb,$4::text[]) as result',[user,device,JSON.stringify(changes),['sleep','workout']])).rows[0].result;
    assert.equal((await ingest([fixture])).accepted,1);
    const original=(await db.query('select * from training_logs where workout_sample_id=$1',[fixture.sampleId])).rows[0];
    assert.equal(original.training_type,'strength');assert.equal(original.workout.workout.durationSeconds,3540.333);assert.equal(original.details_completed_at,null);
    assert.equal((await ingest([fixture])).accepted,0);
    await ingest([fixture],owner,randomUUID());
    assert.equal((await db.query('select count(*)::integer as n from training_logs where workout_sample_id=$1',[fixture.sampleId])).rows[0].n,1);
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[owner]);
    await db.exec('set role authenticated');
    await db.query(`update training_logs set body_parts='["背","核心"]',training_content='Rows 3 × 12',teacher='Eva',course='Pull day',notes='Felt good' where id=$1`,[original.id]);
    let row=(await db.query('select * from training_logs where id=$1',[original.id])).rows[0];
    assert(row.details_completed_at);assert.deepEqual(row.workout,fixture);assert.equal(row.training_content,'Rows 3 × 12');assert.equal(row.teacher,'Eva');assert.equal(row.course,'Pull day');assert.equal(row.notes,'Felt good');
    await db.query(`update training_logs set training_content='Rows 4 × 12' where id=$1`,[original.id]);
    await assert.rejects(db.query(`update training_logs set duration_minutes=99 where id=$1`,[original.id]),/read only/);
    await assert.rejects(db.query(`delete from training_logs where id=$1`,[original.id]),/Apple Health/);
    await assert.rejects(ingest([fixture]),/permission denied/);
    await db.exec('reset role');
    const updated={...fixture,revision:2,workout:{...fixture.workout,activeEnergyKcal:250.888}};
    await ingest([updated]);await ingest([fixture]);
    row=(await db.query('select * from training_logs where id=$1',[original.id])).rows[0];
    assert.equal(row.training_content,'Rows 4 × 12');assert.deepEqual(row.body_parts,['背','核心']);assert.equal(row.workout.workout.activeEnergyKcal,250.888);
    assert.equal((await db.query('select count(*)::integer as n from healthkit_daily_energy')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::integer as n from training_plans')).rows[0].n,0);
    // Failed batches commit neither receipts nor earlier changes: offline replay remains safe.
    const good=workoutFixture(),bad={...workoutFixture(),workout:{activityType:50,durationSeconds:-1}};
    await assert.rejects(ingest([good,bad]),/Invalid workout/);
    assert.equal((await db.query('select count(*)::integer as n from training_logs where workout_sample_id=$1',[good.sampleId])).rows[0].n,0);
    assert.equal((await ingest([good])).accepted,1);
    const sleep={...workoutFixture(),metric:'sleep',stage:5,workout:undefined};
    assert.equal((await ingest([sleep])).accepted,1,'existing read-only metrics still use original ingest');
    await ingest([fixture],other);
    const deleted={metric:'workout',operation:'delete',sampleId:fixture.sampleId,streamId:fixture.streamId,revision:3};
    await ingest([deleted]);await ingest([updated]);await ingest([{...fixture,streamId:randomUUID(),revision:99}],owner,randomUUID());
    row=(await db.query('select * from training_logs where id=$1',[original.id])).rows[0];
    assert.equal(row.workout_deleted,true);assert.equal(row.training_content,'Rows 4 × 12','deletion retains user details');
    const absent=workoutFixture();await ingest([{...deleted,sampleId:absent.sampleId}]);await ingest([absent]);
    assert.equal((await db.query('select count(*)::integer as n from training_logs where workout_sample_id=$1',[absent.sampleId])).rows[0].n,0,'delete before discovery cannot resurrect');
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[other]);await db.exec('set role authenticated');
    assert.equal((await db.query('select * from training_logs')).rows.length,1,'account isolated');
    assert.equal((await db.query('select workout_deleted from training_logs')).rows[0].workout_deleted,false);
    await db.exec('reset role');
    // Real service-role grants, not only owner execution.
    await db.exec('set role service_role');
    // Supabase service_role bypasses RLS. PGlite has no built-in Supabase roles.
    await db.exec('reset role;alter role service_role bypassrls;set role service_role');
    assert.equal((await ingest([workoutFixture()])).accepted,1);
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[owner]);await db.exec('set role authenticated');
    const template=trainingTemplate();
    await db.query('select save_training_plan(0,$1,$2::jsonb,$3)',[template.name,JSON.stringify(template.days),template.currentDayId]);
    const completion={occurredAt:'2026-10-26T04:00:00Z',occurredHasExplicitTime:false,...trainingDayDraft({...template,version:1,updatedAt:''}),trainingContent:'Manual planned practice'};
    const key=randomUUID();
    const complete=async()=> (await db.query('select complete_training_plan(1,$1,$2::uuid,$3::jsonb) as result',[template.currentDayId,key,JSON.stringify(completion)])).rows[0].result;
    const done=await complete();
    assert.equal(done.log.training_content,'Manual planned practice');assert.equal(done.plan.current_day_id,'day-2');
    assert.equal((await complete()).log.id,done.log.id,'manual completion still advances exactly once');
  } finally {await db.close();}
});
