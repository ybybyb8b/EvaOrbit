import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const base={summary:"Frozen rule input",method:"ai",agent:"ChatGPT Scheduled Task",revisionNote:"Automatic daily",findings:[],
  evidence:[{id:"window-food",label:"Food",resource:null,recordId:null,resourceId:null,href:"/food",from:null,to:null,metrics:{observedCount:1}}],
  input:{capturedAt:"2026-01-02T00:00:00Z",fingerprint:"a".repeat(64),coverage:{recordingCompleteness:"unknown"},metrics:{counts:{food:{complete:true,observedCount:1}}},limitations:["Recorded observations only"]}};
const finished={...base,summary:"One recorded event",findings:[{id:"ai-food",title:"An observation",body:"One recorded event",domain:"food",importance:"normal",kind:"fact",method:"ai",evidenceIds:["window-food"],revises:[]}]};

test("Postgres Daily runs isolate owners, fence leases and atomically save bounded immutable attempts",async()=>{
  const{PGlite}=await import("@electric-sql/pglite"),db=new PGlite();
  const key=n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
      insert into auth.users values('10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');`);
    await db.exec(readFileSync("supabase/migrations/202610250001_insight_reports.sql","utf8"));
    const sql=readFileSync("supabase/migrations/202610250002_insight_runs.sql","utf8");await db.exec(sql);await db.exec(sql);
    await db.exec("set role authenticated;set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001'");
    const claim=async(date,n,empty=false,input=base)=>(await db.query("select claim_insight_run($1::date,$2::uuid,$3::jsonb,$4) as result",[date,key(n),JSON.stringify(input),empty])).rows[0].result;
    const finish=async(id,content=finished,hash="1".repeat(64))=>(await db.query("select finish_insight_run($1::uuid,$2::jsonb,$3) as result",[id,JSON.stringify(content),hash])).rows[0].result;
    const fail=async(id,retryable=true)=>(await db.query("select fail_insight_run($1::uuid,'Safe test failure',$2) as result",[id,retryable])).rows[0].result;
    const first=await claim("2026-01-01",1);assert.equal(first.run.status,"running");assert.equal(first.attempt.attempt_number,1);
    assert.equal((await claim("2026-01-01",1)).attempt.id,first.attempt.id);
    assert.equal((await claim("2026-01-01",2)).attempt,null);
    await assert.rejects(claim("2026-01-02",1),/INSIGHT_REQUEST_CONFLICT/);
    await assert.rejects(finish(first.attempt.id,{...finished,input:{...base.input,fingerprint:"b".repeat(64)}}),/INSIGHT_INPUT_BINDING_CONFLICT/);
    assert.equal((await db.query("select * from insight_reports")).rows.length,0);
    const result=await finish(first.attempt.id);assert.equal(result.run.status,"succeeded");assert.equal(result.newly_completed,true);
    const replay=await finish(first.attempt.id);assert.equal(replay.version.id,result.version.id);assert.equal(replay.newly_completed,false);
    await assert.rejects(finish(first.attempt.id,finished,"2".repeat(64)),/INSIGHT_OUTPUT_CONFLICT/);
    assert.equal((await fail(first.attempt.id)).status,"succeeded");
    await assert.rejects(db.exec("update insight_runs set status='failed'"),/permission denied/);
    await assert.rejects(db.exec("delete from insight_run_attempts"),/permission denied/);
    const waiting=await claim("2026-01-02",3,true);assert.equal(waiting.run.status,"waiting_data");assert.equal(waiting.attempt.status,"waiting_data");
    assert.equal((await claim("2026-01-02",4,true)).attempt,null);
    await db.exec("reset role;update insight_runs set next_retry_at=now()-interval '1 minute' where date='2026-01-02';set role authenticated");
    const afterDelay=await claim("2026-01-02",4,true);assert.equal(afterDelay.attempt.status,"running");assert.equal(afterDelay.run.attempt_count,2);
    const empty=await finish(afterDelay.attempt.id,base);assert.equal(empty.report.status,"no_findings");
    const a=await claim("2026-01-03",5);assert.equal((await fail(a.attempt.id)).status,"waiting_retry");
    await db.exec("reset role;update insight_runs set next_retry_at=now()-interval '1 minute' where date='2026-01-03';set role authenticated");
    const b=await claim("2026-01-03",6);
    await db.exec("reset role;update insight_runs set lease_until=now()-interval '1 minute' where date='2026-01-03';update insight_run_attempts set lease_until=now()-interval '1 minute' where status='running';set role authenticated");
    const c=await claim("2026-01-03",7);assert.equal(c.run.attempt_count,3);
    await assert.rejects(finish(b.attempt.id),/INSIGHT_LEASE_CONFLICT/);
    assert.equal((await fail(c.attempt.id)).status,"failed");assert.equal((await claim("2026-01-03",8)).attempt,null);
    const concurrent=await claim("2026-01-04",9);
    await db.query("select save_insight_report('2026-01-04','2026-01-05',0,$1::uuid,$2,$3::jsonb)",[key(20),"f".repeat(64),JSON.stringify({...base,method:"rule",agent:"Manual rule"})]);
    await assert.rejects(finish(concurrent.attempt.id),/INSIGHT_VERSION_CONFLICT/);
    assert.equal((await db.query("select current_version from insight_reports where period_start='2026-01-04'")).rows[0].current_version,1);
    await fail(concurrent.attempt.id);
    const rule={...finished.findings[0],id:"rule-food",method:"rule"};
    const ruleClaim=await claim("2026-01-05",21,false,{...base,findings:[rule]});
    await assert.rejects(finish(ruleClaim.attempt.id),/INSIGHT_INPUT_BINDING_CONFLICT/);
    assert.equal((await finish(ruleClaim.attempt.id,{...finished,findings:[rule,...finished.findings]})).run.status,"succeeded");
    const fatal=await claim("2026-01-06",22);assert.equal((await fail(fatal.attempt.id,false)).status,"failed");assert.equal((await claim("2026-01-06",23)).attempt,null);
    await db.exec("reset role");await db.exec(sql);
    await assert.rejects(db.exec("update insight_run_attempts set base_snapshot='{}' where status='succeeded'"),/immutable/);
    await db.exec("set role authenticated;set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002'");
    assert.equal((await db.query("select * from insight_runs")).rows.length,0);assert.equal((await db.query("select * from insight_run_attempts")).rows.length,0);
    await assert.rejects(finish(first.attempt.id),/INSIGHT_ATTEMPT_NOT_FOUND/);
    const other=await claim("2026-01-01",1);assert.notEqual(other.run.id,first.run.id);
    await db.exec("reset request.jwt.claim.sub");await assert.rejects(claim("2026-01-01",10),/Authentication required/);
  }finally{await db.close();}
});

test("real SQLite + MCP Agent cycle binds evidence, replays writes, tracks delays and never alters source tables",()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"eo-insight-runs-"));
  try{
    const code=String.raw`
      import assert from 'node:assert/strict';import fs from 'node:fs';import{randomUUID}from'node:crypto';import{DatabaseSync}from'node:sqlite';
      import{getRepository,withMcpRequestRepository}from'./src/lib/repositories/index.ts';
      import{resourceRegistry as registry}from'./src/lib/mcp/resource-registry.server.ts';
      import{getInsightContext}from'./src/lib/services/insight-context.ts';
      import{getInsightRunStatus,startInsightRun,completeInsightRun,failInsightRun,listInsightRunStatus}from'./src/lib/services/insight-runs.ts';
      import{insightOutputSchemaJson,importantInsightNotification}from'./src/lib/insight-runs.ts';
      import{parseNewFoodLog}from'./src/lib/validation.ts';import{createFoodLog}from'./src/lib/services/food.ts';
      import{BACKUP_TABLES,BACKUP_VERSION,BACKUP_SCHEMA_VERSION,sanitizeExportRow,emptyBackupResources,parseBackupDocument}from'./src/lib/data-backup.ts';
      await getRepository();for(const date of ['2026-01-02','2026-01-03','2026-01-04'])await createFoodLog(parseNewFoodLog({title:'面条',occurredAt:date+'T12:00:00+08:00',occurredHasExplicitTime:false}));
      const sql=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      const tables=sql.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not in ('insight_reports','insight_report_versions','insight_runs','insight_run_attempts')").all().map(row=>row.name);
      const original=()=>JSON.stringify(tables.map(name=>[name,sql.prepare('SELECT * FROM "'+name+'"').all()]));const before=original();
      for(const name of tables)for(const op of ['INSERT','UPDATE','DELETE'])sql.exec('CREATE TRIGGER "block_'+op+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Agent modified source data\'); END;');
      const context1=await getInsightContext('day/2026-01-01');const delayed=await startInsightRun('day/2026-01-01',randomUUID(),context1.snapshotFingerprint);assert.equal(delayed.run.status,'waiting_data');assert.equal(delayed.ready,false);
      assert.equal((await startInsightRun('day/2026-01-01',randomUUID(),context1.snapshotFingerprint)).ready,false);
      sql.exec("UPDATE insight_runs SET next_retry_at='2000-01-01T00:00:00Z' WHERE date='2026-01-01'");
      const empty=await startInsightRun('day/2026-01-01',randomUUID(),context1.snapshotFingerprint);assert.equal(empty.ready,true);
      const noFindings=await completeInsightRun('day/2026-01-01',empty.attemptId,{summary:'本期暂无值得特别关注的发现。',findings:[]});assert.equal(noFindings.report.status,'no_findings');
      const context2=await getInsightContext('day/2026-01-02');await assert.rejects(startInsightRun('day/2026-01-02',randomUUID(),'b'.repeat(64)),/上下文已变化/);
      const requestKey=randomUUID();
      const mcp=action=>withMcpRequestRepository({userId:'local',accessToken:'test'},action);
      const claim=await mcp(()=>registry.action('insight_run',{id:'day/2026-01-02',action:'start',data:{request_key:requestKey,context_fingerprint:context2.snapshotFingerprint}}));assert.equal(claim.ready,true);
      assert.equal((await startInsightRun('day/2026-01-02',requestKey,context2.snapshotFingerprint)).attemptId,claim.attempt_id);
      assert.equal((await startInsightRun('day/2026-01-02',randomUUID(),context2.snapshotFingerprint)).ready,false);
      assert(JSON.parse(claim.output_schema_json).properties.findings.items.required.includes('evidence_ids'));
      const output={summary:'昨日有一条饮食记录。',findings:[{id:'ai-food',title:'记录了一餐',body:'记录中有一餐；未记录不能视为未进食。',domain:'food',importance:'normal',kind:'fact',evidence_ids:['window-food'],revises:[]}]};
      await assert.rejects(mcp(()=>registry.action('insight_run',{id:'day/2026-01-02',action:'complete',data:{attempt_id:claim.attempt_id,output:{...output,input:{fake:true}}}})),/AI 日报内容无效/);
      await assert.rejects(completeInsightRun('day/2026-01-02',claim.attempt_id,{summary:'Bad evidence',findings:[{...output.findings[0],evidenceIds:['missing'],evidence_ids:undefined}]}));
      const saved=await mcp(()=>registry.action('insight_run',{id:'day/2026-01-02',action:'complete',data:{attempt_id:claim.attempt_id,output}}));assert.equal(saved.run.status,'succeeded');assert.equal(saved.version,1);
      const replay=await mcp(()=>registry.action('insight_run',{id:'day/2026-01-02',action:'complete',data:{attempt_id:claim.attempt_id,output}}));assert.equal(replay.replayed,true);assert.equal(replay.version,1);
      await assert.rejects(mcp(()=>registry.action('insight_run',{id:'day/2026-01-02',action:'complete',data:{attempt_id:claim.attempt_id,output:{...output,summary:'Different'}}})),/不同输出/);
      const report=await mcp(()=>registry.get('insight_report',saved.report.id+'/v/1'));assert.equal(report.version.snapshot.agent,'ChatGPT Scheduled Task');assert.equal(report.version.snapshot.input.fingerprint,claim.base_snapshot.input.fingerprint);
      assert.equal((await failInsightRun('day/2026-01-02',claim.attempt_id,'Late error',true)).run.status,'succeeded');
      assert.equal((await getInsightRunStatus('day/2026-01-02')).attempts.length,1);assert(!('base' in (await getInsightRunStatus('day/2026-01-02')).attempts[0]));
      assert.equal(sql.prepare("select count(*) n from insight_report_versions where report_id=?").get(saved.report.id).n,1);
      for(let attempt=1;attempt<=3;attempt++){
        const context=await getInsightContext('day/2026-01-03'),lease=await startInsightRun('day/2026-01-03',randomUUID(),context.snapshotFingerprint);assert.equal(lease.ready,true);
        const result=await failInsightRun('day/2026-01-03',lease.attemptId,'Model failed safely',true);assert.equal(result.run.status,attempt===3?'failed':'waiting_retry');
        sql.exec("UPDATE insight_runs SET next_retry_at='2000-01-01T00:00:00Z' WHERE date='2026-01-03'");
      }
      assert.equal((await startInsightRun('day/2026-01-03',randomUUID(),(await getInsightContext('day/2026-01-03')).snapshotFingerprint)).ready,false);
      assert.equal((await getInsightRunStatus('day/2026-01-03')).attempts.length,3);
      const jan4=await getInsightContext('day/2026-01-04');let expiry=await startInsightRun('day/2026-01-04',randomUUID(),jan4.snapshotFingerprint);
      assert(expiry.baseSnapshot.findings.length>0);
      await assert.rejects((await getRepository()).finishInsightRun(expiry.attemptId,{...expiry.baseSnapshot,findings:[]},'c'.repeat(64)),/锁定/);
      const staleId=expiry.attemptId;
      for(let attempt=1;attempt<=3;attempt++){
        const expiredShanghai=new Date(Date.now()+8*3600000-60000).toISOString().replace('Z','+08:00');
        sql.prepare("UPDATE insight_runs SET lease_until=? WHERE date='2026-01-04'").run(expiredShanghai);sql.prepare("UPDATE insight_run_attempts SET lease_until=? WHERE status='running'").run(expiredShanghai);
        expiry=await startInsightRun('day/2026-01-04',randomUUID(),jan4.snapshotFingerprint);
        if(attempt<3)assert.equal(expiry.ready,true);else assert.equal(expiry.run.status,'failed');
      }
      await assert.rejects(completeInsightRun('day/2026-01-04',staleId,{summary:'Late output',findings:[]}),/租约/);
      const run=await getRepository().then(repo=>repo.getInsightRun('2026-01-02'));
      assert.throws(()=>sql.prepare("UPDATE insight_run_attempts SET base_snapshot='{}' WHERE id=?").run(run.attempt.id),/immutable/);
      const quality={...run.attempt.base,findings:[{id:'ai-major',title:'Major',body:'Supported fact',domain:'health',importance:'high',kind:'fact',method:'ai',evidenceIds:['window-food'],revises:[]}]};
      assert(importantInsightNotification(quality));assert.equal(importantInsightNotification({...quality,findings:[{...quality.findings[0],kind:'hypothesis'}]}),undefined);
      assert.equal(importantInsightNotification({...quality,input:{...quality.input,metrics:{counts:{food:{complete:false,observedCount:1}}}}}),undefined);
      assert.equal(importantInsightNotification({...quality,input:{...quality.input,metrics:{counts:{food:{complete:true,observedCount:0}}}}}),undefined);
      assert.equal(original(),before);
      const resources=emptyBackupResources();const legacy={backup_version:11,exported_at:new Date().toISOString(),schema:{supabase_migration:'old'},source:{backend:'supabase'},resources:{...resources}};delete legacy.resources.insight_runs;delete legacy.resources.insight_run_attempts;assert.deepEqual(parseBackupDocument(legacy).resources.insight_runs,[]);
      assert(BACKUP_VERSION>=12);assert(BACKUP_TABLES.indexOf('insight_report_versions')<BACKUP_TABLES.indexOf('insight_runs'));assert(BACKUP_TABLES.indexOf('insight_runs')<BACKUP_TABLES.indexOf('insight_run_attempts'));
      assert.equal(JSON.parse(insightOutputSchemaJson).additionalProperties,false);assert(Array.isArray(await listInsightRunStatus(true)));
      const jan8=await getInsightContext('day/2026-01-08');await startInsightRun('day/2026-01-08',randomUUID(),jan8.snapshotFingerprint);
      sql.exec("UPDATE insight_runs SET next_retry_at='2000-01-01T00:00:00Z' WHERE date='2026-01-08'");
      assert.equal((await startInsightRun('day/2026-01-08',randomUUID(),jan8.snapshotFingerprint)).ready,true);
      const resourcesToRestore=Object.fromEntries(BACKUP_TABLES.map(table=>[table,sql.prepare('SELECT * FROM "'+table+'"').all().map(row=>sanitizeExportRow(table,row))]));
      const reversed=value=>Array.isArray(value)?value.map(reversed):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reversed(item)])):value;
      for(const row of resourcesToRestore.insight_run_attempts)row.base_snapshot=reversed(JSON.parse(row.base_snapshot));
      fs.writeFileSync(process.env.INSIGHT_TEST_BACKUP,JSON.stringify({backup_version:BACKUP_VERSION,exported_at:new Date().toISOString(),schema:{supabase_migration:BACKUP_SCHEMA_VERSION},source:{backend:'supabase'},resources:resourcesToRestore}));sql.close();
    `;
    const loader=pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href,backup=path.join(directory,"backup.json");
    const environment={...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:path.join(directory,"test.db"),VERCEL:"",INSIGHT_TEST_BACKUP:backup};
    const result=spawnSync(process.execPath,["--experimental-loader",loader,"--input-type=module","--eval",code],{encoding:"utf8",env:environment});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const targetEnv={...environment,EVAORBIT_SQLITE_PATH:path.join(directory,"restored.db")};
    for(const args of [["--experimental-loader",loader,"--input-type=module","--eval","await import('./src/lib/db.ts');"],["scripts/restore-backup.mjs",backup],["--experimental-loader",loader,"--input-type=module","--eval",String.raw`import assert from 'node:assert/strict';import{getInsightRunStatus,completeInsightRun}from'./src/lib/services/insight-runs.ts';const completed=await getInsightRunStatus('day/2026-01-02');assert.equal(completed.run.status,'succeeded');assert.equal(completed.attempts.length,1);assert.equal(completed.attempts[0].status,'succeeded');const failed=await getInsightRunStatus('day/2026-01-04');assert.equal(failed.run.status,'failed');assert.equal(failed.attempts.length,3);assert(failed.attempts.every(attempt=>attempt.status==='expired'));const replay=await completeInsightRun('day/2026-01-02',completed.run.currentAttemptId,{summary:'昨日有一条饮食记录。',findings:[{id:'ai-food',title:'记录了一餐',body:'记录中有一餐；未记录不能视为未进食。',domain:'food',importance:'normal',kind:'fact',evidenceIds:['window-food'],revises:[]}]});assert.equal(replay.replayed,true);const running=await getInsightRunStatus('day/2026-01-08');assert.equal(running.status,'running');assert.equal((await completeInsightRun('day/2026-01-08',running.run.currentAttemptId,{summary:'保留已有规则观察，没有额外 AI 发现。',findings:[]})).run.status,'succeeded');`]]){
      const restored=spawnSync(process.execPath,args,{encoding:"utf8",env:targetEnv});assert.equal(restored.status,0,restored.stderr||restored.stdout);
    }
  }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
