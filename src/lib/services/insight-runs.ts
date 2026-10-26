import "server-only";
import { createHash } from "node:crypto";
import { getRepository } from "../repositories";
import { insightPeriod } from "../insight-context";
import { parseInsightSnapshot, type InsightSnapshot } from "../insight-reports";
import { INSIGHT_AGENT, insightOutputSchemaJson, insightRunCanStart, importantInsightNotification, parseInsightAgentOutput, parseInsightRequestKey, stableInsightJson, type InsightRunClaim, type InsightRunListItem } from "../insight-runs";
import { ConflictError, HttpError } from "../errors";
import { ValidationError } from "../validation";
import { dateInEvaOrbit, shiftDate } from "../time";
import { getInsightContext } from "./insight-context";
import { prepareRuleInsightSnapshot } from "./insight-reports";
import { notifyLuciusActivity } from "./push";

function claimResult(value:InsightRunClaim) {
  const ready=value.run.status==="running"&&value.attempt?.status==="running"&&value.run.currentAttemptId===value.attempt.id&&Date.parse(value.attempt.leaseUntil)>Date.now();
  return{run:value.run,ready,attemptId:value.attempt?.id??null,leaseUntil:value.attempt?.leaseUntil??null,
    ...(ready?{baseSnapshot:value.attempt!.base,outputSchemaJson:insightOutputSchemaJson}:{})};
}
export async function getInsightRunStatus(id:unknown) {
  const period=insightPeriod(id),repository=await getRepository(),state=await repository.getInsightRun(period.date);
  return{date:period.date,status:state?.run.status??"not_started",run:state?.run??null,canStart:insightRunCanStart(state?.run??null),
    attempts:state?await repository.listInsightRunAttempts(state.run.id):[]};
}
export async function listInsightRunStatus(dueOnly=false) {
  const repository=await getRepository(),items=await repository.listInsightRuns(),today=dateInEvaOrbit(),yesterday=shiftDate(today,-1);
  const existing:InsightRunListItem[]=items.map(run=>({date:run.date,status:run.status,run,canStart:insightRunCanStart(run)}));
  if(!items.some(run=>run.date===yesterday))existing.unshift({date:yesterday,status:"not_started",run:null,canStart:true});
  return dueOnly?existing.filter(item=>item.date>=shiftDate(today,-7)&&item.date<today&&item.canStart).sort((a,b)=>b.date.localeCompare(a.date)):existing;
}
export async function startInsightRun(id:unknown,requestKey:unknown,fingerprint:unknown) {
  const period=insightPeriod(id),key=parseInsightRequestKey(requestKey);
  if(typeof fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(fingerprint))throw new ValidationError("请先读取 insight_context，并提供它的快照指纹。");
  const repository=await getRepository(),state=await repository.getInsightRun(period.date);
  if(state?.attempt?.requestKey===key)return claimResult(state);
  if(state&&!insightRunCanStart(state.run))return claimResult({run:state.run,attempt:null});
  if(state&&state.run.attemptCount>=3){
    if(!state.attempt)throw new ConflictError("执行历史不完整，需要检查后再运行。");
    return claimResult(await repository.claimInsightRun({date:period.date,requestKey:key,base:state.attempt.base,empty:false}));
  }
  const context=await getInsightContext(period.id);
  if(context.snapshotFingerprint!==fingerprint)throw new ConflictError("上下文已变化，请重新读取 insight_context 后领取执行租约。");
  const base=await prepareRuleInsightSnapshot(context,{date:period.date,revisionNote:"ChatGPT 自动日报"});
  base.method="ai";base.agent=INSIGHT_AGENT;
  const hrefs:Record<string,string>={food:`/food?date=${period.date}`,drink:"/drinks/history",training:"/health?view=training",health:"/health",weight:"/health",periodFlow:"/health",tracker:"/trackers"};
  for(const[source,metrics]of Object.entries(context.metrics))base.evidence.push({id:`window-${source}`,label:`${source} · 当日与 7/30 天基线`,resource:null,recordId:null,resourceId:null,
    href:hrefs[source]??null,from:context.period.baseline.from,to:context.period.to,metrics:{observedCount:metrics.observedCount,complete:metrics.complete,baseline7DailyMean:metrics.baseline7DailyMean,baseline30DailyMean:metrics.baseline30DailyMean,deltaFrom7DailyMean:metrics.deltaFrom7DailyMean,coverage:context.coverage[source]}});
  base.evidence.push({id:"window-tasks",label:"Tasks · 到期与完成记录",resource:null,recordId:null,resourceId:null,href:"/tasks",from:context.period.from,to:context.period.to,metrics:context.tasks});
  const empty=Object.values(context.metrics).every(item=>item.observedCount===0)&&context.tasks.dueCount===0&&context.tasks.completedCount===0;
  return claimResult(await repository.claimInsightRun({date:period.date,requestKey:key,base:parseInsightSnapshot(base),empty}));
}
export async function completeInsightRun(id:unknown,attemptId:unknown,output:unknown) {
  const period=insightPeriod(id),key=parseInsightRequestKey(attemptId),repository=await getRepository(),state=await repository.getInsightRun(period.date);
  if(!state?.attempt||state.run.currentAttemptId!==key)throw new ConflictError("执行尝试不存在或已被新的租约替代。");
  const parsed=parseInsightAgentOutput(output),base=state.attempt.base;
  const snapshot:InsightSnapshot=parseInsightSnapshot({...base,summary:parsed.summary,findings:[...base.findings,...parsed.findings.map(finding=>({...finding,method:"ai" as const}))]});
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
