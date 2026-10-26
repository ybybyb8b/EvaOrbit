import "server-only";
import { createHash } from "node:crypto";
import { getRepository, withInsightEvidenceReadOnlyRepository } from "../repositories";
import { getInsightContext } from "./insight-context";
import { insightPeriod, type InsightContext } from "../insight-context";
import { parseInsightCommand, parseInsightSnapshot, insightPeriodTypes, type InsightSnapshot, type InsightPeriodType, type InsightCommand } from "../insight-reports";
import { dateOnly, ValidationError } from "../validation";
import { shiftDate, dateInEvaOrbit } from "../time";
import { HttpError } from "../errors";

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
  return { report: await (await getRepository()).getInsightReportForDate(date) };
}
export async function getInsightReportDetail(id: string, version?: number) {
  insightReportId(id);
  if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) throw new ValidationError("版本号无效。");
  const repository = await getRepository(), report = await repository.getInsightReport(id);
  if (!report) throw new HttpError("报告不存在或无权访问。", 404);
  const selected = await repository.getInsightVersion(id, version ?? report.currentVersion);
  if (!selected) throw new HttpError("报告版本不存在。", 404);
  const versions = await repository.listInsightVersions(id);
  return { report, version: selected, versions, nextBeforeVersion: versions.length === 50 ? versions.at(-1)!.version : null };
}
export async function listInsightVersionHistory(id: string, before: number) {
  insightReportId(id);
  if (!Number.isSafeInteger(before) || before < 1) throw new ValidationError("历史版本游标无效。");
  const repository=await getRepository();
  if (!await repository.getInsightReport(id)) throw new HttpError("报告不存在或无权访问。",404);
  const items=await repository.listInsightVersions(id,before);
  return {items,nextBeforeVersion:items.length===50?items.at(-1)!.version:null};
}
export async function getInsightSourceEvidence(id: string, version: number, evidenceId: string) {
  const detail=await getInsightReportDetail(id,version), evidence=detail.version.snapshot.evidence.find(item=>item.id===evidenceId);
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
  return save(command, snapshot, hash({ mode: "publish", command, snapshot }));
}
export async function prepareRuleInsightSnapshot(context: InsightContext, command: Pick<InsightCommand,"date"|"revisionNote">): Promise<InsightSnapshot> {
  const repository = await getRepository(), prior = await repository.getInsightReportForDate(command.date);
  const previous = prior ? await repository.getInsightVersion(prior.id, prior.currentVersion) : null;
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
    input: { capturedAt: context.capturedAt, fingerprint: context.snapshotFingerprint,
      coverage: { sources: context.coverage, metadata: context.metadataCoverage, evidence: context.evidenceCoverage, baselineReferences: context.baselineReferenceCoverage, omitted: context.omitted },
      metrics: { counts: context.metrics, domain: context.domainMetrics, trackers: context.trackerStatistics, nutrition: context.nutrition, tasks: context.tasks, relatedReports: context.relatedReports }, limitations: context.limitations },
  };
  return snapshot;
}
export async function generateRuleInsightReport(value: unknown) {
  const command=parseInsightCommand(value),context=await getInsightContext(`day/${command.date}`);
  // Hash the command, not freshly recaptured data: a lost-response retry replays the original immutable result.
  return save(command,await prepareRuleInsightSnapshot(context,command),hash({mode:"rules",command}));
}
