import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const snapshot={summary:"No notable findings",method:"ai",agent:"test-agent",revisionNote:"Initial analysis",findings:[],evidence:[],input:{capturedAt:"2026-10-24T00:00:00Z",fingerprint:"a".repeat(64),coverage:{recordingCompleteness:"unknown"},metrics:{},limitations:["Recorded data only"]}};

test("report migration is repeatable, RPC is owner scoped, immutable, idempotent and revision guarded",async()=>{
  const{PGlite}=await import("@electric-sql/pglite"),db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
      insert into auth.users values('10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
      create table existing_data(id int primary key,note text);insert into existing_data values(1,'Keep');`);
    const sql=readFileSync("supabase/migrations/202610250001_insight_reports.sql","utf8");await db.exec(sql);await db.exec(sql);
    const save=(date,version,key,hash,content=snapshot)=>db.query("select save_insight_report($1::date,($1::date+1),$2,$3::uuid,$4,$5::jsonb) as result",[date,version,key,hash,JSON.stringify(content)]);
    await db.exec("set role authenticated;set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001'");
    const key1="10000000-0000-4000-8000-000000000010",key2="10000000-0000-4000-8000-000000000011";
    const first=(await save("2026-01-01",0,key1,"1".repeat(64))).rows[0].result;
    assert.equal(first.report.current_version,1);assert.equal(first.report.status,"no_findings");
    assert.equal((await save("2026-01-01",0,key1,"1".repeat(64))).rows[0].result.version.id,first.version.id);
    await assert.rejects(save("2026-01-01",0,key1,"2".repeat(64)),/INSIGHT_REQUEST_CONFLICT/);
    await assert.rejects(save("2026-01-01",0,key2,"2".repeat(64)),/INSIGHT_VERSION_CONFLICT/);
    const content={...snapshot,findings:[{id:"change",title:"Observation",body:"Recorded fact",domain:"food",importance:"normal",kind:"fact",method:"ai",evidenceIds:["e"],revises:[]}],evidence:[{id:"e",label:"Record",resource:"food_log",recordId:"1",resourceId:"1",href:"/food",from:null,to:null,metrics:{count:1}}]};
    const second=(await save("2026-01-01",1,key2,"2".repeat(64),content)).rows[0].result;
    assert.equal(second.report.id,first.report.id);assert.equal(second.version.version,2);
    await assert.rejects(db.exec("update insight_report_versions set snapshot='{}'"),/permission denied/);
    await assert.rejects(db.exec("delete from insight_report_versions"),/permission denied/);
    await assert.rejects(db.exec("update insight_reports set current_version=99"),/permission denied/);
    await assert.rejects(save("2026-01-02",0,"10000000-0000-4000-8000-000000000012","3".repeat(64),{...content,findings:[{...content.findings[0],evidenceIds:["missing"]}]}),/Missing evidence/);
    await db.exec("set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002'");
    assert.equal((await db.query("select * from insight_reports")).rows.length,0);assert.equal((await db.query("select * from insight_report_versions")).rows.length,0);
    await assert.rejects(save("2026-01-01",0,"20000000-0000-4000-8000-000000000012","3".repeat(64),{...content,findings:[{...content.findings[0],revises:[{reportId:first.report.id,version:2,findingId:"change"}]}]}),/Invalid revision reference/);
    const other=(await save("2026-01-01",0,key1,"1".repeat(64))).rows[0].result;
    assert.notEqual(other.report.id,first.report.id);
    await db.exec("reset role");
    assert.equal((await db.query("select note from existing_data")).rows[0].note,"Keep");
    await assert.rejects(db.exec("update insight_report_versions set request_hash=repeat('b',64)"),/immutable/);
    await db.exec("set role authenticated;reset request.jwt.claim.sub");
    await assert.rejects(save("2026-01-01",0,key1,"1".repeat(64)),/Authentication required/);
  }finally{await db.close();}
});

test("SQLite report service preserves source tables, versions, references, history and backup restoration",()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"eo-insight-reports-")),source=path.join(directory,"source.db"),target=path.join(directory,"target.db"),backup=path.join(directory,"backup.json");
  const loader=pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href;
  function run(code,db=source){const result=spawnSync(process.execPath,["--experimental-loader",loader,"--input-type=module","--eval",code],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:db,VERCEL:"",INSIGHT_TEST_BACKUP:backup}});assert.equal(result.status,0,result.stderr||result.stdout);}
  try{
    run(String.raw`
      import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID} from 'node:crypto';import{DatabaseSync}from'node:sqlite';
      import{getRepository,withInsightsReadOnlyRepository}from'./src/lib/repositories/index.ts';
      import{generateRuleInsightReport,publishInsightReport,getInsightReportDetail,listInsightVersionHistory,listInsightReports}from'./src/lib/services/insight-reports.ts';
      import{parseInsightSnapshot}from'./src/lib/insight-reports.ts';
      import{BACKUP_TABLES,BACKUP_VERSION,BACKUP_SCHEMA_VERSION,sanitizeExportRow,parseBackupDocument}from'./src/lib/data-backup.ts';
      const repository=await getRepository(),db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      const {createFoodLog}=await import('./src/lib/services/food.ts'),{parseNewFoodLog}=await import('./src/lib/validation.ts');
      for(const mealType of ['lunch','dinner'])await createFoodLog(parseNewFoodLog({title:mealType,mealType,occurredAt:'2026-01-01T12:00:00+08:00',occurredHasExplicitTime:false}));
      const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('insight_reports','insight_report_versions')").all().map(row=>row.name);
      const original=()=>JSON.stringify(tables.map(name=>[name,db.prepare('SELECT * FROM "'+name+'"').all()]));const before=original();
      for(const name of tables)for(const op of ['INSERT','UPDATE','DELETE'])db.exec('CREATE TRIGGER "block_'+op+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Report wrote business data\'); END;');
      const command={date:'2026-01-01',expectedVersion:0,requestKey:randomUUID()};
      const first=await generateRuleInsightReport(command);assert.equal(first.report.status,'no_findings');assert.equal(first.version.version,1);
      const replay=await generateRuleInsightReport(command);assert.equal(replay.version.id,first.version.id);assert.equal(replay.version.snapshot.input.capturedAt,first.version.snapshot.input.capturedAt);
      await assert.rejects(generateRuleInsightReport({...command,revisionNote:'Changed'}),/请求标识/);
      assert.equal((await generateRuleInsightReport({...command,requestKey:randomUUID()})).version.version,1);
      const snapshot={...first.version.snapshot,method:'ai',agent:'test-agent',summary:'An observed change',findings:[{id:'a',title:'Observed',body:'Recorded change',domain:'food',importance:'normal',kind:'hypothesis',method:'ai',evidenceIds:['food-drink-window'],revises:[]}]};
      const second=await publishInsightReport({...command,expectedVersion:1,requestKey:randomUUID()},snapshot);assert.equal(second.report.id,first.report.id);assert.equal(second.version.version,2);
      const third=await publishInsightReport({...command,expectedVersion:2,requestKey:randomUUID()},{...snapshot,revisionNote:'Refined',findings:[{...snapshot.findings[0],revises:[{reportId:first.report.id,version:2,findingId:'a'}]}]});assert.equal(third.version.version,3);
      assert.equal((await getInsightReportDetail(first.report.id,1)).version.snapshot.method,'rule');
      assert.equal((await getInsightReportDetail(first.report.id,2)).version.snapshot.summary,'An observed change');
      assert.equal((await getInsightReportDetail(first.report.id)).versions.length,3);
      await assert.rejects(publishInsightReport({...command,expectedVersion:3,requestKey:randomUUID()},{...snapshot,findings:[{...snapshot.findings[0],revises:[{reportId:first.report.id,version:2,findingId:'missing'}]}]}),/修订引用/);
      assert.equal((await repository.getInsightReport(first.report.id)).currentVersion,3);
      assert.throws(()=>parseInsightSnapshot({...snapshot,evidence:[{...snapshot.evidence[0],href:'javascript:alert(1)'}]}));
      assert.throws(()=>parseInsightSnapshot({...snapshot,findings:[{...snapshot.findings[0],evidenceIds:['missing']}]}));
      assert.throws(()=>parseInsightSnapshot({...snapshot,extra:'ignored'}));
      await assert.rejects(withInsightsReadOnlyRepository(async()=>{const guarded=await getRepository();return guarded.saveInsightReport({});}),/refused/);
      assert.throws(()=>db.exec("UPDATE insight_report_versions SET snapshot='{}'"),/immutable/);
      const concurrent=await Promise.allSettled([1,2].map(()=>publishInsightReport({...command,expectedVersion:3,requestKey:randomUUID()},snapshot)));
      assert.equal(concurrent.filter(item=>item.status==='fulfilled').length,1);assert.equal(concurrent.filter(item=>item.status==='rejected').length,1);
      for(let version=4;version<54;version++)await publishInsightReport({...command,expectedVersion:version,requestKey:randomUUID()},snapshot);
      const detail=await getInsightReportDetail(first.report.id);assert.equal(detail.report.currentVersion,54);assert.equal(detail.versions.length,50);assert.equal(detail.nextBeforeVersion,5);
      const older=await listInsightVersionHistory(first.report.id,5);assert.deepEqual(older.items.map(item=>item.version),[4,3,2,1]);assert.equal(older.nextBeforeVersion,null);
      assert.equal((await listInsightReports({periodType:'monthly'})).items.length,0);
      assert.equal((await listInsightReports()).items.length,1);
      await assert.rejects(getInsightReportDetail(randomUUID()),/不存在/);
      await assert.rejects(generateRuleInsightReport({...command,date:'2999-01-01',requestKey:randomUUID()}));
      assert.equal(original(),before);
      const resources=Object.fromEntries(BACKUP_TABLES.map(table=>[table,db.prepare('SELECT * FROM "'+table+'"').all().map(row=>sanitizeExportRow(table,row))]));
      const document={backup_version:BACKUP_VERSION,exported_at:new Date().toISOString(),schema:{supabase_migration:BACKUP_SCHEMA_VERSION},source:{backend:'supabase'},resources};
      assert.equal(parseBackupDocument(document).resources.insight_report_versions.length,54);
      const old={...document,backup_version:10,resources:{...resources}};delete old.resources.insight_reports;delete old.resources.insight_report_versions;assert.deepEqual(parseBackupDocument(old).resources.insight_reports,[]);
      fs.writeFileSync(process.env.INSIGHT_TEST_BACKUP,JSON.stringify(document));db.close();
    `);
    run("await import('./src/lib/db.ts');",target);
    const restored=spawnSync(process.execPath,["scripts/restore-backup.mjs",backup],{encoding:"utf8",env:{...process.env,EVAORBIT_DATA_BACKEND:"sqlite",EVAORBIT_SQLITE_PATH:target,VERCEL:""}});
    assert.equal(restored.status,0,restored.stderr||restored.stdout);
    run(String.raw`import assert from 'node:assert/strict';import{listInsightReports,getInsightReportDetail}from'./src/lib/services/insight-reports.ts';const list=await listInsightReports();assert.equal(list.items.length,1);const detail=await getInsightReportDetail(list.items[0].id,2);assert.equal(detail.report.currentVersion,54);assert.equal(detail.version.snapshot.summary,'An observed change');assert.equal(detail.version.snapshot.method,'ai');`,target);
  }finally{rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});}
});
