import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("缺少 DATABASE_URL；未连接任何数据库。");

const directory = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
if (!files.length) throw new Error("没有找到 Supabase migration。");

const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 15 });
try {
  for (const file of files) {
    process.stdout.write(`Applying ${file}... `);
    await sql.unsafe(fs.readFileSync(path.join(directory, file), "utf8"));
    console.log("done");
  }
} finally {
  await sql.end();
}
