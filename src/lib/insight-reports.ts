import { z } from "zod";
import { ValidationError } from "./validation.ts";
import { dateOnly } from "./validation.ts";

export const insightPeriodTypes = ["daily", "monthly", "quarterly", "yearly"] as const;
export type InsightPeriodType = typeof insightPeriodTypes[number];
const uuid = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const jsonObject = z.record(z.string(), z.unknown());
const localHref = z.string().max(500).regex(/^\/(?:food|drinks|trackers|health|tasks|insights)(?:[/?#]|$)/).refine(value => !value.includes("\\") && !/[\r\n]/.test(value));
const evidenceSchema = z.object({
  id: text(100), label: text(500), resource: z.string().max(80).nullable(), recordId: z.string().max(100).nullable(),
  resourceId: z.string().max(100).nullable(), href: localHref.nullable(),
  from: z.iso.datetime({ offset: true }).nullable(), to: z.iso.datetime({ offset: true }).nullable(),
  metrics: jsonObject,
}).strict();
const findingSchema = z.object({
  id: text(100), title: text(300), body: text(5000),
  domain: z.enum(["food", "drink", "tracker", "training", "health", "tasks", "cross_domain"]),
  importance: z.enum(["low", "normal", "high"]), kind: z.enum(["fact", "interpretation", "hypothesis"]),
  method: z.enum(["rule", "ai"]), evidenceIds: z.array(text(100)).min(1).max(200),
  revises: z.array(z.object({ reportId: uuid, version: z.number().int().positive(), findingId: text(100) }).strict()).max(10),
}).strict();
export const insightSnapshotSchema = z.object({
  summary: text(5000), method: z.enum(["rule", "ai"]), agent: z.string().trim().min(1).max(200), revisionNote: z.string().trim().max(2000),
  findings: z.array(findingSchema).max(40), evidence: z.array(evidenceSchema).max(200),
  input: z.object({ capturedAt: z.iso.datetime({ offset: true }), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), fingerprintVersion: z.number().int().positive().optional(),
    coverage: jsonObject, metrics: jsonObject, limitations: z.array(z.string().max(2000)).max(40) }).strict(),
}).strict();
export type InsightSnapshot = z.infer<typeof insightSnapshotSchema>;
export type InsightFinding = InsightSnapshot["findings"][number];
export type InsightEvidence = InsightSnapshot["evidence"][number];
const commandSchema = z.object({
  date: z.string(), expectedVersion: z.number().int().min(0).max(1000000), requestKey: uuid,
  revisionNote: z.string().trim().max(2000).default(""),
}).strict();

export function parseInsightCommand(value: unknown) {
  const result = commandSchema.safeParse(value);
  if (!result.success) throw new ValidationError("报告参数无效：需要日期、请求 UUID 和当前版本号。");
  dateOnly(result.data.date);
  return result.data;
}
export function parseInsightSnapshot(value: unknown): InsightSnapshot {
  const result = insightSnapshotSchema.safeParse(value);
  if (!result.success) throw new ValidationError(`报告内容无效：${result.error.issues[0]?.path.join(".") ?? "snapshot"}`);
  const snapshot = result.data, ids = new Set(snapshot.evidence.map(item => item.id));
  if (ids.size !== snapshot.evidence.length || new Set(snapshot.findings.map(item => item.id)).size !== snapshot.findings.length
    || snapshot.findings.some(finding => finding.evidenceIds.some(id => !ids.has(id)) || snapshot.method === "rule" && finding.method !== "rule"))
    throw new ValidationError("发现或证据 ID 重复、引用不存在，或规则报告包含了 AI 来源。");
  if (snapshot.evidence.some(item => item.from && item.to && Date.parse(item.from) >= Date.parse(item.to))) throw new ValidationError("证据时间范围无效。");
  try { if (new TextEncoder().encode(JSON.stringify(snapshot)).length > 524288) throw new Error(); }
  catch { throw new ValidationError("报告快照需要是有效 JSON，且不能超过 512 KiB。"); }
  return snapshot;
}
export type InsightCommand = ReturnType<typeof parseInsightCommand>;
export interface InsightReport {
  deletedAt: string | null; hiddenThroughVersion: number;
  readingVersion: number | null; readingMethod: "rule" | "ai" | null;
  id: string; periodType: InsightPeriodType; periodStart: string; periodEnd: string; timeZone: "Asia/Shanghai";
  currentVersion: number; status: "ready" | "no_findings"; createdAt: string; updatedAt: string;
}
export interface InsightVersion {
  id: string; reportId: string; version: number; requestKey: string; requestHash: string; snapshot: InsightSnapshot; createdAt: string;
}
export type InsightVersionSummary = Pick<InsightVersion, "id" | "reportId" | "version" | "createdAt"> & Pick<InsightSnapshot, "method" | "agent" | "revisionNote">;
export type InsightReportWrite = InsightCommand & { periodEnd: string; requestHash: string; snapshot: InsightSnapshot };
export type InsightReportResult = { report: InsightReport; version: InsightVersion };
export function insightReadingVersion(report:InsightReport){return report.readingVersion??(report.hiddenThroughVersion===0&&report.currentVersion>0?report.currentVersion:null);}

export function insightReportFromRow(row: Record<string, unknown>): InsightReport {
  return { id: String(row.id), periodType: row.period_type as InsightPeriodType, periodStart: String(row.period_start), periodEnd: String(row.period_end), timeZone: "Asia/Shanghai",
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at), hiddenThroughVersion: Number(row.hidden_through_version??0),
    readingVersion: row.reading_version == null ? null : Number(row.reading_version), readingMethod: row.reading_method == null ? null : row.reading_method as "rule" | "ai",
    currentVersion: Number(row.current_version), status: row.status as InsightReport["status"], createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export function insightVersionFromRow(row: Record<string, unknown>): InsightVersion {
  return { id: String(row.id), reportId: String(row.report_id), version: Number(row.version), requestKey: String(row.request_key), requestHash: String(row.request_hash),
    snapshot: (typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot) as InsightSnapshot, createdAt: String(row.created_at) };
}
