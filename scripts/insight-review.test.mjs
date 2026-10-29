import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";

const owner="10000000-0000-4000-8000-000000000001",other="20000000-0000-4000-8000-000000000002";
const base=(fingerprint="a".repeat(64),modern=true)=>({summary:"当天的午餐和晚餐均已记录。",method:"ai",agent:"ChatGPT Scheduled Task",revisionNote:"每日复盘",findings:[],evidence:[],input:{capturedAt:"2026-01-02T00:00:00Z",fingerprint,...modern?{fingerprintVersion:2}:{},coverage:{},metrics:{},limitations:[]}});

test("upgrade preserves AI reading, gates meals, fences reanalysis generations and replays the original version",async()=>{
 const{PGlite}=await import("@electric-sql/pglite"),db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table public.food_logs(id bigint generated always as identity primary key,user_id uuid,meal_type text,occurred_at timestamptz);
   insert into auth.users values('${owner}'),('${other}');insert into food_logs(user_id,meal_type,occurred_at) values('${owner}','lunch','2026-01-01T12:00:00+08:00'),('${owner}','late_night','2026-01-01T01:00:00+08:00');`);
  for(const file of ['202610250001_insight_reports.sql','202610250002_insight_runs.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
  const save=async(snapshot,version,key=randomUUID())=>(await db.query("select save_insight_report('2026-01-01','2026-01-02',$1,$2::uuid,$3,$4::jsonb) as result",[version,key,'c'.repeat(64),JSON.stringify(snapshot)])).rows[0].result;
  const legacy=await save(base('a'.repeat(64),false),0);await save({...base('a'.repeat(64),false),method:'rule'},1);
  const oldAttempt=(await db.query("select claim_insight_run('2026-01-02',$1::uuid,$2::jsonb,false) as result",[randomUUID(),JSON.stringify(base('a'.repeat(64),false))])).rows[0].result;
  await db.query('select finish_insight_run($1::uuid,$2::jsonb,$3)',[oldAttempt.attempt.id,JSON.stringify(base('a'.repeat(64),false)),'e'.repeat(64)]);
  const claim=async(snapshot,key=randomUUID())=>(await db.query("select claim_insight_run('2026-01-01',$1::uuid,$2::jsonb,false) as result",[key,JSON.stringify(snapshot)])).rows[0].result;
  const finish=async(id,snapshot,hash='d'.repeat(64))=>(await db.query('select finish_insight_run($1::uuid,$2::jsonb,$3) as result',[id,JSON.stringify(snapshot),hash])).rows[0].result;
  const queue=async(fp,generation)=>(await db.query("select queue_insight_run('2026-01-01',$1,$2) as result",[fp,generation])).rows[0].result;
  await db.exec('reset role');const migration=readFileSync('supabase/migrations/202610270002_insight_review.sql','utf8');await db.exec(migration);await db.exec(migration);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
  let report=(await db.query('select * from insight_reports')).rows[0];assert.equal(report.id,legacy.report.id);assert.equal(report.current_version,2);assert.equal(report.reading_version,1);assert.equal(report.reading_method,'ai');
  await assert.rejects(save(base(),2),/INSIGHT_MISSING_MEALS/);await assert.rejects(claim(base()),/INSIGHT_MISSING_MEALS/);assert.equal((await db.query("select * from insight_runs where date='2026-01-01'")).rows.length,0);const upgraded=(await db.query('select * from insight_runs where id=$1',[oldAttempt.run.id])).rows[0];assert.equal(upgraded.generation,1);assert.equal(upgraded.input_fingerprint,'a'.repeat(64));assert.equal((await finish(oldAttempt.attempt.id,base('a'.repeat(64),false),'e'.repeat(64))).version.version,1);
  await db.exec(`reset role;insert into food_logs(user_id,meal_type,occurred_at) values('${owner}','dinner','2026-01-01T19:00:00+08:00');set role authenticated;set request.jwt.claim.sub='${owner}'`);
  const first=await claim(base());assert.equal(first.run.generation,1);assert.equal(first.attempt.attempt_number,1);
  const completed=await finish(first.attempt.id,base());assert.equal(completed.version.version,3);assert.equal(completed.report.reading_version,3);
  await save({...base(),method:'rule'},3);report=(await db.query('select * from insight_reports')).rows[0];assert.equal(report.current_version,4);assert.equal(report.reading_version,3);
  const next=await queue('b'.repeat(64),1);assert.equal(next.generation,2);assert.equal(next.attempt_count,0);assert.equal(next.current_attempt_id,null);assert.equal((await queue('b'.repeat(64),1)).generation,2);
  const oldReplay=await finish(first.attempt.id,base());assert.equal(oldReplay.version.version,3);assert.equal(oldReplay.newly_completed,false);assert.equal(oldReplay.run.generation,2);
  let attempt=await claim(base('b'.repeat(64)));assert.equal(attempt.attempt.generation,2);
  await queue('e'.repeat(64),2);await assert.rejects(finish(attempt.attempt.id,base('b'.repeat(64))),/INSIGHT_LEASE_CONFLICT/);
  for(let number=1;number<=3;number++){
   attempt=await claim(base('e'.repeat(64)));assert.equal(attempt.attempt.attempt_number,number);
   const failed=(await db.query("select fail_insight_run($1::uuid,'Safe failure',false) as result",[attempt.attempt.id])).rows[0].result;
   if(number===1){assert.equal(failed.status,'failed');await assert.rejects(queue('e'.repeat(64),3),/INSIGHT_RETRY_LIMIT/);break;}
  }
  await db.exec(`reset role;update insight_runs set status='waiting_retry',next_retry_at=null;set role authenticated;set request.jwt.claim.sub='${owner}'`);
  for(let number=2;number<=3;number++){attempt=await claim(base('e'.repeat(64)));assert.equal(attempt.attempt.attempt_number,number);await db.query("select fail_insight_run($1::uuid,'Retryable',true)",[attempt.attempt.id]);await db.exec('reset role;update insight_runs set next_retry_at=null;set role authenticated');}
  assert.equal((await claim(base('e'.repeat(64)))).attempt,null);await assert.rejects(queue('e'.repeat(64),3),/INSIGHT_RETRY_LIMIT/);
  await db.exec(`reset role`);await assert.rejects(db.exec("update insight_run_attempts set generation=9 where status='succeeded'"),/immutable/);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${other}'`);assert.equal((await db.query('select * from insight_runs')).rows.length,0);await assert.rejects(finish(first.attempt.id,base()),/INSIGHT_ATTEMPT_NOT_FOUND/);
  await assert.rejects(db.query("select save_insight_report_snapshot('2026-01-01','2026-01-02',0,$1::uuid,$2,$3::jsonb)",[randomUUID(),'f'.repeat(64),JSON.stringify(base())]),/permission denied/);
 }finally{await db.close();}
});

test("review follows meal types, detects record edits, queues safe reanalysis and keeps source data/history intact",()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'eo-insight-review-')),loader=pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href;
 try{
 const backup=path.join(directory,"review-backup.json");const program=String.raw`
 import fs from 'node:fs';import{BACKUP_TABLES,BACKUP_VERSION,BACKUP_SCHEMA_VERSION,sanitizeExportRow}from'./src/lib/data-backup.ts';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';import{DatabaseSync}from'node:sqlite';
 import{getRepository,withMcpRequestRepository}from'./src/lib/repositories/index.ts';import{createFoodLog,updateFoodLog}from'./src/lib/services/food.ts';import{parseNewFoodLog}from'./src/lib/validation.ts';
 import{getInsightDayReview,getInsightReportDetail,generateRuleInsightReport,publishInsightReport}from'./src/lib/services/insight-reports.ts';import{getInsightContext}from'./src/lib/services/insight-context.ts';
 import{startInsightRun,completeInsightRun,requestInsightAnalysis,getInsightRunStatus,listInsightRunStatus}from'./src/lib/services/insight-runs.ts';import{readableInsightFindings}from'./src/lib/insight-review.ts';
 import{createResourceRegistry}from'./src/lib/mcp/resource-registry.ts';const resourceRegistry=createResourceRegistry({insightReport:{get:getInsightReportDetail}});
 const date='2026-01-01',id='day/'+date,repo=await getRepository(),db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
 const add=(mealType,title,estimatedKcal,hour)=>createFoodLog(parseNewFoodLog({mealType,title,estimatedKcal,occurredAt:date+'T'+hour+':00:00+08:00',occurredHasExplicitTime:false}));
 await add('lunch','午餐',500,'12');await add('late_night','凌晨水果',472,'01');
 let review=await getInsightDayReview(date);assert.equal(review.overview.foodCount,2);assert.equal(review.overview.recordedIntakeKcal,972);assert.equal(review.status,'waiting_records');assert.deepEqual(review.recording.missing,['dinner']);assert.match(review.recording.message,/晚餐尚未记录/);
 await assert.rejects(generateRuleInsightReport({date,expectedVersion:0,requestKey:randomUUID()}),/晚餐尚未记录/);assert.equal((await startInsightRun(id,randomUUID(),review.fingerprint)).ready,false);await assert.rejects(requestInsightAnalysis(date,review.fingerprint),/晚餐尚未记录/);assert.equal(db.prepare('select count(*) n from insight_runs').get().n,0);
 const dinner=await add('dinner','晚餐',520,'19');review=await getInsightDayReview(date);assert.equal(review.status,'waiting_analysis');assert(review.recording.complete);assert.equal(review.overview.recordedIntakeKcal,1492);assert.equal((await getInsightContext(id)).nutrition.summary.energyBalance,null);
 const source=()=>JSON.stringify(db.prepare('select * from food_logs order by id').all());let before=source();
 const command={date,expectedVersion:0,requestKey:randomUUID()},rules=await generateRuleInsightReport(command);assert.equal(rules.version.version,1);assert.equal((await generateRuleInsightReport({...command,requestKey:randomUUID()})).version.version,1);
 const context=await getInsightContext(id),start=await startInsightRun(id,randomUUID(),context.snapshotFingerprint);assert(start.ready);assert.deepEqual(start.baseSnapshot.findings,[]);
 const output={summary:'午餐和晚餐都有记录，凌晨还记下了一份水果。\n\n已记录摄入约 1492 kcal，是食物记录的估算。',findings:[]};const saved=await completeInsightRun(id,start.attemptId,output);assert.equal(saved.version,2);
 assert.equal((await getInsightDayReview(date)).status,'completed');assert.equal((await getInsightReportDetail(saved.report.id)).version.version,2);assert.equal((await generateRuleInsightReport({...command,expectedVersion:2,requestKey:randomUUID()})).version.version,2);assert.equal(source(),before);
 const rule3=await repo.saveInsightReport({date,periodEnd:'2026-01-02',expectedVersion:2,requestKey:randomUUID(),requestHash:'b'.repeat(64),revisionNote:'规则补充',snapshot:rules.version.snapshot});assert.equal(rule3.version.version,3);assert.equal((await getInsightReportDetail(saved.report.id)).version.version,2);assert.equal((await getInsightReportDetail(saved.report.id,3)).version.snapshot.method,'rule');assert.deepEqual(readableInsightFindings((await getInsightReportDetail(saved.report.id)).version.snapshot),[]);
 await add('snack','下午水果',200,'16');review=await getInsightDayReview(date);assert.equal(review.status,'data_updated');assert.equal(review.overview.recordedIntakeKcal,1692);
 let queued=await requestInsightAnalysis(date,review.fingerprint);assert.equal(queued.run.generation,2);assert.equal(queued.run.currentAttemptId,null);assert.equal((await requestInsightAnalysis(date,review.fingerprint)).run.generation,2);assert.equal((await getInsightRunStatus(id)).canStart,true);assert((await listInsightRunStatus(true)).some(item=>item.date===date));
 const next=await startInsightRun(id,randomUUID(),review.fingerprint);assert(next.ready);assert.equal(next.run.attemptCount,1);const changedOutput={summary:'补录了下午水果，已记录摄入估算更新为 1692 kcal。',findings:[]};const newer=await completeInsightRun(id,next.attemptId,changedOutput);assert.equal(newer.version,4);assert.equal((await getInsightReportDetail(saved.report.id)).version.version,4);assert.equal((await getInsightReportDetail(saved.report.id,2)).version.snapshot.summary,output.summary);
 const replay=await completeInsightRun(id,start.attemptId,output);assert.equal(replay.replayed,true);assert.equal(replay.version,2);
 await updateFoodLog(dinner.id,{title:'晚餐补充说明'});review=await getInsightDayReview(date);assert.equal(review.status,'data_updated');await requestInsightAnalysis(date,review.fingerprint);const active=await startInsightRun(id,randomUUID(),review.fingerprint);await add('snack','补充记录',null,'17');await assert.rejects(completeInsightRun(id,active.attemptId,{summary:'过时的输出',findings:[]}),/数据已更新/);assert.equal((await repo.getInsightReport(saved.report.id)).currentVersion,4);
 review=await getInsightDayReview(date);await requestInsightAnalysis(date,review.fingerprint);const final=await startInsightRun(id,randomUUID(),review.fingerprint);before=source();await completeInsightRun(id,final.attemptId,{summary:'当天记录已经补充，未见值得单独提示的变化。',findings:[]});assert.equal(source(),before);assert.equal((await getInsightDayReview(date)).status,'completed');assert.equal((await repo.getInsightReport(saved.report.id)).currentVersion,5);
 const external=await withMcpRequestRepository({userId:'local',accessToken:'test'},()=>resourceRegistry.get('insight_report',saved.report.id));assert.equal(external.version.version,5);assert.equal(external.review.status,'completed');assert.equal(external.report.reading_method,'ai');
 assert.equal(db.prepare("select count(*) n from food_logs where meal_type='breakfast'").get().n,0);assert.equal((await getInsightRunStatus(id)).attempts.filter(a=>a.status==='succeeded').length,3);assert.equal(db.prepare('pragma foreign_key_check').all().length,0);
 const resources=Object.fromEntries(BACKUP_TABLES.map(table=>[table,db.prepare('SELECT * FROM "'+table+'"').all().map(row=>sanitizeExportRow(table,row))]));
 fs.writeFileSync(process.env.INSIGHT_REVIEW_BACKUP,JSON.stringify({backup_version:BACKUP_VERSION,exported_at:new Date().toISOString(),schema:{supabase_migration:BACKUP_SCHEMA_VERSION},source:{backend:'supabase'},resources}));db.close();
 `;
 const result=spawnSync(process.execPath,['--experimental-loader',loader,'--input-type=module','--eval',program],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'test.db'),VERCEL:'',INSIGHT_REVIEW_BACKUP:backup}});assert.equal(result.status,0,result.stderr||result.stdout);
 const targetEnv={...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'restored.db'),VERCEL:''};
 const restoredProgram=`import assert from 'node:assert/strict';import{getRepository}from'./src/lib/repositories/index.ts';import{getInsightDayReview,getInsightReportDetail}from'./src/lib/services/insight-reports.ts';import{completeInsightRun}from'./src/lib/services/insight-runs.ts';const repo=await getRepository(),review=await getInsightDayReview('2026-01-01');assert.equal(review.status,'completed');assert.equal(review.detail.version.version,5);const state=await repo.getInsightRun('2026-01-01');assert.equal(state.run.generation,4);const attempts=await repo.listInsightRunAttempts(state.run.id);assert.equal(attempts.length,4);const original=await getInsightReportDetail(state.run.reportId,2,false);const replay=await completeInsightRun('day/2026-01-01',attempts.find(a=>a.generation===1).id,{summary:original.version.snapshot.summary,findings:[]});assert.equal(replay.replayed,true);assert.equal(replay.version,2);assert.equal((await getInsightReportDetail(state.run.reportId,undefined,false)).version.version,5);`;
 for(const args of [['--experimental-loader',loader,'--input-type=module','--eval',"await import('./src/lib/db.ts');"],['scripts/restore-backup.mjs',backup],['--experimental-loader',loader,'--input-type=module','--eval',restoredProgram]]){const restored=spawnSync(process.execPath,args,{encoding:'utf8',env:targetEnv});assert.equal(restored.status,0,restored.stderr||restored.stdout);}
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});

test("SQLite upgrade preserves populated legacy attempts and introduces per-generation uniqueness without losing references",async()=>{
 const{DatabaseSync}=await import('node:sqlite'),db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON;CREATE TABLE migrations(version integer primary key);');
  const source=readFileSync('src/lib/db.ts','utf8');const migration=version=>{const marker=source.indexOf('const hasV'+version+'=');assert(marker>=0);const begin=source.indexOf('database.exec(`',marker)+'database.exec(`'.length,end=source.indexOf('`);',begin);return source.slice(begin,end);};
  db.exec(migration(85));db.exec(migration(86));const report=randomUUID(),attempt=randomUUID(),run=randomUUID(),snapshot=JSON.stringify(base('a'.repeat(64),false));
  db.prepare("INSERT INTO insight_reports(id,period_type,period_start,period_end,current_version,status,created_at,updated_at) VALUES(?,'daily','2026-01-01','2026-01-02',1,'no_findings','2026-01-02','2026-01-02')").run(report);
  db.prepare("INSERT INTO insight_report_versions(id,report_id,version,request_key,request_hash,snapshot,created_at) VALUES(?,?,1,?,?,?,'2026-01-02')").run(randomUUID(),report,attempt,'a'.repeat(64),snapshot);
  db.prepare("INSERT INTO insight_runs(id,date,status,attempt_count,current_attempt_id,report_id,report_version,created_at,updated_at) VALUES(?,'2026-01-01','succeeded',1,?,?,1,'2026-01-02','2026-01-02')").run(run,attempt,report);
  db.prepare("INSERT INTO insight_run_attempts(id,run_id,attempt_number,request_key,status,base_snapshot,expected_version,lease_until,started_at,finished_at,output_hash) VALUES(?,?,1,?,'succeeded',?,0,'2026-01-02T01:00:00Z','2026-01-02','2026-01-02',?)").run(attempt,run,randomUUID(),snapshot,'b'.repeat(64));
  db.exec(migration(90));const original=db.prepare('select * from insight_run_attempts where id=?').get(attempt);assert.equal(original.generation,1);assert.equal(original.base_snapshot,snapshot);assert.equal(original.status,'succeeded');assert.equal(db.prepare('select reading_version from insight_reports where id=?').get(report).reading_version,1);assert.equal(db.prepare('select input_fingerprint from insight_runs where id=?').get(run).input_fingerprint,'a'.repeat(64));
  const next=randomUUID();db.prepare("INSERT INTO insight_run_attempts(id,run_id,generation,attempt_number,request_key,status,base_snapshot,expected_version,lease_until,started_at) VALUES(?,?,2,1,?,'running',?,1,'2026-01-03T01:00:00Z','2026-01-03')").run(next,run,randomUUID(),snapshot);
  db.prepare("UPDATE insight_runs SET generation=2,attempt_count=1,current_attempt_id=?,status='running' WHERE id=?").run(next,run);
  assert.equal(db.prepare('select count(*) n from insight_run_attempts').get().n,2);assert.throws(()=>db.prepare('UPDATE insight_run_attempts SET generation=2 WHERE id=?').run(attempt),/immutable/);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
