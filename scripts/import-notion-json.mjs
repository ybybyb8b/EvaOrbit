import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { runNotionImport, writeImportReports } from "./notion-importer/core.mjs";
import { createNotionImportStore } from "./notion-importer/stores.mjs";
import { adaptNotionExport, writeAdapterOutputs } from "./notion-export-adapter/core.mjs";

function usage() {
  return `Usage:
  npm run import:notion -- --input <file.json> [--dry-run] [--report-dir <dir>] [--sqlite <eo.sqlite>]
  npm run import:notion -- --input <file.json> --apply [--report-dir <dir>] [--sqlite <eo.sqlite>]
  npm run import:notion -- --notion-export <export.zip|directory> [--notion-export <supplement.zip>] [--dry-run] [--normalized-output <file.json>] [--sqlite <eo.sqlite>]
  npm run import:notion -- --notion-export <export.zip|directory> --apply [--normalized-output <file.json>] [--sqlite <eo.sqlite>]

Default mode is dry-run. Without --sqlite, DATABASE_URL and MIGRATION_USER_ID select the Supabase Postgres target.`;
}

function argumentsValue(argv) {
  const options = { apply: false, dryRun: false, input: null, notionExports: [], normalizedOutput: null, reportDir: null, sqlitePath: null, timezoneOffset: "+08:00" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (["--input", "--notion-export", "--normalized-output", "--report-dir", "--sqlite", "--notion-timezone"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} 缺少值\n${usage()}`);
      if (argument === "--input") options.input = value;
      if (argument === "--notion-export") options.notionExports.push(value);
      if (argument === "--normalized-output") options.normalizedOutput = value;
      if (argument === "--report-dir") options.reportDir = value;
      if (argument === "--sqlite") options.sqlitePath = value;
      if (argument === "--notion-timezone") options.timezoneOffset = value;
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    } else throw new Error(`未知参数：${argument}\n${usage()}`);
  }
  if (Boolean(options.input) === Boolean(options.notionExports.length)) throw new Error(`必须且只能提供 --input 或至少一个 --notion-export\n${usage()}`);
  if (options.apply && options.dryRun) throw new Error("--apply 与 --dry-run 不能同时使用");
  return options;
}

let store;
try {
  const options = argumentsValue(process.argv.slice(2));
  const reportDirectory = path.resolve(options.reportDir || "notion-import-reports");
  let input;
  let inputPath;
  let adapterResult = null;
  let adapterFiles = null;
  if (options.notionExports.length) {
    const exportPaths = options.notionExports.map((value) => path.resolve(value));
    const exportName = path.basename(exportPaths[0], path.extname(exportPaths[0]));
    inputPath = path.resolve(options.normalizedOutput || path.join(reportDirectory, `${exportName}.normalized.json`));
    adapterResult = adaptNotionExport({ sourcePaths: exportPaths, timezoneOffset: options.timezoneOffset });
    adapterFiles = writeAdapterOutputs(adapterResult, { normalizedPath: inputPath, reportDirectory });
    input = adapterResult.normalized;
    console.log("Notion export adapter completed.");
    console.table({ detected: adapterResult.report.statistics.detected, normalized: adapterResult.report.statistics.normalized, skipped: adapterResult.report.statistics.skipped });
    console.log("Adapter outputs:", adapterFiles);
  } else {
    inputPath = path.resolve(options.input);
    input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  }
  store = createNotionImportStore({
    sqlitePath: options.sqlitePath ? path.resolve(options.sqlitePath) : null,
    databaseUrl: process.env.DATABASE_URL?.trim(),
    userId: process.env.MIGRATION_USER_ID?.trim(),
  });
  const reports = await runNotionImport({ input, store, apply: options.apply, inputName: inputPath });
  const files = writeImportReports(reports, reportDirectory);
  console.log(options.apply ? "Notion → EO import completed." : "Notion → EO dry run completed; no EO records were written.");
  console.table(reports.migrationReport.by_resource);
  console.log("Totals:", reports.migrationReport.totals);
  console.log("Reports:", files);
  if (reports.errorReport.errors.length || adapterResult?.report.errors.length) process.exitCode = 2;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await store?.close();
}
