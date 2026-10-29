import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import test from 'node:test';

const owner='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const snapshot=fp=>({summary:'当天的午餐和晚餐都有记录。',method:'ai',agent:'ChatGPT Scheduled Task',revisionNote:'每日复盘',findings:[],evidence:[],input:{capturedAt:'2026-01-02T00:00:00Z',fingerprint:fp.repeat(64),fingerprintVersion:2,coverage:{},metrics:{},limitations:[]}});
test('Postgres deletion is owner scoped, version/generation guarded, fences workers and requires explicit rebuild',async()=>{
 const{PGlite}=await import('@electric-sql/pglite'),db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;create table public.food_logs(id bigint,user_id uuid,meal_type text,occurred_at timestamptz);grant select on public.food_logs to authenticated;
   insert into auth.users values('${owner}'),('${other}');insert into food_logs values(1,'${owner}','lunch','2026-01-01T12:00:00+08:00'),(2,'${owner}','dinner','2026-01-01T19:00:00+08:00');`);
  for(const file of ['202610250001_insight_reports.sql','202610250002_insight_runs.sql','202610270002_insight_review.sql','202610270003_insight_deletion.sql','202610270003_insight_deletion.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}'`);
  const claim=async(fp)=>(await db.query("select claim_insight_run('2026-01-01',$1::uuid,$2::jsonb,false) as result",[randomUUID(),JSON.stringify(snapshot(fp))])).rows[0].result;
  const finish=async(attempt,fp)=>(await db.query('select finish_insight_run($1::uuid,$2::jsonb,$3) as result',[attempt,JSON.stringify(snapshot(fp)),'c'.repeat(64)])).rows[0].result;
  const initial=await claim('a'),saved=await finish(initial.attempt.id,'a'),reportId=saved.report.id;
  const active=await claim('b');assert.equal(active.run.generation,2);
  const remove=(version,generation)=>db.query('select delete_insight_report($1::uuid,$2,$3)',[reportId,version,generation]);
  await assert.rejects(remove(2,2),/INSIGHT_VERSION_CONFLICT/);await assert.rejects(remove(1,1),/INSIGHT_GENERATION_CONFLICT/);
  await db.exec(`set request.jwt.claim.sub='${other}'`);await assert.rejects(remove(1,2),/INSIGHT_REPORT_NOT_FOUND/);await db.exec(`set request.jwt.claim.sub='${owner}'`);
  await remove(1,2);await remove(1,2);const deleted=(await db.query('select * from insight_reports where id=$1',[reportId])).rows[0];assert(deleted.deleted_at);assert.equal(deleted.hidden_through_version,1);assert.equal(deleted.reading_version,null);
  assert.equal((await db.query('select status from insight_run_attempts where id=$1',[active.attempt.id])).rows[0].status,'failed');assert.equal((await db.query('select count(*)::int n from insight_report_versions')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from food_logs')).rows[0].n,2);
  await assert.rejects(finish(active.attempt.id,'b'),/INSIGHT_LEASE_CONFLICT/);assert.equal((await claim('b')).attempt,null);await assert.rejects(claim('c'),/INSIGHT_REPORT_DELETED/);
  const queued=(await db.query("select queue_insight_run('2026-01-01',$1,2) as result",['b'.repeat(64)])).rows[0].result;assert.equal(queued.generation,3);assert.equal(queued.status,'waiting_retry');assert.equal(queued.current_attempt_id,null);
  await assert.rejects(remove(1,2),/INSIGHT_GENERATION_CONFLICT/);const rebuilt=await claim('b'),newer=await finish(rebuilt.attempt.id,'b');assert.equal(newer.version.version,2);assert.equal(newer.report.reading_version,2);assert.equal(newer.report.deleted_at,null);
  await remove(2,3);assert.equal((await db.query('select count(*)::int n from insight_report_versions')).rows[0].n,2);
  await db.exec('reset role');await assert.rejects(db.exec("update insight_report_versions set snapshot='{}'"),/immutable/);
 }finally{await db.close();}
});

test('SQLite/Web service deletion hides all versions, keeps cross-report references and source data, and survives backup restore',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'eo-insight-delete-')),loader=pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,backup=path.join(directory,'backup.json');
 const env={...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'test.db'),VERCEL:'',INSIGHT_DELETE_BACKUP:backup};
 const run=(program,environment=env)=>{const result=spawnSync(process.execPath,['--experimental-loader',loader,'--input-type=module','--eval',program],{encoding:'utf8',env:environment});assert.equal(result.status,0,result.stderr||result.stdout);};
 try{
  run(String.raw`
   import fs from 'node:fs';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';import{DatabaseSync}from'node:sqlite';
   import{getRepository,withMcpRequestRepository}from'./src/lib/repositories/index.ts';import{createFoodLog}from'./src/lib/services/food.ts';import{parseNewFoodLog}from'./src/lib/validation.ts';
   import{getInsightContext}from'./src/lib/services/insight-context.ts';import{startInsightRun,completeInsightRun,requestInsightAnalysis,getInsightRunStatus,listInsightRunStatus}from'./src/lib/services/insight-runs.ts';
   import{generateRuleInsightReport,deleteInsightReport,getInsightReportDetail,getInsightDayReview,listInsightReports,publishInsightReport}from'./src/lib/services/insight-reports.ts';
   import{createResourceRegistry}from'./src/lib/mcp/resource-registry.ts';const resourceRegistry=createResourceRegistry({insightReport:{get:getInsightReportDetail}});import{BACKUP_TABLES,BACKUP_VERSION,BACKUP_SCHEMA_VERSION,sanitizeExportRow}from'./src/lib/data-backup.ts';
   const repo=await getRepository(),db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH),date='2026-01-01',day='day/'+date;
   for(const d of [date,'2026-01-02'])for(const mealType of ['lunch','dinner'])await createFoodLog(parseNewFoodLog({title:mealType,mealType,occurredAt:d+'T12:00:00+08:00',occurredHasExplicitTime:false}));
   const command={date,expectedVersion:0,requestKey:randomUUID()};await generateRuleInsightReport(command);
   let context=await getInsightContext(day),attempt=await startInsightRun(day,randomUUID(),context.snapshotFingerprint);
   const output={summary:'两餐均已记录。',findings:[{id:'ai-day',title:'两餐有记录',body:'午餐、晚餐都有对应记录。',domain:'food',importance:'normal',kind:'fact',evidenceIds:['window-food'],revises:[]}]},saved=await completeInsightRun(day,attempt.attemptId,output);
   const originalAttempt=attempt.attemptId,reportId=saved.report.id;
   const laterContext=await getInsightContext('day/2026-01-02'),later=await startInsightRun('day/2026-01-02',randomUUID(),laterContext.snapshotFingerprint),related=await completeInsightRun('day/2026-01-02',later.attemptId,{summary:'保留此前观察的引用。',findings:[{id:'ai-related',title:'延续观察',body:'引用昨日保留的观察。',domain:'food',importance:'normal',kind:'fact',evidenceIds:['window-food'],revises:[{reportId,version:2,findingId:'ai-day'}]}]});
   await createFoodLog(parseNewFoodLog({title:'水果',mealType:'snack',occurredAt:date+'T15:00:00+08:00',occurredHasExplicitTime:false}));let review=await getInsightDayReview(date);await requestInsightAnalysis(date,review.fingerprint);attempt=await startInsightRun(day,randomUUID(),review.fingerprint);
   const source=()=>JSON.stringify(db.prepare('select * from food_logs order by id').all()),before=source();await assert.rejects(deleteInsightReport(reportId,1,2),/更新/);await assert.rejects(deleteInsightReport(reportId,2,1),/更新/);
   await deleteInsightReport(reportId,2,2);await deleteInsightReport(reportId,2,2);assert.equal(source(),before);assert.equal((await repo.getInsightReport(reportId)).hiddenThroughVersion,2);assert.equal(db.prepare('select count(*) n from insight_report_versions where report_id=?').get(reportId).n,2);
   assert.equal((await getInsightDayReview(date)).status,'deleted');assert.equal((await getInsightDayReview(date)).detail,null);assert(!(await listInsightReports()).items.some(r=>r.id===reportId));
   await assert.rejects(getInsightReportDetail(reportId),/删除/);await assert.rejects(getInsightReportDetail(reportId,2),/删除/);await assert.rejects(withMcpRequestRepository({userId:'local',accessToken:'test'},()=>resourceRegistry.get('insight_report',reportId)),/删除/);
   assert.equal((await getInsightRunStatus(day)).canStart,false);assert.equal((await startInsightRun(day,randomUUID(),review.fingerprint)).analysisStatus,'deleted');assert(!(await listInsightRunStatus(true)).some(r=>r.date===date));
   await assert.rejects(completeInsightRun(day,attempt.attemptId,output),/删除/);await assert.rejects(generateRuleInsightReport({...command,expectedVersion:2,requestKey:randomUUID()}),/删除/);
   assert.equal((await getInsightReportDetail(related.report.id)).version.snapshot.findings[0].revises[0].reportId,reportId);
   review=await getInsightDayReview(date);const queued=await requestInsightAnalysis(date,review.fingerprint);assert.equal(queued.run.generation,3);assert.equal((await getInsightDayReview(date)).status,'waiting_analysis');assert.equal((await getInsightDayReview(date)).detail,null);assert(!(await getInsightContext('day/2026-01-02')).relatedReports.some(r=>r.id===reportId));
   await assert.rejects(deleteInsightReport(reportId,2,2),/更新/);await assert.rejects(getInsightReportDetail(reportId,2),/删除/);await assert.rejects(completeInsightRun(day,originalAttempt,output),/删除/);
   attempt=await startInsightRun(day,randomUUID(),review.fingerprint);assert(attempt.ready);const rebuilt=await completeInsightRun(day,attempt.attemptId,{summary:'手动重新生成的日报。',findings:[]});assert.equal(rebuilt.version,3);const detail=await getInsightReportDetail(reportId);assert.equal(detail.version.version,3);assert.deepEqual(detail.versions.map(v=>v.version),[3]);
   await deleteInsightReport(reportId,3,3);assert.equal(source(),before);assert.deepEqual(db.prepare('pragma foreign_key_check').all(),[]);assert.equal((await repo.getInsightRunAttempt({id:originalAttempt})).status,'succeeded');
   const resources=Object.fromEntries(BACKUP_TABLES.map(table=>[table,db.prepare('SELECT * FROM "'+table+'"').all().map(row=>sanitizeExportRow(table,row))]));fs.writeFileSync(process.env.INSIGHT_DELETE_BACKUP,JSON.stringify({backup_version:BACKUP_VERSION,exported_at:new Date().toISOString(),schema:{supabase_migration:BACKUP_SCHEMA_VERSION},source:{backend:'supabase'},resources}));db.close();
  `);
  const target={...env,EVAORBIT_SQLITE_PATH:path.join(directory,'restored.db')};run("await import('./src/lib/db.ts');",target);const restored=spawnSync(process.execPath,['scripts/restore-backup.mjs',backup],{encoding:'utf8',env:target});assert.equal(restored.status,0,restored.stderr||restored.stdout);
  run(String.raw`import assert from 'node:assert/strict';import{getRepository}from'./src/lib/repositories/index.ts';import{getInsightDayReview,listInsightReports}from'./src/lib/services/insight-reports.ts';import{getInsightRunStatus}from'./src/lib/services/insight-runs.ts';const repo=await getRepository();const review=await getInsightDayReview('2026-01-01');assert.equal(review.status,'deleted');assert.equal(review.detail,null);assert((await repo.getInsightReportForDate('2026-01-01')).deletedAt);assert.equal((await getInsightRunStatus('day/2026-01-01')).canStart,false);assert.equal((await listInsightReports()).items.length,1);`,target);
 }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
