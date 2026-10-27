import { z } from "zod";
import { ValidationError } from "./validation.ts";
import { insightSnapshotSchema, type InsightSnapshot } from "./insight-reports.ts";

export const INSIGHT_AGENT = "ChatGPT Scheduled Task";
export const INSIGHT_MAX_ATTEMPTS = 3;
export const INSIGHT_LEASE_MINUTES = 30;
/** JSON object order can change across Postgres export and SQLite restore. Arrays remain ordered. */
export function stableInsightJson(value:unknown):string {
  const encoded=JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  if(encoded===undefined)throw new ValidationError("洞察快照需要有效 JSON。");
  return encoded;
}
export type InsightRunStatus = "running" | "succeeded" | "waiting_data" | "waiting_retry" | "failed";
export interface InsightRun {
  generation: number; inputFingerprint: string | null;
  id: string; date: string; status: InsightRunStatus; attemptCount: number; currentAttemptId: string | null;
  nextRetryAt: string | null; reportId: string | null; reportVersion: number | null; lastError: string | null;
  leaseUntil: string | null;
  createdAt: string; updatedAt: string;
}
export interface InsightRunAttempt {
  generation: number;
  id: string; runId: string; number: number; requestKey: string; status: "running" | "succeeded" | "failed" | "expired" | "waiting_data";
  base: InsightSnapshot; expectedVersion: number; leaseUntil: string; startedAt: string; finishedAt: string | null; error: string | null; outputHash: string | null;
}
export type InsightRunClaim = { run: InsightRun; attempt: InsightRunAttempt | null };
export type InsightRunListItem={date:string;status:InsightRunStatus|"not_started";run:InsightRun|null;canStart:boolean};
export type InsightAttemptSummary = Omit<InsightRunAttempt,"base">;
export type InsightRunClaimInput = { date: string; requestKey: string; base: InsightSnapshot; empty: boolean };
export type InsightRunFinish = { run: InsightRun; report: import("./insight-reports.ts").InsightReport; version: import("./insight-reports.ts").InsightVersion; newlyCompleted: boolean };
const finding = insightSnapshotSchema.shape.findings.element.omit({ method: true }).extend({
  id: z.string().regex(/^ai-[a-zA-Z0-9_-]{1,80}$/), revises: insightSnapshotSchema.shape.findings.element.shape.revises.default([]),
});
const outputSchema = z.object({ summary: insightSnapshotSchema.shape.summary, findings: z.array(finding).max(35) }).strict();
const mcpNames:Record<string,string>={evidenceIds:"evidence_ids",reportId:"report_id",findingId:"finding_id"};
function mcpOutputSchema(value:unknown):unknown {
  if(Array.isArray(value))return value.map(mcpOutputSchema);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,
    key==="properties"?Object.fromEntries(Object.entries(item as Record<string,unknown>).map(([name,field])=>[mcpNames[name]??name,mcpOutputSchema(field)])):
    key==="required"?(item as string[]).map(name=>mcpNames[name]??name):mcpOutputSchema(item)]));
  return value;
}
// Keep JSON Schema keywords intact when the surrounding MCP response becomes snake_case.
export const insightOutputSchemaJson=JSON.stringify(mcpOutputSchema(z.toJSONSchema(outputSchema)));
export function insightRunCanStart(run:InsightRun|null,now=new Date()) {
  if(!run)return true;
  if(run.status==="succeeded"||run.status==="failed")return false;
  if(run.status==="running")return !run.leaseUntil||Date.parse(run.leaseUntil)<=now.getTime();
  return !run.nextRetryAt||Date.parse(run.nextRetryAt)<=now.getTime();
}
export function importantInsightNotification(snapshot:InsightSnapshot) {
  const raw=snapshot.input.metrics.counts;
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return undefined;
  const counts=Object.values(raw) as Array<{complete?:boolean;observedCount?:number}>;
  if(!counts.length||counts.some(item=>item?.complete!==true)||!counts.some(item=>typeof item.observedCount==="number"&&item.observedCount>0))return undefined;
  return snapshot.findings.find(finding=>finding.method==="ai"&&finding.importance==="high"&&finding.kind==="fact");
}
export type InsightAgentOutput = z.infer<typeof outputSchema>;
export function parseInsightAgentOutput(value: unknown): InsightAgentOutput {
  const result=outputSchema.safeParse(value);
  if(!result.success)throw new ValidationError(`AI 日报内容无效：${result.error.issues[0]?.path.join(".")??"output"}`);
  return result.data;
}
export function parseInsightRequestKey(value: unknown) {
  const result=z.uuid().safeParse(value);if(!result.success)throw new ValidationError("运行请求需要有效 UUID。");return result.data;
}
function alias(value: unknown,mapping:Record<string,string>): Record<string,unknown> {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new ValidationError("AI 输出需要对象。");
  const result={...value} as Record<string,unknown>;
  for(const[from,to]of Object.entries(mapping))if(Object.hasOwn(result,from)){
    if(Object.hasOwn(result,to))throw new ValidationError("AI 输出含重复命名字段。");
    result[to]=result[from];delete result[from];
  }
  return result;
}
/** MCP uses snake_case; internal services keep the existing camelCase report types. */
export function insightOutputFromMcp(value:unknown) {
  const result=alias(value,{});
  if(Array.isArray(result.findings))result.findings=result.findings.map(value=>{
    const item=alias(value,{evidence_ids:"evidenceIds"});
    if(Array.isArray(item.revises))item.revises=item.revises.map(ref=>alias(ref,{report_id:"reportId",finding_id:"findingId"}));
    return item;
  });
  return result;
}
export function insightRunFromRow(row:Record<string,unknown>):InsightRun {
  return{id:String(row.id),date:String(row.date),status:row.status as InsightRunStatus,attemptCount:Number(row.attempt_count),currentAttemptId:row.current_attempt_id == null ? null : String(row.current_attempt_id),
    generation:Number(row.generation??1),inputFingerprint:row.input_fingerprint == null ? null : String(row.input_fingerprint),
    nextRetryAt:row.next_retry_at?String(row.next_retry_at):null,leaseUntil:row.lease_until?String(row.lease_until):null,reportId:row.report_id?String(row.report_id):null,reportVersion:row.report_version===null?null:Number(row.report_version),
    lastError:row.last_error?String(row.last_error):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};
}
export function insightAttemptSummaryFromRow(row:Record<string,unknown>):InsightAttemptSummary {
  return{id:String(row.id),runId:String(row.run_id),number:Number(row.attempt_number),requestKey:String(row.request_key),status:row.status as InsightRunAttempt["status"],
    generation:Number(row.generation??1),
    expectedVersion:Number(row.expected_version),
    leaseUntil:String(row.lease_until),startedAt:String(row.started_at),finishedAt:row.finished_at?String(row.finished_at):null,error:row.error?String(row.error):null,outputHash:row.output_hash?String(row.output_hash):null};
}
export function insightAttemptFromRow(row:Record<string,unknown>):InsightRunAttempt {
  return{...insightAttemptSummaryFromRow(row),base:(typeof row.base_snapshot==="string"?JSON.parse(row.base_snapshot):row.base_snapshot)as InsightSnapshot};
}
