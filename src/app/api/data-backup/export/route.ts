import { allowedEmail, usesSupabase } from "@/lib/config";
import { BACKUP_SCHEMA_VERSION, BACKUP_TABLES, BACKUP_VERSION, emptyBackupResources, sanitizeExportRow, type BackupTable } from "@/lib/data-backup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
const orderColumn: Partial<Record<BackupTable, string>> = {
  ui_preferences: "user_id",
  daily_nutrition_summaries: "date",
  lucius_state: "user_id",
  meal_reminder_rules: "meal_type",
};

export async function GET() {
  if (!usesSupabase()) return Response.json({ error: "备份导出仅在 Supabase 数据源下可用" }, { status: 409 });

  const client = await createSupabaseServerClient();
  const { data, error: authError } = await client.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLocaleLowerCase() : "";
  const expectedEmail = allowedEmail();
  if (authError || !data?.claims?.sub || !expectedEmail || email !== expectedEmail) {
    return Response.json({ error: "当前账户无权导出 EvaOrbit 数据" }, { status: 403 });
  }

  const resources = emptyBackupResources();
  for (const table of BACKUP_TABLES) {
    let offset = 0;
    while (true) {
      const { data: rows, error } = await client
        .from(table)
        .select("*")
        .order(orderColumn[table] ?? "id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) return Response.json({ error: `导出 ${table} 失败：${error.message}` }, { status: 500 });
      const page = (rows ?? []).map((row) => sanitizeExportRow(table, row));
      resources[table].push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  const exportedAt = new Date().toISOString();
  const body = JSON.stringify({
    backup_version: BACKUP_VERSION,
    exported_at: exportedAt,
    schema: { supabase_migration: BACKUP_SCHEMA_VERSION },
    source: { backend: "supabase" },
    resources,
  }, null, 2);
  const date = exportedAt.slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="evaorbit-backup-${date}.json"`,
      "Cache-Control": "no-store",
      "X-EvaOrbit-Exported-At": exportedAt,
    },
  });
}
