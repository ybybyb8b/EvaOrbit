import "server-only";
import { createHash } from "node:crypto";
import { getRepository, withInsightEvidenceReadOnlyRepository } from "../repositories";
import { getInsightContext } from "./insight-context";
import { insightPeriod, type InsightContext } from "../insight-context";
import { parseInsightCommand, parseInsightSnapshot, insightPeriodTypes, type InsightSnapshot, type InsightPeriodType, type InsightCommand, insightReadingVersion } from "../insight-reports";
import { dateOnly, ValidationError } from "../validation";
import { shiftDate, dateInEvaOrbit } from "../time";
import { HttpError } from "../errors";
import { ConflictError } from "../errors";
import { insightReviewStatus, INSIGHT_FINGERPRINT_VERSION } from "../insight-review";

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function insightReportId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ValidationError("报告 ID 无效。");
  return value;
}
export async function listInsightReports(input: { periodType?: string; before?: string } = {}) {
  const periodType = input.periodType ?? "daily";
  if (!insightPeriodTypes.includes(periodType as InsightPeriodType)) throw new ValidationError("报告周期无效。");
  if (input.before) dateOnly(input.before);
  const items = await (await getRepository()).listInsightReports({ periodType: periodType as InsightPeriodType, before: input.before });
  return { items, nextBefore: items.length === 50 ? items.at(-1)!.periodStart : null };
}
export async function getInsightReportForDate(date: string) {
  dateOnly(date);
  const report=await (await getRepository()).getInsightReportForDate(date);return{report:report?.deletedAt?null:report};
}
export async function getInsightReportDetail(id: string, version?: number, includeReview = true) {
  insightReportId(id);
  if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) throw new ValidationError("版本号无效。");
  const repository = await getRepository(), report = await repository.getInsightReport(id);
  if (!report || report.deletedAt) throw new HttpError("报告不存在、已删除或无权访问。", 404);
  const selectedVersion=version??insightReadingVersion(report);
  if(selectedVersion===null||selectedVersion<=report.hiddenThroughVersion)throw new HttpError("报告版本已删除或正在等待重新生成。",404);
  const selected = await repository.getInsightVersion(id,selectedVersion);
  if (!selected) throw new HttpError("报告版本不存在。", 404);
  const versions = (await repository.listInsightVersions(id)).filter(item=>item.version>report.hiddenThroughVersion);
  const review = includeReview && report.periodType === "daily" ? await reviewInsightDay(report.periodStart, selected.snapshot) : null;
  return { report, version: selected, versions, review, nextBeforeVersion: versions.length === 50 ? versions.at(-1)!.version : null };
}
export async function deleteInsightReport(id:string,expectedVersion:number,expectedGeneration:number){
 insightReportId(id);if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1||!Number.isSafeInteger(expectedGeneration)||expectedGeneration<0)throw new ValidationError("删除日报需要有效的当前版本号。");
 const repository=await getRepository(),report=await repository.getInsightReport(id);if(!report)throw new HttpError("日报不存在或无权删除。",404);
 await repository.deleteInsightReport(id,expectedVersion,expectedGeneration);return{deleted:true,id,date:report.periodStart};
}
async function reviewInsightDay(date: string, snapshot?: InsightSnapshot | null) {
  const context = await getInsightContext(`day/${date}`), repository = await getRepository(), execution = await repository.getInsightRun(date);
  return { date, recording: context.recording, overview: context.overview, fingerprint: context.snapshotFingerprint,
    status: insightReviewStatus(context.recording, context.snapshotFingerprint, snapshot),
    run: execution?.run ?? null, canAnalyze: context.recording.complete };
}
export async function getInsightDayReview(date: string) {
  insightPeriod(`day/${date}`);
  const repository = await getRepository(), report = await repository.getInsightReportForDate(date);
  const detail = report&&!report.deletedAt&&insightReadingVersion(report)!==null ? await getInsightReportDetail(report.id, undefined, false) : null;
  const review=await reviewInsightDay(date,detail?.version.snapshot);
  return{...review,status:report?.deletedAt?"deleted" as const:review.status,deletedAt:report?.deletedAt??null,detail};
}
function requireCompleteMeals(context: InsightContext) {
  if (!context.recording.complete) throw new ConflictError(context.recording.message);
}
export async function listInsightVersionHistory(id: string, before: number) {
  insightReportId(id);
  if (!Number.isSafeInteger(before) || before < 1) throw new ValidationError("历史版本游标无效。");
  const repository=await getRepository();
  const report=await repository.getInsightReport(id);if(!report||report.deletedAt)throw new HttpError("报告不存在或已删除。",404);
  const items=(await repository.listInsightVersions(id,before)).filter(item=>item.version>report.hiddenThroughVersion);
  return {items,nextBeforeVersion:items.length===50?items.at(-1)!.version:null};
}
export async function getInsightSourceEvidence(id: string, version: number, evidenceId: string) {
  const detail=await getInsightReportDetail(id,version,false), evidence=detail.version.snapshot.evidence.find(item=>item.id===evidenceId);
  if(!evidence?.recordId)throw new HttpError("此证据是指标窗口，没有独立原始记录。",404);
  const recordId=Number(evidence.recordId);
  if(!Number.isSafeInteger(recordId)||recordId<1)throw new ValidationError("原始记录 ID 无效。");
  const record=await withInsightEvidenceReadOnlyRepository(async()=>{
    const repository=await getRepository();
    switch(evidence.resource??evidence.metrics.source){
      case "food_log":return repository.getFoodLog(recordId);
      case "drink_log":return repository.getDrinkLog(recordId);
      case "training_log":return repository.getTrainingLog(recordId);
      case "health_record":return repository.getHealthRecord(recordId);
      case "task":return repository.getTask(recordId);
      case "weight":return repository.getWeightRecord(recordId);
      case "periodFlow":return repository.getMenstrualFlowRecord(recordId);
      case "tracker":{const entry=await repository.getTrackerEntry(recordId);return entry&&String(entry.trackerId)===evidence.resourceId?entry:null;}
      default:throw new ValidationError("此来源暂不支持原始记录读取。");
    }
  });
  if(!record)throw new HttpError("原始记录已删除或无权读取；报告快照仍然保留。",404);
  return {evidence,record};
}
async function save(command: InsightCommand, snapshot: InsightSnapshot, requestHash: string) {
  insightPeriod(`day/${command.date}`);
  return (await getRepository()).saveInsightReport({ ...command, periodEnd: shiftDate(command.date, 1), requestHash, snapshot: parseInsightSnapshot(snapshot) });
}
export async function publishInsightReport(value: unknown, content: unknown) {
  const command = parseInsightCommand(value), snapshot = parseInsightSnapshot(content);
  const requestHash=hash({mode:"publish",command,snapshot}),replay=await replayInsightRequest(command,requestHash);if(replay)return replay;
  const prior=await (await getRepository()).getInsightReportForDate(command.date);if(prior?.deletedAt)throw new HttpError("日报已删除，请手动请求重新生成。",410);
  const context = await getInsightContext(`day/${command.date}`); requireCompleteMeals(context);
  if (snapshot.input.fingerprintVersion !== INSIGHT_FINGERPRINT_VERSION || snapshot.input.fingerprint !== context.snapshotFingerprint)
    throw new ConflictError("数据已更新，请基于最新记录重新分析。");
  return save(command, snapshot, requestHash);
}
async function replayInsightRequest(command:InsightCommand,requestHash:string){
  const repository=await getRepository(),version=await repository.getInsightVersionForRequest(command.requestKey);if(!version)return null;
  const report=await repository.getInsightReport(version.reportId);
  if(report?.deletedAt||report&&version.version<=report.hiddenThroughVersion)throw new HttpError("日报已删除，请手动请求重新生成。",410);
  if(!report||report.periodStart!==command.date||version.requestHash!==requestHash)throw new ConflictError("请求标识已用于其他内容，请重新发起分析。");
  return{report,version};
}
export async function prepareRuleInsightSnapshot(context: InsightContext, command: Pick<InsightCommand,"date"|"revisionNote">): Promise<InsightSnapshot> {
  const repository = await getRepository(), prior = await repository.getInsightReportForDate(command.date);
  const previous = prior&&!prior.deletedAt&&prior.currentVersion>prior.hiddenThroughVersion ? await repository.getInsightVersion(prior.id, prior.currentVersion) : null;
  const evidence: InsightSnapshot["evidence"] = [{
    id: "food-drink-window", label: "Food & Drink · 近 30 天规则分析窗口", resource: null, recordId: null, resourceId: null, href: `/food?date=${command.date}`,
    from: context.findings[0]?.evidenceWindow.from ?? context.period.baseline.from, to: context.period.to,
    metrics: { food: context.metrics.food, drink: context.metrics.drink },
  }, ...[...context.evidence, ...context.baselineReferences].map((ref, index) => ({
    id: `record-${index}`, label: `${ref.source} #${ref.id}`, resource: ref.resource, recordId: String(ref.id), resourceId: "resourceId" in ref ? ref.resourceId === null ? null : String(ref.resourceId) : String(ref.id),
    href: ref.source==="food"&&"occurredAt" in ref?`/food?date=${dateInEvaOrbit(new Date(ref.occurredAt))}`:"href" in ref ? ref.href : null, from: null, to: null,
    metrics: { source:ref.source, ...("occurredAt" in ref ? { occurredAt: ref.occurredAt } : {dueDate:ref.dueDate,completedAt:ref.completedAt}), ...("hasExplicitTime" in ref ? { hasExplicitTime: ref.hasExplicitTime } : {}), ...("provenance" in ref ? { provenance: ref.provenance } : {}) },
  }))];
  const findings: InsightSnapshot["findings"] = context.findings.map(finding => ({
    id: finding.id, title: finding.title, body: finding.body, domain: "food", importance: "normal", kind: "interpretation", method: "rule", evidenceIds: ["food-drink-window"],
    revises: previous?.snapshot.findings.some(item => item.id === finding.id) ? [{ reportId: previous.reportId, version: previous.version, findingId: finding.id }] : [],
  }));
  const snapshot: InsightSnapshot = {
    summary: findings.length ? `本期记录中有 ${findings.length} 条值得回看的观察。` : "本期暂无值得特别关注的发现。",
    findings, evidence, method: "rule", agent: "EvaOrbit/buildFoodDrinkInsights", revisionNote: command.revisionNote,
    input: { capturedAt: context.capturedAt, fingerprint: context.snapshotFingerprint, fingerprintVersion: INSIGHT_FINGERPRINT_VERSION,
      coverage: { sources: context.coverage, metadata: context.metadataCoverage, evidence: context.evidenceCoverage, baselineReferences: context.baselineReferenceCoverage, omitted: context.omitted },
      metrics: { counts: context.metrics, domain: context.domainMetrics, trackers: context.trackerStatistics, nutrition: context.nutrition, tasks: context.tasks, relatedReports: context.relatedReports, recording: context.recording, overview: context.overview, ruleCandidates: findings }, limitations: context.limitations },
  };
  return snapshot;
}
export async function generateRuleInsightReport(value: unknown) {
  const command=parseInsightCommand(value),requestHash=hash({mode:"rules",command}),replay=await replayInsightRequest(command,requestHash);if(replay)return replay;
  const context=await getInsightContext(`day/${command.date}`);
  requireCompleteMeals(context);
  const repository = await getRepository(), prior = await repository.getInsightReportForDate(command.date);
  if (prior) {
    if(prior.deletedAt)throw new HttpError("日报已删除，请手动请求重新生成。",410);
    const readingVersion=insightReadingVersion(prior),reading=readingVersion===null?null:await repository.getInsightVersion(prior.id,readingVersion);
    if (reading?.snapshot.input.fingerprintVersion === INSIGHT_FINGERPRINT_VERSION && reading.snapshot.input.fingerprint === context.snapshotFingerprint) return { report: prior, version: reading };
  }
  // Hash the command, not freshly recaptured data: a lost-response retry replays the original immutable result.
  return save(command,await prepareRuleInsightSnapshot(context,command),requestHash);
}
