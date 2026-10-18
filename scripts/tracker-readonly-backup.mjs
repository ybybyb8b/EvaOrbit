import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const tables = ["trackers", "tracker_fields", "tracker_entries", "tracker_goals", "tracker_reminders"];
export async function readTrackerBackup(sql, email) {
  if (!email) throw new Error("Missing account selection");
  return sql.begin(async tx => {
    await tx`set transaction isolation level repeatable read read only`;
    const owners = await tx`select id from auth.users where lower(email)=${email.trim().toLowerCase()}`;
    if (owners.length !== 1) throw new Error("Account selection is not unique");
    const accountId = owners[0].id;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: accountId, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    const records = {};
    for (const table of tables) records[table] = await tx`select * from public.${tx(table)} where user_id=${accountId} order by id`;
    const reminderIds = records.tracker_reminders.map(row => row.reminder_id).filter(id => id != null);
    records.reminders = reminderIds.length ? await tx`select * from public.reminders where user_id=${accountId} and id in ${tx(reminderIds)} order by id` : [];
    const backup = { format: "evaorbit-tracker-backup-v1", capturedAt: new Date().toISOString(), accountId, binaryAssetsIncluded: false, records };
    validateTrackerBackup(backup);
    return backup;
  });
}

export function validateTrackerBackup(backup) {
  if (backup.format !== "evaorbit-tracker-backup-v1" || typeof backup.accountId !== "string") throw new Error("Invalid backup");
  const parents = new Set(backup.records.trackers.map(row => String(row.id)));
  for (const table of [...tables, "reminders"]) {
    const ids = new Set();
    for (const row of backup.records[table]) {
      if (row.user_id !== backup.accountId || row.id == null || ids.has(String(row.id))) throw new Error("Invalid account or duplicate record");
      ids.add(String(row.id));
      if (table.startsWith("tracker_") && !parents.has(String(row.tracker_id))) throw new Error("Orphaned Tracker data");
    }
  }
}

async function main() {
  process.loadEnvFile(".env.local");
  if (!process.env.DATABASE_URL) throw new Error("Database connection unavailable");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: { rejectUnauthorized: true, ca: await fs.readFile(new URL("./ios/supabase-root-2021.crt", import.meta.url), "utf8") }, connect_timeout: 15, idle_timeout: 2, onnotice() {} });
  try {
    const backup = await readTrackerBackup(sql, process.env.EVAORBIT_ALLOWED_EMAIL);
    const bytes = JSON.stringify(backup, null, 2), sha256 = createHash("sha256").update(bytes).digest("hex");
    const directory = path.resolve("tmp/private-tracker-acceptance", backup.capturedAt.replaceAll(":", "-"));
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, "tracker-backup.json");
    await fs.writeFile(file, bytes, { flag: "wx", mode: 0o600 });
    const verified = await fs.readFile(file);
    if (createHash("sha256").update(verified).digest("hex") !== sha256) throw new Error("Backup verification failed");
    validateTrackerBackup(JSON.parse(verified.toString("utf8")));
    const manifest = { format: backup.format, capturedAt: backup.capturedAt, sha256, bytes: verified.length, counts: Object.fromEntries(Object.entries(backup.records).map(([table, rows]) => [table, rows.length])), binaryAssetsIncluded: false, verification: "read-back checksum, account and referential checks; no restore writes" };
    await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ directory, ...manifest }));
  } finally { await sql.end({ timeout: 2 }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error("Read-only Tracker backup failed", { code: typeof error.code === "string" ? error.code : "CHECK_FAILED" }); process.exitCode = 1; });
