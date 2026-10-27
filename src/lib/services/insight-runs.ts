import "server-only";
import { createHash } from "node:crypto";
import { getRepository } from "../repositories";
import { insightPeriod } from "../insight-context";
import { parseInsightSnapshot, insightReadingVersion, type InsightSnapshot } from "../insight-reports";
import { INSIGHT_AGENT, insightOutputSchemaJson, insightRunCanStart, importantInsightNotification, parseInsightAgentOutput, parseInsightRequestKey, stableInsightJson, type InsightRunClaim, type InsightRunListItem } from "../insight-runs";
import { ConflictError, HttpError } from "../errors";
import { ValidationError } from "../validation";
import { dateInEvaOrbit, shiftDate } from "../time";
import { getInsightContext } from "./insight-context";
import { getInsightDayReview, prepareRuleInsightSnapshot } from "./insight-reports";
import { notifyLuciusActivity } from "./push";

function claimResult(value:InsightRunClaim) {
  const ready=value.run.status==="running"&&value.attempt?.status==="running"&&value.run.currentAttemptId===value.attempt.id&&value.run.generation===value.attempt.generation&&Date.parse(value.attempt.leaseUntil)>Date.now();
  return{run:value.run,ready,attemptId:value.attempt?.id??null,leaseUntil:value.attempt?.leaseUntil??null,
    ...(ready?{baseSnapshot:value.attempt!.base,outputSchemaJson:insightOutputSchemaJson}:{})};
}
export async function getInsightRunStatus(id:unknown) {
 const period=insightPeriod(id),repository=await getRepository(),review=await getInsightDayReview(period.date),state=await repository.getInsightRun(period.date);
 const changed=Boolean(state&&state.run.inputFingerprint!==review.fingerprint);
 const active=state?.run.status==='running'&&state.run.leaseUntil&&Date.parse(state.run.leaseUntil)>Date.now();
 return{date:period.date,status:state?.run.status??('not_started' as const),run:state?.run??null,recording:review.recording,analysisStatus:review.status,needsReanalysis:review.status==='data_updated',
  canStart:review.canAnalyze&&review.status!=="completed"&&review.status!=="deleted"&&!active&&(changed||insightRunCanStart(state?.run??null)),attempts:state?await repository.listInsightRunAttempts(state.run.id):[]};
}
export async function listInsightRunStatus(dueOnly=false) {
 const repository=await getRepository(),items=await repository.listInsightRuns(),today=dateInEvaOrbit(),yesterday=shiftDate(today,-1);
 const existing:InsightRunListItem[]=items.map(run=>({date:run.date,status:run.status,run,canStart:insightRunCanStart(run)}));
 const status=await getInsightRunStatus('yesterday'),index=existing.findIndex(item=>item.date===yesterday);
 const yesterdayItem={date:yesterday,status:status.status,run:status.run,canStart:status.canStart};
 if(index<0)existing.unshift(yesterdayItem);else existing[index]=yesterdayItem;
 // User-requested older dates remain eligible; this never creates a backfill run.
 return dueOnly?existing.filter(item=>item.date<today&&item.canStart).sort((a,b)=>b.date.localeCompare(a.date)):existing;
}
export async function requestInsightAnalysis(date:string,fingerprint:unknown){
 const period=insightPeriod('day/'+date),review=await getInsightDayReview(period.date),repository=await getRepository();
 if(!review.canAnalyze)throw new ConflictError(review.recording.message);
 if(fingerprint!==review.fingerprint)throw new ConflictError('数据已更新，请刷新记录检查后再分析。');
 if(review.status==='completed')return{queued:false,run:review.run};
 const run=await repository.queueInsightRun(period.date,review.fingerprint,review.run?.generation??0);return{queued:run.status!=='succeeded',run};
}
export async function startInsightRun(id:unknown,requestKey:unknown,fingerprint:unknown) {
 const period=insightPeriod(id),key=parseInsightRequestKey(requestKey),repository=await getRepository();
 if(typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint))throw new ValidationError('请先读取 insight_context，并提供它的快照指纹。');
 const reportBeforeStart=await repository.getInsightReportForDate(period.date);
 if(reportBeforeStart?.deletedAt)return{ready:false,run:null,attemptId:null,leaseUntil:null,analysisStatus:'deleted'};
 const state=await repository.getInsightRun(period.date),replay=await repository.getInsightRunAttempt({requestKey:key});
 if(replay){if(!state||replay.runId!==state.run.id)throw new ConflictError('运行请求 UUID 已用于另一个日期。');return claimResult({run:state.run,attempt:replay});}
 const context=await getInsightContext(period.id);
 if(context.snapshotFingerprint!==fingerprint)throw new ConflictError('上下文已变化，请重新读取 insight_context 后领取执行租约。');
 if(!context.recording.complete)return{ready:false,run:state?.run??null,attemptId:null,leaseUntil:null,recording:context.recording,analysisStatus:'waiting_records'};
 const report=await repository.getInsightReportForDate(period.date);
 const readingVersion=report?insightReadingVersion(report):null,reading=report&&readingVersion!==null?await repository.getInsightVersion(report.id,readingVersion):null;
 if(reading?.snapshot.method==='ai'&&reading.snapshot.input.fingerprintVersion===2&&reading.snapshot.input.fingerprint===context.snapshotFingerprint)
  return{ready:false,run:state?.run??null,attemptId:null,leaseUntil:null,recording:context.recording,analysisStatus:'completed'};
 const base=await prepareRuleInsightSnapshot(context,{date:period.date,revisionNote:'每日复盘'});
 // Deterministic candidates are analysis material; the Agent selects the final findings.
 base.method='ai';base.agent=INSIGHT_AGENT;base.findings=[];
 const hrefs:Record<string,string>={food:'/food?date='+period.date,drink:'/drinks/history',training:'/health?view=training',health:'/health',weight:'/health',periodFlow:'/health',tracker:'/trackers'};
 for(const[source,metrics]of Object.entries(context.metrics))base.evidence.push({id:'window-'+source,label:source+' · 当日与 7/30 天基线',resource:null,recordId:null,resourceId:null,
  href:hrefs[source]??null,from:context.period.baseline.from,to:context.period.to,metrics:{observedCount:metrics.observedCount,complete:metrics.complete,baseline7DailyMean:metrics.baseline7DailyMean,baseline30DailyMean:metrics.baseline30DailyMean,deltaFrom7DailyMean:metrics.deltaFrom7DailyMean,coverage:context.coverage[source]}});
 base.evidence.push({id:'window-tasks',label:'待办记录',resource:null,recordId:null,resourceId:null,href:'/tasks',from:context.period.from,to:context.period.to,metrics:context.tasks});
 return claimResult(await repository.claimInsightRun({date:period.date,requestKey:key,base:parseInsightSnapshot(base),empty:false}));
}
export async function completeInsightRun(id:unknown,attemptId:unknown,output:unknown) {
  const period=insightPeriod(id),key=parseInsightRequestKey(attemptId),repository=await getRepository(),state=await repository.getInsightRun(period.date),attempt=await repository.getInsightRunAttempt({id:key});
  const report=await repository.getInsightReportForDate(period.date),priorResult=attempt?.status==='succeeded'?await repository.getInsightVersionForRequest(key):null;
  if(report?.deletedAt||report&&priorResult&&priorResult.version<=report.hiddenThroughVersion)throw new HttpError('日报已删除，请手动请求重新生成。',410);
  if(!state||!attempt||attempt.runId!==state.run.id)throw new ConflictError("执行尝试不存在或租约已被替代。");
  if(attempt.status!=='succeeded'){
   if(state.run.currentAttemptId!==key||attempt.status!=='running')throw new ConflictError('执行租约已被替代。');
   const context=await getInsightContext(period.id);
   if(!context.recording.complete||attempt.base.input.fingerprintVersion!==2||context.snapshotFingerprint!==attempt.base.input.fingerprint){
    await repository.failInsightRun(key,'Records updated during analysis; recapture required',true);
    throw new ConflictError(context.recording.complete?'数据已更新，请重新分析。':context.recording.message);
   }
  }
  const parsed=parseInsightAgentOutput(output),base=attempt.base;
  const snapshot:InsightSnapshot=parseInsightSnapshot({...base,summary:parsed.summary,findings:[...(base.input.fingerprintVersion===2?[]:base.findings),...parsed.findings.map(finding=>({...finding,method:"ai" as const}))]});
  const outputHash=createHash("sha256").update(stableInsightJson(snapshot)).digest("hex");
  const result=await repository.finishInsightRun(key,snapshot,outputHash);
  const important=importantInsightNotification(snapshot);
  if(result.newlyCompleted&&important){
    await notifyLuciusActivity(repository,{kind:"daily_review",title:`EvaOrbit · ${period.date} 有值得关注的发现`,body:important.title.slice(0,200),url:`/insights?report=${result.report.id}`,tag:`insight-run:${result.run.id}`});
  }
  return{run:result.run,report:result.report,version:result.version.version,replayed:!result.newlyCompleted};
}
export async function failInsightRun(id:unknown,attemptId:unknown,error:unknown,retryable:unknown) {
  const period=insightPeriod(id),key=parseInsightRequestKey(attemptId);
  if(typeof error!=="string"||!error.trim()||error.length>1000||typeof retryable!=="boolean")throw new ValidationError("失败原因或重试标记无效。");
  const repository=await getRepository(),state=await repository.getInsightRun(period.date);
  if(!state)throw new HttpError("运行不存在。",404);
  const attempts=await repository.listInsightRunAttempts(state.run.id);
  if(!attempts.some(attempt=>attempt.id===key))throw new ConflictError("执行尝试不属于这个日期。");
  const safeError=error.trim().replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]{12,}/gi,"[redacted]");
  return{run:await repository.failInsightRun(key,safeError,retryable)};
}
