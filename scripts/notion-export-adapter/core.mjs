import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

const MAX_ZIP_FILES = 10_000;
const MAX_ZIP_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 512 * 1024 * 1024;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeRelativeName(value) {
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.split("/").includes("..")) throw new Error(`Unsafe export path: ${value}`);
  return normalized;
}

function zipEntries(buffer) {
  let eocd = -1;
  for (let offset = Math.max(0, buffer.length - 65_557); offset <= buffer.length - 22; offset += 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) eocd = offset;
  }
  if (eocd < 0) throw new Error("ZIP end-of-central-directory not found");
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (count > MAX_ZIP_FILES || centralOffset + centralSize > buffer.length) throw new Error("ZIP directory is invalid or exceeds safety limits");
  const files = [];
  let offset = centralOffset;
  let totalBytes = 0;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP central directory entry is invalid");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameBuffer = buffer.subarray(offset + 46, offset + 46 + nameLength);
    const name = safeRelativeName(nameBuffer.toString(flags & 0x0800 ? "utf8" : "latin1"));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (flags & 0x0001) throw new Error(`Encrypted ZIP entry is unsupported: ${name}`);
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) throw new Error(`ZIP entry exceeds safety limit: ${name}`);
    totalBytes += uncompressedSize;
    if (totalBytes > MAX_ZIP_TOTAL_BYTES) throw new Error("ZIP exceeds total uncompressed safety limit");
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP local entry is invalid: ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null;
    if (!data) throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
    if (data.length !== uncompressedSize) throw new Error(`ZIP size mismatch: ${name}`);
    files.push({ name, data });
  }
  return files;
}

function expandedZipEntries(buffer, containers = [], depth = 0) {
  if (depth > 3) throw new Error("Nested ZIP depth exceeds safety limit");
  const files = [];
  for (const file of zipEntries(buffer)) {
    if (file.name.toLowerCase().endsWith(".zip")) files.push(...expandedZipEntries(file.data, [...containers, file.name], depth + 1));
    else files.push({ ...file, containers });
  }
  return files;
}

function directoryEntries(root) {
  const files = [];
  function walk(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Symlink is unsupported in Notion export: ${path.join(directory, entry.name)}`);
      const relativeName = safeRelativeName(prefix ? `${prefix}/${entry.name}` : entry.name);
      const absoluteName = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absoluteName, relativeName);
      else if (entry.isFile()) files.push({ name: relativeName, data: fs.readFileSync(absoluteName) });
    }
  }
  walk(root);
  return files;
}

export function readNotionExport(sourcePath) {
  const resolved = path.resolve(sourcePath);
  const stat = fs.statSync(resolved);
  const files = stat.isDirectory() ? directoryEntries(resolved) : path.extname(resolved).toLowerCase() === ".zip" ? expandedZipEntries(fs.readFileSync(resolved)) : (() => { throw new Error("--notion-export must point to a ZIP or directory"); })();
  return { sourcePath: resolved, sourceType: stat.isDirectory() ? "directory" : "zip", files: files.map((file) => ({ ...file, sourcePath: resolved })) };
}

function decodeUtf8(file) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(file.data); } catch { throw new Error(`File is not valid UTF-8: ${file.name}`); }
  const hadBom = text.charCodeAt(0) === 0xfeff;
  return { text: hadBom ? text.slice(1) : text, hadBom };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else quoted = false;
      } else field += character;
      continue;
    }
    if (character === '"' && field === "") quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\r" || character === "\n") {
      row.push(field); field = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += character;
  }
  if (quoted) throw new Error("CSV ends inside a quoted field");
  if (field !== "" || row.length) { row.push(field); if (row.some((value) => value !== "")) rows.push(row); }
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0];
  if (new Set(headers).size !== headers.length || headers.some((value) => !value)) throw new Error("CSV has empty or duplicate headers");
  const records = rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}`);
    return { rowNumber: index + 2, values: Object.fromEntries(headers.map((header, column) => [header, values[column]])), rawValues: values };
  });
  return { headers, records };
}

function databaseId(fileName) {
  return path.basename(fileName).match(/\b([0-9a-f]{32})(?:_all)?\.csv$/i)?.[1]?.toLowerCase() ?? null;
}

function classifyHeaders(headers) {
  const fields = new Set(headers);
  if (["Name", "Content", "Type", "Tags", "发生日期", "最后确认"].every((field) => fields.has(field))) return "memo";
  if (["日期", "关键词", "重要事件"].every((field) => fields.has(field))) return "chronicle";
  if (fields.has("日期") && fields.has("标签") && headers.length === 2) return "lucius_diary";
  return null;
}

function discoverDatabases(files) {
  const candidates = [];
  for (const file of files.filter((entry) => entry.name.toLowerCase().endsWith(".csv"))) {
    const decoded = decodeUtf8(file);
    const parsed = parseCsv(decoded.text);
    candidates.push({ ...file, ...decoded, ...parsed, databaseId: databaseId(file.name), resource: classifyHeaders(parsed.headers), isAll: /_all\.csv$/i.test(file.name) });
  }
  const selected = {};
  const ignored = [];
  for (const resource of ["memo", "chronicle", "lucius_diary"]) {
    const matches = candidates.filter((file) => file.resource === resource);
    if (!matches.length) continue;
    const all = matches.filter((file) => file.isAll);
    const chosen = (all.length ? all : matches).sort((left, right) => right.records.length - left.records.length)[0];
    selected[resource] = chosen;
    for (const file of matches) if (file !== chosen) ignored.push({ file: file.name, resource, reason: chosen.isAll ? "complete _all export selected" : "larger matching export selected" });
  }
  return { candidates, selected, ignored };
}

function parseSlashDate(value) {
  const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseIsoDatePrefix(value) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(.+))?$/u);
  return match ? { date: match[1], qualifier: match[2] ?? null } : null;
}

function parseChineseDate(value) {
  const match = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/u);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function parseChineseDateTime(value, timezoneOffset) {
  const match = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{2}):(\d{2})$/u);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T${match[4]}:${match[5]}:00${timezoneOffset}`;
}

function splitMultiSelect(value) {
  if (!value) return [];
  return value.split(/,\s*/u).filter(Boolean);
}

function identityFor(file, record) {
  const canonical = JSON.stringify(file.headers.map((header) => [header, record.values[header]]));
  return `notion-export:${file.databaseId}:${sha256(canonical)}`;
}

function issue(collection, file, record, code, message, details = {}) {
  collection.push({ resource: file.resource, file: file.name, csv_row: record.rowNumber, source_id: identityFor(file, record), code, message, ...details });
}

function mapMemo(file, record, context) {
  const value = record.values;
  let eventDate = null;
  if (value["发生日期"]) {
    eventDate = parseSlashDate(value["发生日期"]);
    if (!eventDate) issue(context.warnings, file, record, "unmapped_date_range", "发生日期不是 EO 可存储的单一 date，已保留为 null，需人工决定。", { raw_value: value["发生日期"] });
  }
  let confirmedAt = null;
  if (value["最后确认"]) {
    const date = parseChineseDate(value["最后确认"]);
    if (!date) issue(context.errors, file, record, "invalid_confirmed_at", "最后确认无法解析。", { raw_value: value["最后确认"] });
    else {
      confirmedAt = `${date}T00:00:00${context.timezoneOffset}`;
      issue(context.warnings, file, record, "date_only_confirmed_at", "最后确认只有日期；normalized confirmed_at 使用该日 00:00 和指定时区。", { raw_value: value["最后确认"], mapped_value: confirmedAt });
    }
  }
  const notionUpdatedAt = value["Last Updated"] ? parseChineseDateTime(value["Last Updated"], context.timezoneOffset) : null;
  if (value["Last Updated"] && !notionUpdatedAt) issue(context.warnings, file, record, "invalid_notion_updated_at", "Last Updated 无法解析，未写入 metadata。", { raw_value: value["Last Updated"] });
  return {
    notion_page_id: identityFor(file, record),
    notion_url: null,
    notion_created_at: null,
    notion_updated_at: notionUpdatedAt,
    title: value.Name,
    content: value.Content,
    type: value.Type,
    status: value["状态"] || "当前有效",
    tags: splitMultiSelect(value.Tags),
    event_date: eventDate,
    confirmed_at: confirmedAt,
    merged_into_id: null,
  };
}

function mapChronicle(file, record, context) {
  const value = record.values;
  const parsedDate = parseIsoDatePrefix(value["日期"]);
  if (!parsedDate || parsedDate.qualifier) {
    issue(context.errors, file, record, "invalid_chronicle_date", "Chronicle 日期无法可靠转换为 date-only。", { raw_value: value["日期"] });
    return null;
  }
  if (!value["关键词"].trim()) {
    issue(context.errors, file, record, "missing_chronicle_body", "导出没有逐页正文，关键词也为空；不能编造 Chronicle content_md。", { date: parsedDate.date });
    return null;
  }
  if (value["重要事件"] === "Yes") issue(context.warnings, file, record, "unmapped_important_event", "重要事件没有对应的 EO Chronicle 字段，未写入 schema。", { date: parsedDate.date });
  return {
    notion_page_id: identityFor(file, record),
    notion_url: null,
    notion_created_at: null,
    notion_updated_at: null,
    date: parsedDate.date,
    title: `Chronicle ${parsedDate.date}`,
    content_md: value["关键词"],
    source: "manual",
  };
}

function mapDiary(file, record, context) {
  const value = record.values;
  const parsed = parseIsoDatePrefix(value["日期"]);
  if (!parsed) {
    issue(context.errors, file, record, "invalid_diary_date", "Diary 日期无法可靠转换为 date-only。", { raw_value: value["日期"] });
    return null;
  }
  const matches = context.pageDescriptors.filter((page) => page.title === value["日期"]);
  if (!matches.length) {
    issue(context.errors, file, record, "missing_diary_page_body", "CSV 只有日期和标签，提供的 export 中没有对应页面 Markdown，无法导入 Diary 正文。", { raw_date: value["日期"], tags: splitMultiSelect(value["标签"]) });
    return null;
  }
  if (matches.length > 1) {
    issue(context.errors, file, record, "ambiguous_diary_page_body", "多个页面文件与 Diary CSV 行同名，无法可靠选择正文。", { raw_date: value["日期"], page_files: matches.map((page) => page.file.name) });
    return null;
  }
  const page = matches[0];
  if (page.extension !== ".md" && page.extension !== ".markdown") {
    issue(context.errors, file, record, "unsupported_diary_html_body", "Diary 页面正文是 HTML；本次真实导出 profile 只验证了 Markdown，未猜测 HTML 转换。", { page_file: page.file.name, source_id: page.pageId });
    return null;
  }
  const content = decodeUtf8(page.file).text;
  if (!content.trim()) {
    issue(context.errors, file, record, "empty_diary_page_body", "Diary 页面 Markdown 为空。", { page_file: page.file.name, source_id: page.pageId });
    return null;
  }
  if (parsed.qualifier) issue(context.warnings, file, record, "diary_date_qualifier", "Diary 日期包含 EO date-only 无法保存的文字时段；date 使用明确的 YYYY-MM-DD 前缀，原文字段仍保留在 Markdown 标题中。", { raw_value: value["日期"], date_prefix: parsed.date, qualifier: parsed.qualifier, source_id: page.pageId });
  return {
    notion_page_id: page.pageId,
    notion_url: null,
    notion_created_at: null,
    notion_updated_at: null,
    date: parsed.date,
    content,
    tags: splitMultiSelect(value["标签"]),
  };
}

function duplicateStats(file) {
  const signatures = new Map();
  for (const record of file.records) {
    const signature = identityFor(file, record);
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
  }
  return [...signatures.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
}

function selectSamples(records, bodyField) {
  if (!records.length) return [];
  const selected = [];
  const add = (record) => { if (record && !selected.some((item) => item.notion_page_id === record.notion_page_id)) selected.push(record); };
  add(records[0]);
  add([...records].sort((left, right) => String(right[bodyField] ?? "").length - String(left[bodyField] ?? "").length)[0]);
  add(records.find((record) => String(record[bodyField] ?? "").includes("\n") || /[^\u0000-\u007f]/u.test(String(record[bodyField] ?? ""))));
  return selected.slice(0, 3);
}

export function adaptNotionExport({ sourcePath, sourcePaths, timezoneOffset = "+08:00", now = () => new Date().toISOString() }) {
  if (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(timezoneOffset)) throw new Error("timezoneOffset must look like +08:00");
  const requestedSources = sourcePaths ?? (sourcePath ? [sourcePath] : []);
  if (!requestedSources.length) throw new Error("At least one Notion export ZIP or directory is required");
  const sources = requestedSources.map(readNotionExport);
  const files = sources.flatMap((source) => source.files);
  const discovery = discoverDatabases(files);
  const warnings = [];
  const errors = [];
  const normalized = { memo: [], chronicle: [], lucius_diary: [] };
  const pageDescriptors = files.filter((file) => /\.(?:md|markdown|html?)$/i.test(file.name)).map((file) => {
    const extension = path.extname(file.name).toLowerCase();
    const match = path.basename(file.name, extension).match(/^(.*?)\s+([0-9a-f]{32})$/i);
    return match ? { file, extension, title: match[1], pageId: match[2].toLowerCase() } : null;
  }).filter(Boolean);
  const context = { warnings, errors, timezoneOffset, pageDescriptors };
  const detected = { memo: 0, chronicle: 0, lucius_diary: 0, total: 0 };
  const skipped = { memo: 0, chronicle: 0, lucius_diary: 0, total: 0 };
  const duplicateRows = { memo: 0, chronicle: 0, lucius_diary: 0, total: 0 };

  for (const resource of ["memo", "chronicle", "lucius_diary"]) {
    const file = discovery.selected[resource];
    if (!file) {
      errors.push({ resource, file: null, csv_row: null, source_id: null, code: "database_not_found", message: `未找到 ${resource} CSV database。` });
      continue;
    }
    detected[resource] = file.records.length;
    detected.total += file.records.length;
    duplicateRows[resource] = duplicateStats(file);
    duplicateRows.total += duplicateRows[resource];
    for (const record of file.records) {
      const mapped = resource === "memo" ? mapMemo(file, record, context) : resource === "chronicle" ? mapChronicle(file, record, context) : mapDiary(file, record, context);
      if (mapped) normalized[resource].push(mapped);
      else { skipped[resource] += 1; skipped.total += 1; }
    }
  }

  const pageFiles = files.filter((file) => /\.(?:md|markdown|html?)$/i.test(file.name));
  const hubFiles = pageFiles.filter((file) => /Hub\s+[0-9a-f]{32}\.md$/i.test(path.basename(file.name)));
  const bodyFiles = pageFiles.filter((file) => !hubFiles.includes(file));
  const sameNameMemos = normalized.memo.length - new Set(normalized.memo.map((record) => record.title)).size;
  const sameDateChronicle = normalized.chronicle.length - new Set(normalized.chronicle.map((record) => record.date)).size;
  const generatedAt = now();
  const report = {
    schema_version: 1,
    generated_at: generatedAt,
    source: {
      path: sources.length === 1 ? sources[0].sourcePath : null,
      type: sources.length === 1 ? sources[0].sourceType : "multiple",
      inputs: sources.map((source) => ({ path: source.sourcePath, type: source.sourceType })),
      files: files.map((file) => ({ name: file.name, bytes: file.data.length, source_path: file.sourcePath, nested_containers: file.containers ?? [] })),
    },
    encoding: { csv: "UTF-8", bom_files: discovery.candidates.filter((file) => file.hadBom).map((file) => file.name) },
    selected_databases: Object.fromEntries(Object.entries(discovery.selected).map(([resource, file]) => [resource, { file: file.name, database_id: file.databaseId, headers: file.headers, rows: file.records.length, selected_complete_export: file.isAll }])),
    ignored_database_exports: discovery.ignored,
    page_content: { markdown_or_html_files: pageFiles.map((file) => file.name), hub_files: hubFiles.map((file) => file.name), row_body_files: bodyFiles.map((file) => file.name) },
    identity: {
      reliable_notion_page_id_available: normalized.lucius_diary.length > 0,
      strategy_by_resource: {
        memo: "notion-export:<database-id>:sha256(<ordered raw CSV row>)",
        chronicle: "notion-export:<database-id>:sha256(<ordered raw CSV row>)",
        lucius_diary: normalized.lucius_diary.length ? "32-character Notion page ID from matched Markdown filename" : "unavailable because page body files are missing",
      },
      title_or_date_used_as_identity: false,
      source_url_available: false,
      limitation: "Memo and Chronicle identities are stable for this frozen export and exact reruns; a later export with edited row values produces a new identity because their Notion page IDs are absent.",
    },
    timezone_assumption: { offset: timezoneOffset, applies_to: ["Last Updated", "最后确认 date-only midnight"] },
    statistics: { detected, normalized: { memo: normalized.memo.length, chronicle: normalized.chronicle.length, lucius_diary: normalized.lucius_diary.length, total: normalized.memo.length + normalized.chronicle.length + normalized.lucius_diary.length }, skipped, errors: errors.length, warnings: warnings.length, duplicate_rows: duplicateRows, same_name_memo: sameNameMemos, same_date_chronicle: sameDateChronicle },
    warnings,
    errors,
  };
  const sample = {
    schema_version: 1,
    generated_at: generatedAt,
    memo: selectSamples(normalized.memo, "content"),
    chronicle: selectSamples(normalized.chronicle, "content_md"),
    lucius_diary: normalized.lucius_diary.length ? selectSamples(normalized.lucius_diary, "content") : errors.filter((item) => item.resource === "lucius_diary").slice(0, 3),
  };
  return { normalized, report, sample };
}

export function writeAdapterOutputs(result, { normalizedPath, reportDirectory }) {
  fs.mkdirSync(path.dirname(normalizedPath), { recursive: true });
  fs.mkdirSync(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, "notion-export-report.json");
  const samplePath = path.join(reportDirectory, "notion-export-sample.json");
  fs.writeFileSync(normalizedPath, `${JSON.stringify(result.normalized, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, `${JSON.stringify(result.report, null, 2)}\n`, "utf8");
  fs.writeFileSync(samplePath, `${JSON.stringify(result.sample, null, 2)}\n`, "utf8");
  return { normalized: normalizedPath, adapterReport: reportPath, adapterSample: samplePath };
}
