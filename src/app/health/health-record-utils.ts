import type { HealthRecord, HealthRecordStatus, HealthRecordType } from "@/lib/types";

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

export const detailFields: Record<HealthRecordType, Array<{ key: string; label: string; placeholder: string; inputType?: "text" | "number" }>> = {
  symptom: [
    { key: "severity", label: "Severity", placeholder: "Mild, moderate, severe" },
    { key: "body_area", label: "Body area", placeholder: "Where did you notice it?" },
  ],
  medication: [
    { key: "dose", label: "Dose", placeholder: "e.g. 200 mg" },
    { key: "frequency", label: "Frequency", placeholder: "e.g. Once daily" },
  ],
  visit: [
    { key: "provider", label: "Provider", placeholder: "Clinic or clinician" },
    { key: "reason", label: "Reason", placeholder: "Why was this visit?" },
  ],
  test: [
    { key: "result", label: "Result", placeholder: "Short result summary" },
    { key: "provider", label: "Provider", placeholder: "Lab or clinic" },
  ],
  condition: [
    { key: "severity", label: "Severity", placeholder: "Mild, moderate, severe" },
    { key: "diagnosed_on", label: "Diagnosed on", placeholder: "Date or context" },
  ],
  treatment: [
    { key: "treatment", label: "Treatment", placeholder: "What treatment was used?" },
    { key: "provider", label: "Provider", placeholder: "Clinic or clinician" },
  ],
  measurement: [
    { key: "value", label: "Value", placeholder: "e.g. 120", inputType: "number" },
    { key: "unit", label: "Unit", placeholder: "e.g. mmHg, kg" },
  ],
  note: [
    { key: "source", label: "Source", placeholder: "Optional context" },
  ],
};

export function formatRecordDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function formatRecordDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

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
