import type { HealthRecord, HealthRecordStatus, HealthRecordType } from "@/lib/types";
export { healthRecordUsesStatus } from "@/lib/health-dashboard";

export const healthRecordTypes: Array<{ value: HealthRecordType; label: string }> = [
  { value: "symptom", label: "Symptom" },
  { value: "medication", label: "Medication" },
  { value: "visit", label: "Visit" },
  { value: "test", label: "Test" },
  { value: "condition", label: "Condition" },
  { value: "treatment", label: "Treatment" },
  { value: "measurement", label: "Measurement" },
  { value: "note", label: "Note" },
];

export const healthRecordTypeLabels = Object.fromEntries(healthRecordTypes.map((item) => [item.value, item.label])) as Record<HealthRecordType, string>;
export const healthRecordStatusLabels: Record<HealthRecordStatus, string> = { active: "Active", resolved: "Resolved" };

export const healthRecordTypeLabelsZh: Record<HealthRecordType, string> = {
  symptom: "症状", medication: "用药", visit: "就诊", test: "检查",
  condition: "健康状况", treatment: "治疗", measurement: "测量", note: "笔记",
};
export const healthRecordStatusLabelsZh: Record<HealthRecordStatus, string> = { active: "进行中", resolved: "已结束" };

export const detailFields: Record<HealthRecordType, Array<{ key: string; label: string; zh: string; placeholder?: string }>> = {
  symptom: [
    { key: "severity", label: "Severity", zh: "程度" },
  ],
  medication: [
    { key: "dose", label: "Dose", zh: "用量" },
    { key: "frequency", label: "Frequency", zh: "用药频率" },
  ],
  visit: [
    { key: "provider", label: "Provider", zh: "医疗机构或医生" },
    { key: "reason", label: "Reason", zh: "就诊原因" },
  ],
  test: [
    { key: "result", label: "Result", zh: "检查结果" },
    { key: "provider", label: "Provider", zh: "检查机构" },
  ],
  condition: [
    { key: "severity", label: "Severity", zh: "程度" },
    { key: "diagnosed_on", label: "Diagnosed on", zh: "确诊日期" },
  ],
  treatment: [
    { key: "treatment", label: "Treatment details", zh: "治疗内容" },
    { key: "provider", label: "Provider", zh: "医疗机构或医生" },
  ],
  measurement: [
    { key: "value", label: "Value", zh: "测量值", placeholder: "120/80" },
    { key: "unit", label: "Unit", zh: "单位" },
  ],
  note: [
    { key: "source", label: "Source", zh: "来源" },
  ],
};

export function formatRecordDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function formatRecordDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatRecordMoment(value:string,hasExplicitTime:boolean){return hasExplicitTime?formatRecordDateTime(value):formatRecordDate(value);}

export function recordSummary(record: HealthRecord) {
  if (record.summary) return record.summary;
  const values = Object.entries(record.details).filter(([, value]) => value !== null && value !== "").map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`);
  return values.join(" · ");
}

export function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalDateTime(value: string) {
  return new Date(value).toISOString();
}
