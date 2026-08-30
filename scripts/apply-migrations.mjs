import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("缺少 DATABASE_URL；未连接任何数据库。");

const directory = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
if (!files.length) throw new Error("没有找到 Supabase migration。");
function transactionBody(source) {
  const trimmed = source.trim();
  if (/^begin\s*;/i.test(trimmed) && /commit\s*;$/i.test(trimmed)) {
    return trimmed.replace(/^begin\s*;\s*/i, "").replace(/\s*commit\s*;$/i, "");
  }
  return source;
}

const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 15 });
try {
  await sql`
    create table if not exists public.evaorbit_schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default timezone('utc', now())
    )
  `;
  for (const file of files) {
    const source = fs.readFileSync(path.join(directory, file), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const [applied] = await sql`select checksum from public.evaorbit_schema_migrations where filename = ${file}`;
    if (applied) {
      if (applied.checksum !== checksum) throw new Error(`已应用的 migration ${file} 内容发生变化；请新增 migration，不要改写历史。`);
      console.log(`Skipping ${file}... already applied`);
      continue;
    }
    process.stdout.write(`Applying ${file}... `);
    await sql.begin(async (transaction) => {
      await transaction.unsafe(transactionBody(source));
      await transaction`insert into public.evaorbit_schema_migrations (filename, checksum) values (${file}, ${checksum})`;
    });
    console.log("done");
  }
} finally {
  await sql.end();
}
