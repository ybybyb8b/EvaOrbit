import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

function run(program, env = {}) {
  const result = spawnSync(process.execPath, ["--experimental-loader", pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href, "--input-type=module", "--eval", program], { encoding: "utf8", env: { ...process.env, ...env } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("Daily context validates Shanghai boundaries, baselines, deterministic snapshots, caps and provenance", () => run(String.raw`
  import assert from 'node:assert/strict';
  import {buildInsightContext,insightPeriod} from './src/lib/insight-context.ts';
  const now=new Date('2026-03-01T16:00:00Z'),period=insightPeriod('yesterday',now);
  assert.equal(period.date,'2026-03-01');
  assert.equal(period.from,'2026-02-28T16:00:00.000Z');
  assert.equal(period.to,'2026-03-01T16:00:00.000Z');
  assert.equal(insightPeriod('yesterday',new Date('2026-01-01T00:00:00Z')).date,'2025-12-31');
  assert.equal(insightPeriod('day/2024-02-29',now).date,'2024-02-29');
  for(const id of [1,'day/2026-02-29','day/2026-03-02','day/2026-13-01','month/2026-01','quarter/2026-Q1','year/2026','../x']) assert.throws(()=>insightPeriod(id,now));
  const calls=[];
  let capped=false,reverse=false,weight=60,failed=false;
  const reader=new Proxy({
    async listTasks(){return [{id:1,title:'Due only',dueDate:period.date,completed:false,completedAt:null},{id:2,title:'Completed elsewhere',dueDate:'2025-01-01',completed:true,completedAt:period.from},{id:3,title:'End excluded',dueDate:null,completed:true,completedAt:period.to}];},
    async listTrackers(){return [{id:1,name:'Measure'}];},
    async listTrackerFields(){return [{id:1,key:'score',name:'Score',type:'number',precision:1,includeInStats:true}];},
    async getNutritionSettings(){return {restingEnergyKcal:null,activeEnergyKcal:null,notes:''};},
  },{get(target,key){if(key in target)return target[key];return async(...args)=>{
    if(failed)throw new Error('source failure');
    const range=args.at(-1);calls.push({key,range});
    assert(range.from<range.to);assert(range.from>=period.baseline.from);assert(range.to<=period.to);
    if(key==='listWeightRecords')return [{id:1,occurredAt:range.from,weightKg:weight,source:'apple_health',occurredHasExplicitTime:false}];
    if(key==='listTrackerEntries')return [{id:2,trackerId:1,occurredAt:range.from,values:{score:Date.parse(range.from)}}];
    if(key==='listTrainingLogs')return [{id:1,occurredAt:range.from,durationMinutes:30,trainingType:'strength'}];
    if(key==='listDrinkLogs'&&capped&&range.to===period.to)return Array.from({length:500},(_,id)=>({id,occurredAt:range.from}));
    if(key==='listHealthRecords'){const rows=[{id:3,occurredAt:range.from,type:'note'},{id:4,occurredAt:range.from,type:'visit'}];return reverse?rows.reverse():rows;}
    return [];
  };}});
  const first=await buildInsightContext(reader,period,now.toISOString());
  assert.equal(calls.length,217);
  assert.equal(first.metrics.training.baseline7DailyMean,1);
  assert.equal(first.metrics.training.baseline30DailyMean,1);
  assert.equal(first.metrics.training.deltaFrom7DailyMean,0);
  assert.equal(first.tasks.dueCount,1);assert.equal(first.tasks.completedCount,1);
  assert.equal(first.domainMetrics.training.recordedMinutes,30);
  assert.equal(first.trackerStatistics.length,1);
  assert.equal(first.trackerStatistics[0].baseline30.numericFields[0].latest,Date.parse('2026-02-27T16:00:00.000Z'));
  assert(first.evidence.some(item=>item.source==='tracker'&&item.id===2&&item.resourceId===1));
  assert(first.evidence.some(item=>item.source==='weight'&&item.provenance==='apple_health'&&item.hasExplicitTime===false));
  assert.equal(first.baselineReferenceCoverage.truncated,true);
  reverse=true;
  const second=await buildInsightContext(reader,period,'2026-03-02T00:00:00Z');
  assert.equal(first.snapshotFingerprint,second.snapshotFingerprint);
  assert.deepEqual(first.metrics,second.metrics);
  assert.equal(first.snapshotFingerprint,(await buildInsightContext(reader,period,now.toISOString(),[{id:"10000000-0000-4000-8000-000000000001",periodStart:"2026-02-28",currentVersion:9}])).snapshotFingerprint);
  weight=61;
  assert.notEqual(first.snapshotFingerprint,(await buildInsightContext(reader,period,now.toISOString())).snapshotFingerprint);
  capped=true;
  const limited=await buildInsightContext(reader,period,now.toISOString());
  assert.equal(limited.coverage.drink.status,'possibly_truncated');
  assert.deepEqual(limited.coverage.drink.cappedDates,[period.date]);
  assert.equal(limited.metrics.drink.baseline7DailyMean,null);
  assert.equal(limited.nutrition.summary,null);assert.deepEqual(limited.findings,[]);
  assert.equal(limited.evidenceCoverage.truncated,true);assert.equal(limited.evidence.length,100);
  failed=true;await assert.rejects(buildInsightContext(reader,period,now.toISOString()),/source failure/);
`));

test("actual SQLite and service reads reject writes, preserve subscriptions and match MCP get", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "eo-insights-"));
  try {
    run(String.raw`
      import assert from 'node:assert/strict';
      import {DatabaseSync} from 'node:sqlite';
      import {getRepository,withInsightsReadOnlyRepository,withMcpRequestRepository} from './src/lib/repositories/index.ts';
      import {getInsightContext} from './src/lib/services/insight-context.ts';
      import {resourceRegistry} from './src/lib/mcp/resource-registry.server.ts';
      import {createSubscription} from './src/lib/db.ts';
      const repository=await getRepository();
      const subscription=createSubscription({name:'Overdue',currentAmountMinor:1200,currency:'CNY',billingIntervalValue:1,billingIntervalUnit:'month',startedOn:'2026-01-01',nextRenewalOn:'2026-01-01',autoRenew:true,reminderEnabled:false,reminderDaysBefore:3,reminderTime:null,notes:''});
      const connection=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      const tables=connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
      const snapshot=()=>JSON.stringify(tables.map(name=>[name,connection.prepare('SELECT * FROM "'+name+'"').all()]));
      const before=snapshot();
      for(const name of tables)for(const op of ['INSERT','UPDATE','DELETE'])connection.exec('CREATE TRIGGER "readonly_'+op+'_'+name+'" BEFORE '+op+' ON "'+name+'" BEGIN SELECT RAISE(ABORT,\'Insights attempted write\'); END;');
      await assert.rejects(withInsightsReadOnlyRepository(async()=>{const repo=await getRepository();return repo.createTask({title:'Forbidden'});}),/refused/);
      await assert.rejects(withInsightsReadOnlyRepository(async()=>{const repo=await getRepository();return repo.listSubscriptions();}),/refused/);
      const internal=await getInsightContext('day/2026-01-01');
      const external=await withMcpRequestRepository({userId:'local',accessToken:'test'},()=>resourceRegistry.get('insight_context','day/2026-01-01'));
      assert.equal(external.snapshot_fingerprint,internal.snapshotFingerprint);
      assert.equal(external.period.from,internal.period.from);
      assert.equal(external.metrics.food.observed_count,internal.metrics.food.observedCount);
      assert.equal(internal.coverage.food.recordingCompleteness,'unknown');
      assert.deepEqual(internal.findings,[]);
      assert.equal(snapshot(),before);
      assert.equal((await repository.listSubscriptionPayments(subscription.id)).length,0);
      connection.close();
    `, { EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "test.db"), VERCEL: "" });
  } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});
