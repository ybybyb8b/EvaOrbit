import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const RESOURCE_CONFIG = {
  memo: {
    table: "memos",
    columns: ["title", "content", "type", "status", "tags", "event_date", "confirmed_at", "merged_into_id", "source_system", "source_id", "source_url", "imported_at"],
    arrays: new Set(["tags"]),
    booleans: new Set(),
    natural: { columns: ["title", "content"], values: (data) => [data.title, data.content] },
  },
  chronicle: {
    table: "chronicle_entries",
    columns: ["date", "title", "content_md", "source"],
    arrays: new Set(),
    booleans: new Set(),
    natural: { columns: ["date", "title", "content_md"], values: (data) => [data.date, data.title, data.content_md] },
  },
  lucius_diary: {
    table: "lucius_diary_entries",
    columns: ["date", "content", "tags", "source_system", "source_id", "source_url", "imported_at"],
    arrays: new Set(["tags"]),
    booleans: new Set(),
    natural: { columns: ["date", "content"], values: (data) => [data.date, data.content] },
  },
  lucius_case: {
    table: "lucius_cases",
    columns: ["title", "error_type", "severity", "status", "trigger_scenes", "error_quote", "cause", "correct_behavior", "mandatory_rule", "next_check", "punishment", "first_occurred_date", "latest_occurred_date", "occurrence_count", "consecutive_correct_count", "recurrence_interval_days", "is_recurrence", "reset_threshold", "source_system", "source_id", "source_url", "imported_at"],
    arrays: new Set(["trigger_scenes"]),
    booleans: new Set(["is_recurrence"]),
    natural: { columns: ["title", "first_occurred_date", "cause"], values: (data) => [data.title, data.first_occurred_date, data.cause] },
  },
};

const LEDGER_SQLITE = `
  CREATE TABLE IF NOT EXISTS migration_import_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    source_system TEXT NOT NULL,
    source_id TEXT NOT NULL,
    resource TEXT NOT NULL CHECK(resource IN ('memo','chronicle','lucius_diary','lucius_case')),
    target_id INTEGER NOT NULL,
    source_url TEXT,
    source_created_at TEXT,
    source_updated_at TEXT,
    imported_at TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    UNIQUE(user_id, source_system, source_id)
  );
`;

function configFor(resource) {
  const config = RESOURCE_CONFIG[resource];
  if (!config) throw new Error(`Unsupported importer resource: ${resource}`);
  return config;
}

function sqliteValue(config, column, value) {
  if (config.arrays.has(column)) return JSON.stringify(value);
  if (config.booleans.has(column)) return Number(value);
  return value;
}

function postgresValue(config, column, value) {
  if (config.arrays.has(column)) return value;
  return value;
}

export class SqliteNotionImportStore {
  #database;
  #userId;
  #hasLedger = false;

  constructor(databasePath, { userId = "local" } = {}) {
    this.#database = new DatabaseSync(databasePath);
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#userId = userId;
  }

  async initialize({ apply }) {
    for (const { table } of Object.values(RESOURCE_CONFIG)) {
      const exists = this.#database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!exists) throw new Error(`SQLite target 缺少 ${table}；请先运行 EvaOrbit migrations`);
    }
    this.#hasLedger = Boolean(this.#database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='migration_import_ledger'").get());
    if (apply && !this.#hasLedger) {
      this.#database.exec(LEDGER_SQLITE);
      this.#hasLedger = true;
    }
  }

  #findSource(item) {
    if (this.#hasLedger) {
      const ledger = this.#database.prepare("SELECT resource,target_id,payload_hash,imported_at FROM migration_import_ledger WHERE user_id=? AND source_system='notion' AND source_id=?").get(this.#userId, item.notionPageId);
      if (ledger) return { resource: String(ledger.resource), targetId: Number(ledger.target_id), payloadHash: String(ledger.payload_hash), importedAt: String(ledger.imported_at), fromLedger: true };
    }
    const matches = [];
    for (const resource of ["memo", "lucius_diary", "lucius_case"]) {
      const config = configFor(resource);
      const rows = this.#database.prepare(`SELECT id,imported_at FROM ${config.table} WHERE user_id=? AND source_system='notion' AND source_id=? LIMIT 2`).all(this.#userId, item.notionPageId);
      for (const row of rows) matches.push({ resource, targetId: Number(row.id), payloadHash: null, importedAt: row.imported_at ? String(row.imported_at) : item.importedAt, fromLedger: false });
    }
    if (matches.length > 1) throw new Error(`source_system=notion + source_id=${item.notionPageId} 已对应多个 EO records；请人工处理 duplicate report 后重试`);
    return matches[0] ?? null;
  }

  #targetExists(resource, targetId) {
    const config = configFor(resource);
    return Boolean(this.#database.prepare(`SELECT 1 FROM ${config.table} WHERE id=? AND user_id=?`).get(targetId, this.#userId));
  }

  #findNatural(item) {
    const config = configFor(item.resource);
    const where = config.natural.columns.map((column) => `${column}=?`).join(" AND ");
    const row = this.#database.prepare(`SELECT id FROM ${config.table} WHERE user_id=? AND ${where} LIMIT 1`).get(this.#userId, ...config.natural.values(item.data));
    return row ? Number(row.id) : null;
  }

  #insert(item) {
    const config = configFor(item.resource);
    const columns = config.columns;
    const placeholders = columns.map(() => "?").join(",");
    const values = columns.map((column) => sqliteValue(config, column, item.data[column]));
    const result = this.#database.prepare(`INSERT INTO ${config.table}(user_id,${columns.join(",")}) VALUES(?,${placeholders})`).run(this.#userId, ...values);
    return Number(result.lastInsertRowid);
  }

  #update(item, targetId) {
    const config = configFor(item.resource);
    const assignments = config.columns.map((column) => column === "imported_at" ? `${column}=COALESCE(${column},?)` : `${column}=?`).join(",");
    const values = config.columns.map((column) => sqliteValue(config, column, item.data[column]));
    const result = this.#database.prepare(`UPDATE ${config.table} SET ${assignments},updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).run(...values, targetId, this.#userId);
    if (!result.changes) throw new Error(`导入目标已不存在：${item.resource}#${targetId}`);
  }

  #writeLedger(item, targetId, importedAt) {
    this.#database.prepare(`
      INSERT INTO migration_import_ledger(user_id,source_system,source_id,resource,target_id,source_url,source_created_at,source_updated_at,imported_at,payload_hash)
      VALUES(?,'notion',?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,source_system,source_id) DO UPDATE SET
        resource=excluded.resource,target_id=excluded.target_id,source_url=excluded.source_url,
        source_created_at=excluded.source_created_at,source_updated_at=excluded.source_updated_at,payload_hash=excluded.payload_hash
    `).run(this.#userId, item.notionPageId, item.resource, targetId, item.notionUrl, item.notionCreatedAt, item.notionUpdatedAt, importedAt, item.payloadHash);
  }

  #process(item, apply) {
    const source = this.#findSource(item);
    if (source) {
      if (source.resource !== item.resource) throw new Error(`source_system + source_id 已属于 ${source.resource}，不能改导入为 ${item.resource}`);
      if (!this.#targetExists(item.resource, source.targetId)) throw new Error(`导入账本指向不存在的 ${item.resource}#${source.targetId}`);
      const action = source.payloadHash === item.payloadHash ? "unchanged" : "updated";
      if (apply && action === "updated") {
        this.#update(item, source.targetId);
        this.#writeLedger(item, source.targetId, source.importedAt);
      }
      return { action, targetId: source.targetId, duplicate: { kind: "source_identity_match", target_id: source.targetId, action } };
    }
    const duplicateId = this.#findNatural(item);
    if (duplicateId !== null) return { action: "skipped_duplicates", targetId: duplicateId, duplicate: { kind: "existing_content_match", target_id: duplicateId, action: "skipped" } };
    if (!apply) return { action: "created", targetId: null };
    const targetId = this.#insert(item);
    this.#writeLedger(item, targetId, item.importedAt);
    return { action: "created", targetId };
  }

  async process(item, { apply }) {
    if (!apply) return this.#process(item, false);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.#process(item, true);
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async close() { this.#database.close(); }
}

export class PostgresNotionImportStore {
  #sql;
  #userId;
  #hasLedger = false;

  constructor(databaseUrl, { userId }) {
    this.#sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 15 });
    this.#userId = userId;
  }

  async initialize({ apply }) {
    for (const { table } of Object.values(RESOURCE_CONFIG)) {
      const [row] = await this.#sql`select to_regclass(${`public.${table}`}) as target`;
      if (!row.target) throw new Error(`Postgres target 缺少 public.${table}；请先运行 npm run db:migrate`);
    }
    const [ledger] = await this.#sql`select to_regclass('public.migration_import_ledger') as target`;
    this.#hasLedger = Boolean(ledger.target);
    if (apply && !this.#hasLedger) throw new Error("Postgres target 缺少 migration_import_ledger；请先运行 npm run db:migrate");
  }

  async #findSource(sql, item) {
    if (this.#hasLedger) {
      const rows = await sql.unsafe("select resource,target_id,payload_hash,imported_at from public.migration_import_ledger where user_id=$1 and source_system='notion' and source_id=$2", [this.#userId, item.notionPageId]);
      if (rows[0]) return { resource: String(rows[0].resource), targetId: Number(rows[0].target_id), payloadHash: String(rows[0].payload_hash), importedAt: String(rows[0].imported_at), fromLedger: true };
    }
    const matches = [];
    for (const resource of ["memo", "lucius_diary", "lucius_case"]) {
      const config = configFor(resource);
      const rows = await sql.unsafe(`select id,imported_at from public.${config.table} where user_id=$1 and source_system='notion' and source_id=$2 limit 2`, [this.#userId, item.notionPageId]);
      for (const row of rows) matches.push({ resource, targetId: Number(row.id), payloadHash: null, importedAt: row.imported_at ? String(row.imported_at) : item.importedAt, fromLedger: false });
    }
    if (matches.length > 1) throw new Error(`source_system=notion + source_id=${item.notionPageId} 已对应多个 EO records；请人工处理 duplicate report 后重试`);
    return matches[0] ?? null;
  }

  async #targetExists(sql, resource, targetId) {
    const config = configFor(resource);
    const rows = await sql.unsafe(`select 1 from public.${config.table} where id=$1 and user_id=$2`, [targetId, this.#userId]);
    return Boolean(rows[0]);
  }

  async #findNatural(sql, item) {
    const config = configFor(item.resource);
    const values = config.natural.values(item.data);
    const where = config.natural.columns.map((column, index) => `${column}=$${index + 2}`).join(" and ");
    const rows = await sql.unsafe(`select id from public.${config.table} where user_id=$1 and ${where} limit 1`, [this.#userId, ...values]);
    return rows[0] ? Number(rows[0].id) : null;
  }

  async #insert(sql, item) {
    const config = configFor(item.resource);
    const columns = config.columns;
    const placeholders = columns.map((_, index) => `$${index + 2}`).join(",");
    const values = columns.map((column) => postgresValue(config, column, item.data[column]));
    const rows = await sql.unsafe(`insert into public.${config.table}(user_id,${columns.join(",")}) values($1,${placeholders}) returning id`, [this.#userId, ...values]);
    return Number(rows[0].id);
  }

  async #update(sql, item, targetId) {
    const config = configFor(item.resource);
    const assignments = config.columns.map((column, index) => column === "imported_at" ? `${column}=coalesce(${column},$${index + 1})` : `${column}=$${index + 1}`).join(",");
    const values = config.columns.map((column) => postgresValue(config, column, item.data[column]));
    const rows = await sql.unsafe(`update public.${config.table} set ${assignments} where id=$${columnsLength(config) + 1} and user_id=$${columnsLength(config) + 2} returning id`, [...values, targetId, this.#userId]);
    if (!rows[0]) throw new Error(`导入目标已不存在：${item.resource}#${targetId}`);
  }

  async #writeLedger(sql, item, targetId, importedAt) {
    await sql.unsafe(`
      insert into public.migration_import_ledger(user_id,source_system,source_id,resource,target_id,source_url,source_created_at,source_updated_at,imported_at,payload_hash)
      values($1,'notion',$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict(user_id,source_system,source_id) do update set
        resource=excluded.resource,target_id=excluded.target_id,source_url=excluded.source_url,
        source_created_at=excluded.source_created_at,source_updated_at=excluded.source_updated_at,payload_hash=excluded.payload_hash
    `, [this.#userId, item.notionPageId, item.resource, targetId, item.notionUrl, item.notionCreatedAt, item.notionUpdatedAt, importedAt, item.payloadHash]);
  }

  async #process(sql, item, apply) {
    const source = await this.#findSource(sql, item);
    if (source) {
      if (source.resource !== item.resource) throw new Error(`source_system + source_id 已属于 ${source.resource}，不能改导入为 ${item.resource}`);
      if (!await this.#targetExists(sql, item.resource, source.targetId)) throw new Error(`导入账本指向不存在的 ${item.resource}#${source.targetId}`);
      const action = source.payloadHash === item.payloadHash ? "unchanged" : "updated";
      if (apply && action === "updated") {
        await this.#update(sql, item, source.targetId);
        await this.#writeLedger(sql, item, source.targetId, source.importedAt);
      }
      return { action, targetId: source.targetId, duplicate: { kind: "source_identity_match", target_id: source.targetId, action } };
    }
    const duplicateId = await this.#findNatural(sql, item);
    if (duplicateId !== null) return { action: "skipped_duplicates", targetId: duplicateId, duplicate: { kind: "existing_content_match", target_id: duplicateId, action: "skipped" } };
    if (!apply) return { action: "created", targetId: null };
    const targetId = await this.#insert(sql, item);
    await this.#writeLedger(sql, item, targetId, item.importedAt);
    return { action: "created", targetId };
  }

  async process(item, { apply }) {
    if (!apply) return this.#process(this.#sql, item, false);
    return this.#sql.begin((transaction) => this.#process(transaction, item, true));
  }

  async close() { await this.#sql.end(); }
}

function columnsLength(config) { return config.columns.length; }

export function createNotionImportStore({ sqlitePath, databaseUrl, userId }) {
  if (sqlitePath) return new SqliteNotionImportStore(sqlitePath, { userId: userId || "local" });
  if (!databaseUrl) throw new Error("缺少 target：请传 --sqlite，或设置 DATABASE_URL 与 MIGRATION_USER_ID");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId || "")) throw new Error("MIGRATION_USER_ID 必须是 Supabase Auth 用户 UUID");
  return new PostgresNotionImportStore(databaseUrl, { userId });
}
