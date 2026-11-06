import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const NOTION_RESOURCES = ["memo", "chronicle", "lucius_diary"];

const RESOURCE_ALIASES = new Map([
  ["memo", "memo"], ["memos", "memo"],
  ["chronicle", "chronicle"], ["chronicles", "chronicle"],
  ["lucius_diary", "lucius_diary"], ["lucius_diaries", "lucius_diary"],
]);

const MEMO_TYPES = { basic: "basic", supplement: "supplement", event: "event", note: "note", "基本信息": "basic", "补充信息": "supplement", "事件内容": "event", "便签内容": "note" };
const MEMO_STATUSES = { active: "active", merged: "merged", archived: "archived", historical: "historical", "当前有效": "active", "已合并": "merged", "已归档": "archived", "历史记录": "historical" };

function objectValue(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} 必须是 JSON object`);
  return value;
}

function stringValue(value, field, maximum, { required = true, preserve = false } = {}) {
  if (value === undefined || value === null) {
    if (!required) return null;
    throw new Error(`${field} 不能为空`);
  }
  if (typeof value !== "string") throw new Error(`${field} 必须是 string`);
  if (required && !value.trim()) throw new Error(`${field} 不能为空`);
  if (value.length > maximum) throw new Error(`${field} 不能超过 ${maximum} 个字符；importer 不会截断数据`);
  return preserve ? value : value.trim();
}

function enumValue(value, field, values, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !Object.hasOwn(values, value)) throw new Error(`${field} 值不受支持：${String(value)}`);
  return values[value];
}

function dateValue(value, field) {
  if (typeof value !== "string") throw new Error(`${field} 必须是 YYYY-MM-DD 或 ISO timestamp`);
  const result = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : "";
  if (!result) throw new Error(`${field} 必须是 YYYY-MM-DD 或 ISO timestamp`);
  const [year, month, day] = result.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error(`${field} 不是有效日期`);
  return result;
}

function optionalDate(value, field) {
  return value === undefined || value === null || value === "" ? null : dateValue(value, field);
}

function timestampValue(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${field} 必须是 ISO timestamp`);
  return value;
}

function urlValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const result = stringValue(value, "notion_url", 2000);
  let parsed;
  try { parsed = new URL(result); } catch { throw new Error("notion_url 必须是有效的 HTTP 或 HTTPS URL"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("notion_url 必须是有效的 HTTP 或 HTTPS URL");
  return result;
}

function tagsValue(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${field} 必须是非空 string array`);
  if (value.length > 20 || value.some((item) => item.length > 60)) throw new Error(`${field} 最多 20 个且每个不超过 60 字；importer 不会截断 tags`);
  if (new Set(value).size !== value.length) throw new Error(`${field} 包含重复值；请在输入中明确处理，importer 不会静默去重`);
  return [...value];
}

function integerValue(value, field, minimum, fallback = undefined) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${field} 必须是不小于 ${minimum} 的整数`);
  return value;
}

function optionalInteger(value, field, minimum = 1) {
  return value === undefined || value === null || value === "" ? null : integerValue(value, field, minimum);
}

function knownData(data, fields) {
  return Object.keys(data).filter((key) => !fields.includes(key));
}

function commonTrace(record, importedAt) {
  return { source_system: "notion", source_id: record.notionPageId, source_url: record.notionUrl, imported_at: importedAt };
}

function mapMemo(data, record, importedAt) {
  const fields = ["title", "content", "type", "status", "tags", "event_date", "confirmed_at", "merged_into_id"];
  return {
    data: {
      title: stringValue(data.title, "memo.title", 300),
      content: stringValue(data.content, "memo.content", 100000, { preserve: true }),
      type: enumValue(data.type, "memo.type", MEMO_TYPES, "note"),
      status: enumValue(data.status, "memo.status", MEMO_STATUSES, "active"),
      tags: tagsValue(data.tags, "memo.tags"),
      event_date: optionalDate(data.event_date, "memo.event_date"),
      confirmed_at: timestampValue(data.confirmed_at, "memo.confirmed_at"),
      merged_into_id: optionalInteger(data.merged_into_id, "memo.merged_into_id"),
      ...commonTrace(record, importedAt),
    },
    ignoredFields: knownData(data, fields),
  };
}

function mapChronicle(data) {
  const fields = ["date", "title", "content_md", "content", "source"];
  return {
    data: {
      date: dateValue(data.date, "chronicle.date"),
      title: stringValue(data.title, "chronicle.title", 300),
      content_md: stringValue(data.content_md ?? data.content, "chronicle.content_md", 100000, { preserve: true }),
      source: enumValue(data.source, "chronicle.source", { manual: "manual", chatgpt: "chatgpt", ChatGPT: "chatgpt" }, "manual"),
    },
    ignoredFields: knownData(data, fields),
  };
}

function mapDiary(data, record, importedAt) {
  const fields = ["date", "content", "tags"];
  return {
    data: {
      date: dateValue(data.date, "lucius_diary.date"),
      content: stringValue(data.content, "lucius_diary.content", 100000, { preserve: true }),
      tags: tagsValue(data.tags, "lucius_diary.tags"),
      ...commonTrace(record, importedAt),
    },
    ignoredFields: knownData(data, fields),
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function hashValue(value) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function contentFingerprint(resource, data) {
  const value = resource === "memo" ? [data.title, data.content]
    : resource === "chronicle" ? [data.date, data.title, data.content_md]
      : [data.date, data.content];
  return hashValue([resource, ...value]);
}

function normalizeResource(value) {
  if (typeof value !== "string" || !RESOURCE_ALIASES.has(value)) throw new Error(`resource 不受支持：${String(value)}`);
  return RESOURCE_ALIASES.get(value);
}

function flattenedData(record) {
  const metadata = new Set(["resource", "notion_page_id", "notion_url", "notion_created_at", "notion_updated_at", "data"]);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !metadata.has(key)));
}

export function normalizeNotionInput(input) {
  const document = objectValue(input, "input");
  if (document.records !== undefined) {
    if (!Array.isArray(document.records)) throw new Error("records 必须是 array");
    return document.records.map((value) => ({ resource: normalizeResource(objectValue(value, "record").resource), record: value }));
  }
  const entries = [];
  for (const [key, value] of Object.entries(document)) {
    if (key === "version") continue;
    const resource = normalizeResource(key);
    if (!Array.isArray(value)) throw new Error(`${key} 必须是 array`);
    for (const record of value) entries.push({ resource, record: objectValue(record, `${key} record`) });
  }
  return entries;
}

function normalizeRecord(resource, rawRecord, importedAt) {
  const record = objectValue(rawRecord, `${resource} record`);
  const notionPageId = stringValue(record.notion_page_id, "notion_page_id", 300);
  const normalized = {
    resource,
    notionPageId,
    notionUrl: urlValue(record.notion_url),
    notionCreatedAt: timestampValue(record.notion_created_at, "notion_created_at"),
    notionUpdatedAt: timestampValue(record.notion_updated_at, "notion_updated_at"),
  };
  const data = record.data === undefined ? flattenedData(record) : objectValue(record.data, `${resource}.data`);
  const mapped = resource === "memo" ? mapMemo(data, normalized, importedAt)
    : resource === "chronicle" ? mapChronicle(data)
      : mapDiary(data, normalized, importedAt);
  const payloadHash = hashValue({ resource, notion_page_id: notionPageId, notion_url: normalized.notionUrl, notion_created_at: normalized.notionCreatedAt, notion_updated_at: normalized.notionUpdatedAt, data: Object.fromEntries(Object.entries(mapped.data).filter(([key]) => key !== "imported_at")) });
  return { ...normalized, ...mapped, payloadHash, contentFingerprint: contentFingerprint(resource, mapped.data), importedAt };
}

function emptyCounts() {
  return { total: 0, valid: 0, created: 0, updated: 0, unchanged: 0, skipped_duplicates: 0, errors: 0 };
}

export async function runNotionImport({ input, store, apply = false, now = () => new Date().toISOString(), inputName = null }) {
  const startedAt = now();
  const records = normalizeNotionInput(input);
  await store.initialize({ apply });
  const total = emptyCounts();
  const byResource = Object.fromEntries(NOTION_RESOURCES.map((resource) => [resource, emptyCounts()]));
  const duplicates = [];
  const errors = [];
  const warnings = [];
  const seenSources = new Map();
  const seenContent = new Map();

  for (const [index, entry] of records.entries()) {
    total.total += 1;
    byResource[entry.resource].total += 1;
    try {
      const item = normalizeRecord(entry.resource, entry.record, startedAt);
      const sourceKey = `notion\u0000${item.notionPageId}`;
      if (seenSources.has(sourceKey)) {
        const duplicate = { kind: "input_source_identity", resource: item.resource, source_system: "notion", source_id: item.notionPageId, input_index: index, first_input_index: seenSources.get(sourceKey), action: "skipped" };
        duplicates.push(duplicate);
        total.skipped_duplicates += 1; byResource[item.resource].skipped_duplicates += 1;
        continue;
      }
      seenSources.set(sourceKey, index);
      const contentKey = item.contentFingerprint;
      if (seenContent.has(contentKey)) {
        const first = seenContent.get(contentKey);
        const duplicate = { kind: "input_content_match", resource: item.resource, source_system: "notion", source_id: item.notionPageId, input_index: index, first_input_index: first.index, first_source_id: first.sourceId, action: "skipped" };
        duplicates.push(duplicate);
        total.skipped_duplicates += 1; byResource[item.resource].skipped_duplicates += 1;
        continue;
      }
      seenContent.set(contentKey, { index, sourceId: item.notionPageId });
      total.valid += 1; byResource[item.resource].valid += 1;
      if (item.ignoredFields.length) warnings.push({ resource: item.resource, source_id: item.notionPageId, input_index: index, ignored_fields: item.ignoredFields });
      const result = await store.process(item, { apply });
      total[result.action] += 1; byResource[item.resource][result.action] += 1;
      if (result.duplicate) duplicates.push({ ...result.duplicate, resource: item.resource, source_system: "notion", source_id: item.notionPageId, input_index: index });
    } catch (error) {
      total.errors += 1; byResource[entry.resource].errors += 1;
      errors.push({ resource: entry.resource, source_id: typeof entry.record?.notion_page_id === "string" ? entry.record.notion_page_id : null, input_index: index, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const completedAt = now();
  return {
    migrationReport: { schema_version: 1, mode: apply ? "import" : "dry-run", input: inputName, started_at: startedAt, completed_at: completedAt, totals: total, by_resource: byResource, warnings },
    duplicateReport: { schema_version: 1, mode: apply ? "import" : "dry-run", generated_at: completedAt, duplicates },
    errorReport: { schema_version: 1, mode: apply ? "import" : "dry-run", generated_at: completedAt, errors },
  };
}

export function writeImportReports(reports, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const files = {
    migration: path.join(directory, "migration-report.json"),
    duplicate: path.join(directory, "duplicate-report.json"),
    error: path.join(directory, "error-report.json"),
  };
  fs.writeFileSync(files.migration, `${JSON.stringify(reports.migrationReport, null, 2)}\n`, "utf8");
  fs.writeFileSync(files.duplicate, `${JSON.stringify(reports.duplicateReport, null, 2)}\n`, "utf8");
  fs.writeFileSync(files.error, `${JSON.stringify(reports.errorReport, null, 2)}\n`, "utf8");
  return files;
}
