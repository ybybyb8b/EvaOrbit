import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

// A dedicated synthetic database; never inherit the online account/database configuration.
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const directory = path.join(root, "tmp", "workout-preview");
mkdirSync(directory, { recursive: true });
process.env.EVAORBIT_DATA_BACKEND = "sqlite";
process.env.EVAORBIT_SQLITE_PATH = path.join(directory, "preview.db");
process.env.EVAORBIT_NEXT_DIST_DIR = ".next-workout-preview";
process.env.VERCEL = "";

register("./typescript-test-loader.mjs", import.meta.url);
const { createTrainingLog } = await import("../src/lib/db.ts");
const { dateInEvaOrbit } = await import("../src/lib/time.ts");
const database = new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
try {
  const sampleId = "946e6cf1-96f2-4e47-9d45-b0fab32db24d";
  const existing = database.prepare("SELECT id FROM training_logs WHERE json_extract(workout,'$.sampleId')=?").get(sampleId);
  if (!existing) {
    const day = dateInEvaOrbit();
    const occurredAt = `${day}T06:00:00.123Z`;
    const log = createTrainingLog({ occurredAt, occurredHasExplicitTime: true, trainingType: "strength", bodyParts: [], teacher: "", course: "", durationMinutes: 59, notes: "" });
    const workout = { operation: "upsert", metric: "workout", sampleId, streamId: "946e6cf1-96f2-4e47-9d45-b0fab32db24e", revision: 1,
      startAt: occurredAt, endAt: `${day}T07:00:00.456Z`, timeZone: "Asia/Shanghai", timeZoneSource: "metadata",
      sourceName: "模拟 Apple Watch · 本地演示", sourceBundle: "test.workout.preview",
      workout: { activityType: 50, activityName: "traditionalStrengthTraining", durationSeconds: 3540.333, activeEnergyKcal: 234.567, deviceModel: "模拟 Apple Watch" } };
    database.prepare("UPDATE training_logs SET workout=? WHERE id=?").run(JSON.stringify(workout), log.id);
  }
} finally { database.close(); }

console.log("Workout 本地演示：使用独立 SQLite 和模拟训练，不连接 Supabase；再次启动保留已填写内容。");
console.log("打开首页 Universal Log → Training → 补充已有训练，或 /health?view=training 查看历史。");
if (!process.argv.includes("--seed-only")) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), "dev", ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
  child.on("error", error => { console.error("本地演示启动失败：", error.message); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
}
