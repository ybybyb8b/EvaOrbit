import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import test from 'node:test';

test('retirement fences old RPC clients and purges only the selected account, retaining source data',async()=>{
  const {PGlite}=await import('@electric-sql/pglite'),db=new PGlite();
  const owner='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
      create table public.food_logs(id bigint,user_id uuid,meal_type text,occurred_at timestamptz);grant select on public.food_logs to authenticated;
      insert into auth.users values('${owner}'),('${other}');
      insert into food_logs values(1,'${owner}','lunch','2026-01-01T12:00:00+08:00'),(2,'${other}','dinner','2026-01-01T19:00:00+08:00');`);
    for(const file of ['202610250001_insight_reports.sql','202610250002_insight_runs.sql','202610270002_insight_review.sql','202610270003_insight_deletion.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
    for(const user of [owner,other])await db.query(`insert into insight_reports(user_id,period_type,period_start,period_end,status) values($1,'daily','2026-01-01','2026-01-02','ready')`,[user]);
    for(const user of [owner,other]){
      const report=(await db.query('select id from insight_reports where user_id=$1',[user])).rows[0];
      await db.query("insert into insight_report_versions(user_id,report_id,version,request_key,request_hash,snapshot) values($1,$2,1,gen_random_uuid(),repeat('a',64),'{}')",[user,report.id]);
      const run=(await db.query("insert into insight_runs(user_id,date,status,report_id,report_version) values($1,'2026-01-01','succeeded',$2,1) returning id",[user,report.id])).rows[0];
      await db.query("insert into insight_run_attempts(id,user_id,run_id,attempt_number,request_key,status,base_snapshot,expected_version,lease_until) values(gen_random_uuid(),$1,$2,1,gen_random_uuid(),'succeeded','{}',0,now())",[user,run.id]);
    }
    const sources=(await db.query('select * from food_logs order by id')).rows;
    const migration=readFileSync('supabase/migrations/202610290001_insight_retirement.sql','utf8');
    await db.exec(migration);await db.exec(migration);
    const rights=(await db.query(`select p.proname,has_function_privilege('authenticated',p.oid,'execute') enabled,has_function_privilege('anon',p.oid,'execute') anonymous from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_insight_report','save_insight_report_snapshot','claim_insight_run','finish_insight_run','fail_insight_run','queue_insight_run','queue_insight_run_review','delete_insight_report')`)).rows;
    assert.equal(rights.length,8);assert(rights.every(row=>!row.enabled&&!row.anonymous));
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
    await assert.rejects(db.query("select claim_insight_run('2026-01-01',gen_random_uuid(),'{}',false)"),/permission denied/);
    assert.equal((await db.query('select count(*)::int n from food_logs')).rows[0].n,2);
    await db.exec('reset role');await db.exec('begin');await db.query("select set_config('evaorbit.retire_insight_user',$1,true)",[owner]);
    const cleanup=readFileSync('scripts/purge-insight-reports.sql','utf8');await db.exec(cleanup);await db.exec(cleanup);await db.exec('commit');
    assert.deepEqual((await db.query('select user_id from insight_reports')).rows,[{user_id:other}]);
    for(const table of ['insight_report_versions','insight_runs','insight_run_attempts'])assert.deepEqual((await db.query(`select user_id from ${table}`)).rows,[{user_id:other}]);
    assert.deepEqual((await db.query('select * from food_logs order by id')).rows,sources);
  }finally{await db.close();}
});

test('retired Web/API and local presentation files are absent',()=>{
  for(const file of ['src/app/insights/page.tsx','src/app/insights/insights-view.tsx','src/local-trackers/insights-workspace.tsx','src/app/api/insights/route.ts','src/app/api/insights/runs/route.ts','src/app/api/insights/review/route.ts','src/app/api/insights/[id]/route.ts'])assert(!existsSync(file),file);
});
