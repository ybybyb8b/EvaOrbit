import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { BACKUP_TABLES, emptyBackupResources, parseBackupDocument } from "../src/lib/data-backup.ts";
import { workspaceKinds, validateWorkspaceSnapshot } from "../src/lib/workspace-readonly.ts";
import { allowsBusinessRequest } from "../src/lib/business-request-policy.ts";

test("retired Lucius cannot be routed, downloaded, written or restored by current clients", () => {
  for (const path of ["src/app/lucius", "src/app/api/lucius", "src/lib/services/lucius.ts"]) assert(!fs.existsSync(path));
  assert(!workspaceKinds.includes("lucius"));
  assert.throws(() => validateWorkspaceSnapshot({ kind: "lucius" }, "owner", "lucius"));
  for (const path of ["/api/lucius/state", "/api/lucius/diary", "/api/lucius/posts/1/comments"])
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) assert(!allowsBusinessRequest(path, method));
  assert(!BACKUP_TABLES.some(table => table.startsWith("lucius_")));
  const resources = { ...emptyBackupResources(), lucius_diary_entries: [{ id: 1, content: "archive only" }], lucius_state: [{ status: "old" }] };
  const parsed = parseBackupDocument({ backup_version: 18, exported_at: "2026-11-25T00:00:00Z", schema: { supabase_migration: "old" }, resources });
  assert(!Object.keys(parsed.resources).some(key => key.startsWith("lucius_")));
});

test("retirement requires a backup guard and preserves unrelated rows and permissions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table migration_import_ledger(resource text constraint migration_import_ledger_resource_check check(resource in ('memo','chronicle','lucius_diary')));
      insert into migration_import_ledger values ('memo'),('chronicle'),('lucius_diary');
      create table ui_preferences(home_module_order jsonb);
      insert into ui_preferences values ('["memo","lucius","chronicle","lucius"]');
      create table agent_connections(policy jsonb,revision int);
      insert into agent_connections values ('{"permissions":["echo:get","lucius_diary:create","lucius_state:update","chronicle:get"],"other":true}',3),('{"other":true}',5);
      create table agent_access_history(resource text);
      insert into agent_access_history values ('echo'),('lucius_post');
      create table notification_deliveries(source_type text,target_type text);
      insert into notification_deliveries values ('task','task'),('lucius_activity','lucius');
      create table lucius_cases(id bigint);
      create table lucius_state(id bigint);
      create table lucius_diary_entries(id bigint);
      create table lucius_posts(id bigint primary key);
      create table lucius_post_comments(post_id bigint references lucius_posts(id));
      create table memos(content text);insert into memos values ('Lucius remains in Memory');
    `);
    const migration = fs.readFileSync("supabase/migrations/202611250001_retire_lucius.sql", "utf8");
    await assert.rejects(db.exec(migration), /requires a verified backup/);
    await db.exec("rollback");
    await db.query("select set_config('evaorbit.lucius_backup_sha256',$1,false)", ["a".repeat(64)]);
    await db.exec(migration);
    assert.deepEqual((await db.query("select resource from migration_import_ledger order by resource")).rows, [{ resource: "chronicle" }, { resource: "memo" }]);
    assert.deepEqual((await db.query("select home_module_order from ui_preferences")).rows[0].home_module_order, ["memo", "chronicle"]);
    assert.deepEqual((await db.query("select policy,revision from agent_connections order by revision")).rows, [
      { policy: { permissions: ["echo:get", "chronicle:get"], other: true }, revision: 4 }, { policy: { other: true }, revision: 5 },
    ]);
    assert.equal((await db.query("select count(*)::int as count from memos")).rows[0].count, 1);
    assert.equal((await db.query("select count(*)::int as count from agent_access_history")).rows[0].count, 1);
    assert.equal((await db.query("select count(*)::int as count from notification_deliveries")).rows[0].count, 1);
    assert.equal((await db.query("select count(*)::int as count from pg_tables where schemaname='public' and tablename like 'lucius_%'")).rows[0].count, 0);
  } finally { await db.close(); }
});
