import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { adaptNotionExport, parseCsv, writeAdapterOutputs } from "./notion-export-adapter/core.mjs";

const memoCsv = '\ufeffName,Content,Last Updated,Tags,Type,发生日期,最后确认,状态\r\n"同名也不用作 ID","第一行\r\n第二行，含逗号和 ""引号"" 🪐","2026年8月29日 02:00","规则, 猫",基本信息,2026/07/17,2026年7月17日,当前有效\r\n';
const chronicleCsv = '\ufeff日期,关键词,重要事件\r\n2026-07-17,"ChatGPT, Notion",Yes\r\n2026-07-18,,No\r\n';
const diaryCsv = '\ufeff日期,标签\r\n2026-07-17 凌晨,"信任, 成长"\r\n';

function fixtureFiles({ diaryPage = false } = {}) {
  const files = {
    "OurMemo Hub 3a13a337ed4581a08aaecf64e8422ec8.md": "# Hub\n",
    "OurMemo 2eb3a337ed4580149b4cf22d675120bc_all.csv": memoCsv,
    "姐姐的Chronicle 3a13a337ed4580f49401fb51cef002b8_all.csv": chronicleCsv,
    "Lucius日记 3a13a337ed45800d97f5c5b458966294_all.csv": diaryCsv,
  };
  if (diaryPage) files["2026-07-17 凌晨 3a13a337ed4580e18ee9f454b53240a4.md"] = "# 2026-07-17 凌晨\n\n完整 Diary 正文。\n保留 **Markdown** 与换行 🪐\n";
  return files;
}

function writeDirectory(directory) {
  for (const [name, content] of Object.entries(fixtureFiles())) fs.writeFileSync(path.join(directory, name), content, "utf8");
}

function storedZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBuffer);
    localOffset += local.length + nameBuffer.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  const count = Object.keys(files).length;
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(count, 8); eocd.writeUInt16LE(count, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, central, eocd]);
}

test("CSV parser preserves quoted commas, quotes, Unicode and multiline text", () => {
  const parsed = parseCsv(memoCsv.slice(1));
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].values.Content, '第一行\r\n第二行，含逗号和 "引号" 🪐');
  assert.equal(parsed.records[0].values.Tags, "规则, 猫");
});

test("Notion export adapter maps the observed MemoHub CSV profile without inventing missing bodies", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-notion-adapter-"));
  writeDirectory(directory);
  try {
    const result = adaptNotionExport({ sourcePath: directory, now: () => "2026-08-29T13:00:00.000Z" });
    assert.deepEqual(result.report.statistics.detected, { memo: 1, chronicle: 2, lucius_diary: 1, total: 4 });
    assert.deepEqual(result.report.statistics.normalized, { memo: 1, chronicle: 1, lucius_diary: 0, total: 2 });
    assert.deepEqual(result.report.statistics.skipped, { memo: 0, chronicle: 1, lucius_diary: 1, total: 2 });
    assert.equal(result.normalized.memo[0].content, '第一行\r\n第二行，含逗号和 "引号" 🪐');
    assert.deepEqual(result.normalized.memo[0].tags, ["规则", "猫"]);
    assert.equal(result.normalized.memo[0].event_date, "2026-07-17");
    assert.equal(result.normalized.memo[0].confirmed_at, "2026-07-17T00:00:00+08:00");
    assert.match(result.normalized.memo[0].notion_page_id, /^notion-export:2eb3a337ed4580149b4cf22d675120bc:[0-9a-f]{64}$/);
    assert.doesNotMatch(result.normalized.memo[0].notion_page_id, /同名/);
    assert.equal(result.normalized.chronicle[0].title, "Chronicle 2026-07-17");
    assert.equal(result.normalized.chronicle[0].content_md, "ChatGPT, Notion");
    assert.deepEqual(Object.keys(result.normalized), ["memo", "chronicle", "lucius_diary"]);
    assert.equal(result.report.page_content.row_body_files.length, 0);
    assert.equal(result.report.identity.title_or_date_used_as_identity, false);
    assert.equal(result.report.errors.filter((item) => item.code === "missing_diary_page_body").length, 1);
    assert.equal(result.report.errors.filter((item) => item.code === "missing_chronicle_body").length, 1);
    const outputDirectory = path.join(directory, "output");
    const files = writeAdapterOutputs(result, { normalizedPath: path.join(outputDirectory, "fixture.normalized.json"), reportDirectory: outputDirectory });
    assert.equal(JSON.parse(fs.readFileSync(files.normalized, "utf8")).memo.length, 1);
    assert.ok(fs.existsSync(files.adapterReport));
    assert.ok(fs.existsSync(files.adapterSample));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Notion export adapter reads ZIP input with UTF-8 filenames", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-notion-adapter-zip-"));
  const zipPath = path.join(directory, "export.zip");
  fs.writeFileSync(zipPath, storedZip(fixtureFiles()));
  try {
    const result = adaptNotionExport({ sourcePath: zipPath });
    assert.equal(result.report.source.type, "zip");
    assert.equal(result.report.selected_databases.chronicle.file.startsWith("姐姐的Chronicle"), true);
    assert.equal(result.normalized.memo.length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Notion export adapter expands a nested ZIP and joins Diary CSV rows to Markdown page IDs", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evaorbit-notion-adapter-nested-"));
  const zipPath = path.join(directory, "outer.zip");
  const inner = storedZip(fixtureFiles({ diaryPage: true }));
  fs.writeFileSync(zipPath, storedZip({ "ExportBlock-Part-1.zip": inner }));
  try {
    const result = adaptNotionExport({ sourcePath: zipPath });
    assert.equal(result.normalized.lucius_diary.length, 1);
    assert.equal(result.normalized.lucius_diary[0].notion_page_id, "3a13a337ed4580e18ee9f454b53240a4");
    assert.equal(result.normalized.lucius_diary[0].date, "2026-07-17");
    assert.equal(result.normalized.lucius_diary[0].content, "# 2026-07-17 凌晨\n\n完整 Diary 正文。\n保留 **Markdown** 与换行 🪐\n");
    assert.deepEqual(result.normalized.lucius_diary[0].tags, ["信任", "成长"]);
    assert.equal(result.report.identity.strategy_by_resource.lucius_diary, "32-character Notion page ID from matched Markdown filename");
    assert.equal(result.report.source.files.some((file) => file.nested_containers.includes("ExportBlock-Part-1.zip")), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
