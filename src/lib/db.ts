import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { AiSettings, ChatMessage, ChatPreferences, ChatRole, ChatSession, DashboardSummary, DrinkLimit, DrinkLog, FoodLibraryItem, FoodLog, InboxItem, Memory, Task } from "./types";
import type { AiSettingsInput } from "./repositories/types";

type TaskRow = {
  id: number;
  title: string;
  notes: string;
  completed: number;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  tags: string;
  created_at: string;
  updated_at: string;
};

type MemoryRow = {
  id: number;
  title: string;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
};

type AiSettingsRow = {
  provider_preset: string;
  provider_name: string;
  base_url: string;
  api_key: string;
  model: string;
  enabled: number;
  temperature: number;
  system_prompt: string;
  response_length: "brief" | "balanced" | "detailed";
  initiative: "quiet" | "balanced" | "active";
  allow_suggestions: number;
  allow_teasing: number;
  include_tasks: number;
  include_memories: number;
  allow_write_actions: number;
  user_display_name: string;
  user_avatar_type: ChatPreferences["userAvatarType"];
  user_avatar_value: string;
  assistant_display_name: string;
  assistant_avatar_type: ChatPreferences["assistantAvatarType"];
  assistant_avatar_value: string;
  show_user_name: number;
  show_assistant_name: number;
  show_avatars: number;
  updated_at: string;
};

type ChatSessionRow = {
  id: number;
  title: string;
  model: string | null;
  created_at: string;
  updated_at: string;
  preview?: string | null;
  message_count?: number;
};

type ChatMessageRow = {
  id: number;
  session_id: number;
  role: ChatRole;
  content: string;
  model: string | null;
  created_at: string;
};

export type InternalAiSettings = AiSettings & { apiKey: string };

const legacyDbPath = path.join(process.cwd(), "data", "personal-hub.db");
const defaultDbPath = fs.existsSync(legacyDbPath) ? legacyDbPath : path.join(process.cwd(), "data", "eva-orbit.db");
const dbPath = process.env.EVAORBIT_SQLITE_PATH
  ? path.resolve(process.env.EVAORBIT_SQLITE_PATH)
  : process.env.PERSONAL_HUB_DB_PATH
    ? path.resolve(process.env.PERSONAL_HUB_DB_PATH)
    : defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const database = new DatabaseSync(dbPath);
database.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
database.exec("PRAGMA journal_mode = WAL;");
database.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '其他',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_completed_due ON tasks(completed, due_date);
  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  INSERT OR IGNORE INTO migrations(version) VALUES (1);

  CREATE TABLE IF NOT EXISTS ai_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider_preset TEXT NOT NULL DEFAULT 'openai',
    provider_name TEXT NOT NULL DEFAULT 'OpenAI',
    base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    api_key TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    temperature REAL NOT NULL DEFAULT 0.6,
    system_prompt TEXT NOT NULL DEFAULT '',
    include_tasks INTEGER NOT NULL DEFAULT 1 CHECK (include_tasks IN (0, 1)),
    include_memories INTEGER NOT NULL DEFAULT 1 CHECK (include_memories IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '新对话',
    model TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id);
  INSERT OR IGNORE INTO ai_settings(id) VALUES (1);
  INSERT OR IGNORE INTO migrations(version) VALUES (2);
`);

const hasV3 = database.prepare("SELECT 1 FROM migrations WHERE version = 3").get();
if (!hasV3) {
  database.exec("ALTER TABLE ai_settings ADD COLUMN allow_write_actions INTEGER NOT NULL DEFAULT 0 CHECK (allow_write_actions IN (0, 1)); INSERT INTO migrations(version) VALUES (3);");
}

const hasV4 = database.prepare("SELECT 1 FROM migrations WHERE version = 4").get();
if (!hasV4) {
  database.exec(`
    ALTER TABLE ai_settings ADD COLUMN response_length TEXT NOT NULL DEFAULT 'balanced' CHECK (response_length IN ('brief', 'balanced', 'detailed'));
    ALTER TABLE ai_settings ADD COLUMN initiative TEXT NOT NULL DEFAULT 'quiet' CHECK (initiative IN ('quiet', 'balanced', 'active'));
    ALTER TABLE ai_settings ADD COLUMN allow_suggestions INTEGER NOT NULL DEFAULT 1 CHECK (allow_suggestions IN (0, 1));
    ALTER TABLE ai_settings ADD COLUMN allow_teasing INTEGER NOT NULL DEFAULT 1 CHECK (allow_teasing IN (0, 1));
    INSERT INTO migrations(version) VALUES (4);
  `);
}

database.exec(`
  CREATE TABLE IF NOT EXISTS inbox_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox','processed','archived')),
    source TEXT NOT NULL DEFAULT 'manual', processed_at TEXT, converted_type TEXT, converted_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL, meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack','late_night')),
    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', portion TEXT NOT NULL DEFAULT '', scene TEXT NOT NULL DEFAULT 'other' CHECK (scene IN ('home','delivery','restaurant','packaged_food','other')),
    estimated_kcal REAL, kcal_min REAL, kcal_max REAL, confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('high','medium','low')),
    notes TEXT NOT NULL DEFAULT '', image_url TEXT, attachment_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS food_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('staple','dish','snack','drink','other')),
    default_portion TEXT NOT NULL DEFAULT '', reference_type TEXT NOT NULL DEFAULT 'per_serving' CHECK (reference_type IN ('per_100g','per_100ml','per_serving')),
    reference_energy_kj REAL, reference_kcal REAL, serving_weight REAL, serving_kcal REAL, data_source TEXT NOT NULL DEFAULT 'manual' CHECK (data_source IN ('package_label','official','estimated','manual')),
    notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(name, brand)
  );
  CREATE TABLE IF NOT EXISTS drink_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL, name TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '',
    drink_type TEXT NOT NULL DEFAULT 'other' CHECK (drink_type IN ('coffee','milk_tea','tea','soda','juice','water','alcohol','other')),
    volume_ml REAL, sugar_level TEXT NOT NULL DEFAULT '', caffeine_mg REAL, estimated_kcal REAL, kcal_min REAL, kcal_max REAL,
    confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('high','medium','low')), food_library_id INTEGER REFERENCES food_library(id) ON DELETE SET NULL,
    notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS drink_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, target_type TEXT NOT NULL, period TEXT NOT NULL CHECK (period IN ('daily','weekly')),
    limit_value INTEGER NOT NULL CHECK (limit_value > 0), enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS daily_nutrition_summaries (
    date TEXT PRIMARY KEY, resting_energy_kcal REAL, active_energy_kcal REAL, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_inbox_status_created ON inbox_items(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_food_logs_occurred ON food_logs(occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_drink_logs_occurred ON drink_logs(occurred_at DESC);
  INSERT OR IGNORE INTO migrations(version) VALUES (5);
`);

const hasV6 = database.prepare("SELECT 1 FROM migrations WHERE version = 6").get();
if (!hasV6) {
  database.exec(`
    ALTER TABLE ai_settings ADD COLUMN user_display_name TEXT NOT NULL DEFAULT '我';
    ALTER TABLE ai_settings ADD COLUMN user_avatar_type TEXT NOT NULL DEFAULT 'default' CHECK (user_avatar_type IN ('default','emoji','image'));
    ALTER TABLE ai_settings ADD COLUMN user_avatar_value TEXT NOT NULL DEFAULT '';
    ALTER TABLE ai_settings ADD COLUMN assistant_display_name TEXT NOT NULL DEFAULT 'Eva';
    ALTER TABLE ai_settings ADD COLUMN assistant_avatar_type TEXT NOT NULL DEFAULT 'default' CHECK (assistant_avatar_type IN ('default','emoji','image'));
    ALTER TABLE ai_settings ADD COLUMN assistant_avatar_value TEXT NOT NULL DEFAULT '';
    ALTER TABLE ai_settings ADD COLUMN show_user_name INTEGER NOT NULL DEFAULT 1 CHECK (show_user_name IN (0,1));
    ALTER TABLE ai_settings ADD COLUMN show_assistant_name INTEGER NOT NULL DEFAULT 1 CHECK (show_assistant_name IN (0,1));
    ALTER TABLE ai_settings ADD COLUMN show_avatars INTEGER NOT NULL DEFAULT 1 CHECK (show_avatars IN (0,1));
    INSERT INTO migrations(version) VALUES (6);
  `);
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    completed: Boolean(row.completed),
    dueDate: row.due_date,
    priority: row.priority,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function memoryFromRow(row: MemoryRow): Memory {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function chatSessionFromRow(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preview: row.preview ?? "",
    messageCount: row.message_count ?? 0,
  };
}

function chatMessageFromRow(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    model: row.model,
    createdAt: row.created_at,
  };
}

export function listTasks(filter: "all" | "open" | "done" = "all") {
  const where = filter === "open" ? "WHERE completed = 0" : filter === "done" ? "WHERE completed = 1" : "";
  return (database.prepare(`SELECT * FROM tasks ${where} ORDER BY completed, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, due_date IS NULL, due_date, created_at DESC`).all() as TaskRow[]).map(taskFromRow);
}

export function getTask(id: number) {
  const row = database.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return row ? taskFromRow(row) : null;
}

export function createTask(input: { title: string; notes: string; dueDate: string | null; priority: string; tags: string[] }) {
  const result = database.prepare("INSERT INTO tasks(title, notes, due_date, priority, tags) VALUES (?, ?, ?, ?, ?)").run(input.title, input.notes, input.dueDate, input.priority, JSON.stringify(input.tags));
  return getTask(Number(result.lastInsertRowid))!;
}

export function updateTask(id: number, input: Record<string, unknown>) {
  const columns: string[] = [];
  const values: Array<string | number | null> = [];
  const map: Record<string, string> = { title: "title", notes: "notes", completed: "completed", dueDate: "due_date", priority: "priority", tags: "tags" };
  for (const [key, column] of Object.entries(map)) {
    if (input[key] !== undefined) {
      columns.push(`${column} = ?`);
      const value = key === "completed" ? Number(input[key]) : key === "tags" ? JSON.stringify(input[key]) : input[key] as string | null;
      values.push(value);
    }
  }
  if (!columns.length) return getTask(id);
  values.push(id);
  database.prepare(`UPDATE tasks SET ${columns.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
  return getTask(id);
}

export function deleteTask(id: number) {
  return database.prepare("DELETE FROM tasks WHERE id = ?").run(id).changes > 0;
}

export function listMemories(query = "", category = "") {
  const conditions: string[] = [];
  const values: string[] = [];
  if (query) {
    conditions.push("(title LIKE ? OR content LIKE ?)");
    values.push(`%${query}%`, `%${query}%`);
  }
  if (category) {
    conditions.push("category = ?");
    values.push(category);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return (database.prepare(`SELECT * FROM memories ${where} ORDER BY updated_at DESC, id DESC`).all(...values) as MemoryRow[]).map(memoryFromRow);
}

export function getMemory(id: number) {
  const row = database.prepare("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow | undefined;
  return row ? memoryFromRow(row) : null;
}

export function createMemory(input: { title: string; content: string; category: string }) {
  const result = database.prepare("INSERT INTO memories(title, content, category) VALUES (?, ?, ?)").run(input.title, input.content, input.category);
  return getMemory(Number(result.lastInsertRowid))!;
}

export function updateMemory(id: number, input: Record<string, unknown>) {
  const columns: string[] = [];
  const values: Array<string | number | null> = [];
  for (const key of ["title", "content", "category"]) {
    if (input[key] !== undefined) {
      columns.push(`${key} = ?`);
      values.push(input[key] as string);
    }
  }
  if (!columns.length) return getMemory(id);
  values.push(id);
  database.prepare(`UPDATE memories SET ${columns.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
  return getMemory(id);
}

export function deleteMemory(id: number) {
  return database.prepare("DELETE FROM memories WHERE id = ?").run(id).changes > 0;
}

export function getDashboardSummary(): DashboardSummary {
  const today = new Date().toLocaleDateString("en-CA");
  const counts = database.prepare(`SELECT
    (SELECT COUNT(*) FROM tasks WHERE completed = 0) AS open_tasks,
    (SELECT COUNT(*) FROM tasks WHERE completed = 0 AND due_date = ?) AS due_today,
    (SELECT COUNT(*) FROM memories) AS memories`).get(today) as { open_tasks: number; due_today: number; memories: number };
  return {
    openTasks: counts.open_tasks,
    dueToday: counts.due_today,
    memories: counts.memories,
    recentTasks: (database.prepare("SELECT * FROM tasks ORDER BY created_at DESC, id DESC LIMIT 4").all() as TaskRow[]).map(taskFromRow),
    recentMemories: (database.prepare("SELECT * FROM memories ORDER BY updated_at DESC, id DESC LIMIT 3").all() as MemoryRow[]).map(memoryFromRow),
  };
}

export function getAiSettings(): InternalAiSettings {
  const row = database.prepare("SELECT * FROM ai_settings WHERE id = 1").get() as AiSettingsRow;
  return {
    providerPreset: row.provider_preset,
    providerName: row.provider_name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    hasApiKey: Boolean(row.api_key),
    apiKeyManagedByEnvironment: false,
    model: row.model,
    enabled: Boolean(row.enabled),
    temperature: row.temperature,
    systemPrompt: row.system_prompt,
    responseLength: row.response_length,
    initiative: row.initiative,
    allowSuggestions: Boolean(row.allow_suggestions),
    allowTeasing: Boolean(row.allow_teasing),
    includeTasks: Boolean(row.include_tasks),
    includeMemories: Boolean(row.include_memories),
    allowWriteActions: Boolean(row.allow_write_actions),
    userDisplayName: row.user_display_name,
    userAvatarType: row.user_avatar_type,
    userAvatarValue: row.user_avatar_value,
    assistantDisplayName: row.assistant_display_name,
    assistantAvatarType: row.assistant_avatar_type,
    assistantAvatarValue: row.assistant_avatar_value,
    showUserName: Boolean(row.show_user_name),
    showAssistantName: Boolean(row.show_assistant_name),
    showAvatars: Boolean(row.show_avatars),
    updatedAt: row.updated_at,
  };
}

export function updateAiSettings(input: AiSettingsInput) {
  const current = getAiSettings();
  database.prepare(`UPDATE ai_settings SET
    provider_preset = ?, provider_name = ?, base_url = ?, api_key = ?, model = ?, enabled = ?,
    temperature = ?, system_prompt = ?, response_length = ?, initiative = ?, allow_suggestions = ?, allow_teasing = ?,
    include_tasks = ?, include_memories = ?, allow_write_actions = ?,
    user_display_name = ?, user_avatar_type = ?, user_avatar_value = ?, assistant_display_name = ?, assistant_avatar_type = ?, assistant_avatar_value = ?,
    show_user_name = ?, show_assistant_name = ?, show_avatars = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1`).run(
      input.providerPreset,
      input.providerName,
      input.baseUrl,
      input.apiKey === undefined ? current.apiKey : input.apiKey,
      input.model,
      Number(input.enabled),
      input.temperature,
      input.systemPrompt,
      input.responseLength,
      input.initiative,
      Number(input.allowSuggestions),
      Number(input.allowTeasing),
      Number(input.includeTasks),
      Number(input.includeMemories),
      Number(input.allowWriteActions),
      input.userDisplayName,
      input.userAvatarType,
      input.userAvatarValue,
      input.assistantDisplayName,
      input.assistantAvatarType,
      input.assistantAvatarValue,
      Number(input.showUserName),
      Number(input.showAssistantName),
      Number(input.showAvatars),
    );
  return getAiSettings();
}

export function updateChatPreferences(input: ChatPreferences) {
  database.prepare(`UPDATE ai_settings SET
    user_display_name=?, user_avatar_type=?, user_avatar_value=?, assistant_display_name=?, assistant_avatar_type=?, assistant_avatar_value=?,
    show_user_name=?, show_assistant_name=?, show_avatars=?, updated_at=STRFTIME('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1`).run(
      input.userDisplayName, input.userAvatarType, input.userAvatarValue,
      input.assistantDisplayName, input.assistantAvatarType, input.assistantAvatarValue,
      Number(input.showUserName), Number(input.showAssistantName), Number(input.showAvatars),
    );
  return getAiSettings();
}

export function listChatSessions() {
  const rows = database.prepare(`SELECT s.*,
    COALESCE((SELECT content FROM chat_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1), '') AS preview,
    (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) AS message_count
    FROM chat_sessions s ORDER BY s.updated_at DESC, s.id DESC`).all() as ChatSessionRow[];
  return rows.map(chatSessionFromRow);
}

export function getChatSession(id: number) {
  const row = database.prepare(`SELECT s.*,
    COALESCE((SELECT content FROM chat_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1), '') AS preview,
    (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) AS message_count
    FROM chat_sessions s WHERE s.id = ?`).get(id) as ChatSessionRow | undefined;
  return row ? chatSessionFromRow(row) : null;
}

export function createChatSession(title = "新对话") {
  const result = database.prepare("INSERT INTO chat_sessions(title) VALUES (?)").run(title);
  return getChatSession(Number(result.lastInsertRowid))!;
}

export function updateChatSession(id: number, title: string) {
  database.prepare("UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(title, id);
  return getChatSession(id);
}

export function deleteChatSession(id: number) {
  return database.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id).changes > 0;
}

export function listChatMessages(sessionId: number) {
  return (database.prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id").all(sessionId) as ChatMessageRow[]).map(chatMessageFromRow);
}

export function addChatMessage(sessionId: number, role: ChatRole, content: string, model: string | null = null) {
  const result = database.prepare("INSERT INTO chat_messages(session_id, role, content, model) VALUES (?, ?, ?, ?)").run(sessionId, role, content, model);
  database.prepare("UPDATE chat_sessions SET model = COALESCE(?, model), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(model, sessionId);
  const row = database.prepare("SELECT * FROM chat_messages WHERE id = ?").get(Number(result.lastInsertRowid)) as ChatMessageRow;
  return chatMessageFromRow(row);
}

export function autoTitleChatSession(id: number, content: string) {
  const session = getChatSession(id);
  if (!session || session.messageCount > 1 || session.title !== "新对话") return;
  const compact = content.replace(/\s+/g, " ").trim();
  const title = compact.length > 28 ? `${compact.slice(0, 28)}…` : compact;
  database.prepare("UPDATE chat_sessions SET title = ? WHERE id = ?").run(title, id);
}

export function getAiContext() {
  return {
    tasks: listTasks("open").slice(0, 30),
    memories: listMemories().slice(0, 30),
  };
}

function inboxFromRow(row: Record<string, unknown>): InboxItem {
  return { id: Number(row.id), content: String(row.content), status: row.status as InboxItem["status"], source: String(row.source), processedAt: row.processed_at ? String(row.processed_at) : null, convertedType: row.converted_type ? String(row.converted_type) : null, convertedId: row.converted_id === null ? null : Number(row.converted_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export function listInbox(status = "inbox") { return (database.prepare("SELECT * FROM inbox_items WHERE status = ? ORDER BY created_at DESC, id DESC").all(status) as Record<string, unknown>[]).map(inboxFromRow); }
export function getInboxItem(id: number) { const row = database.prepare("SELECT * FROM inbox_items WHERE id = ?").get(id) as Record<string, unknown> | undefined; return row ? inboxFromRow(row) : null; }
export function createInboxItem(input: { content: string; source: string }) { const result = database.prepare("INSERT INTO inbox_items(content, source) VALUES (?, ?)").run(input.content, input.source); return getInboxItem(Number(result.lastInsertRowid))!; }
export function updateInboxItem(id: number, input: Record<string, unknown>) {
  const map: Record<string, string> = { content: "content", status: "status", processedAt: "processed_at", convertedType: "converted_type", convertedId: "converted_id" };
  const entries = Object.entries(map).filter(([key]) => input[key] !== undefined); if (!entries.length) return getInboxItem(id);
  database.prepare(`UPDATE inbox_items SET ${entries.map(([, column]) => `${column} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...entries.map(([key]) => input[key] as string | number | null), id);
  return getInboxItem(id);
}
export function deleteInboxItem(id: number) { return database.prepare("DELETE FROM inbox_items WHERE id = ?").run(id).changes > 0; }

function foodFromRow(row: Record<string, unknown>): FoodLog { return { id: Number(row.id), occurredAt: String(row.occurred_at), mealType: row.meal_type as FoodLog["mealType"], title: String(row.title), description: String(row.description), portion: String(row.portion), scene: row.scene as FoodLog["scene"], estimatedKcal: row.estimated_kcal === null ? null : Number(row.estimated_kcal), kcalMin: row.kcal_min === null ? null : Number(row.kcal_min), kcalMax: row.kcal_max === null ? null : Number(row.kcal_max), confidence: row.confidence as FoodLog["confidence"], notes: String(row.notes), imageUrl: row.image_url ? String(row.image_url) : null, attachmentId: row.attachment_id ? String(row.attachment_id) : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
export function listFoodLogs(input: { query?: string; mealType?: string; from?: string; to?: string } = {}) {
  const conditions: string[] = [], values: string[] = [];
  if (input.query) { conditions.push("(title LIKE ? OR description LIKE ?)"); values.push(`%${input.query}%`, `%${input.query}%`); }
  if (input.mealType) { conditions.push("meal_type = ?"); values.push(input.mealType); }
  if (input.from) { conditions.push("occurred_at >= ?"); values.push(input.from); } if (input.to) { conditions.push("occurred_at < ?"); values.push(input.to); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return (database.prepare(`SELECT * FROM food_logs ${where} ORDER BY occurred_at DESC, id DESC`).all(...values) as Record<string, unknown>[]).map(foodFromRow);
}
export function getFoodLog(id: number) { const row = database.prepare("SELECT * FROM food_logs WHERE id = ?").get(id) as Record<string, unknown> | undefined; return row ? foodFromRow(row) : null; }
export function createFoodLog(input: Omit<FoodLog, "id" | "createdAt" | "updatedAt">) {
  const result = database.prepare("INSERT INTO food_logs(occurred_at,meal_type,title,description,portion,scene,estimated_kcal,kcal_min,kcal_max,confidence,notes,image_url,attachment_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(input.occurredAt,input.mealType,input.title,input.description,input.portion,input.scene,input.estimatedKcal,input.kcalMin,input.kcalMax,input.confidence,input.notes,input.imageUrl,input.attachmentId); return getFoodLog(Number(result.lastInsertRowid))!;
}
export function updateFoodLog(id: number, input: Record<string, unknown>) { const map: Record<string,string>={occurredAt:"occurred_at",mealType:"meal_type",title:"title",description:"description",portion:"portion",scene:"scene",estimatedKcal:"estimated_kcal",kcalMin:"kcal_min",kcalMax:"kcal_max",confidence:"confidence",notes:"notes",imageUrl:"image_url",attachmentId:"attachment_id"}; const entries=Object.entries(map).filter(([key])=>input[key]!==undefined); if(!entries.length)return getFoodLog(id); database.prepare(`UPDATE food_logs SET ${entries.map(([,column])=>`${column} = ?`).join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([key])=>input[key] as string|number|null),id); return getFoodLog(id); }
export function deleteFoodLog(id:number){return database.prepare("DELETE FROM food_logs WHERE id=?").run(id).changes>0;}

function libraryFromRow(row:Record<string,unknown>):FoodLibraryItem{return{id:Number(row.id),name:String(row.name),brand:String(row.brand),category:row.category as FoodLibraryItem["category"],defaultPortion:String(row.default_portion),referenceType:row.reference_type as FoodLibraryItem["referenceType"],referenceEnergyKj:row.reference_energy_kj===null?null:Number(row.reference_energy_kj),referenceKcal:row.reference_kcal===null?null:Number(row.reference_kcal),servingWeight:row.serving_weight===null?null:Number(row.serving_weight),servingKcal:row.serving_kcal===null?null:Number(row.serving_kcal),dataSource:row.data_source as FoodLibraryItem["dataSource"],notes:String(row.notes),updatedAt:String(row.updated_at)};}
export function searchFoodLibrary(query="",brand=""){const conditions:string[]=[],values:string[]=[];if(query){conditions.push("name LIKE ?");values.push(`%${query}%`);}if(brand){conditions.push("brand = ?");values.push(brand);}const where=conditions.length?`WHERE ${conditions.join(" AND ")}`:"";return(database.prepare(`SELECT * FROM food_library ${where} ORDER BY CASE WHEN brand='' THEN 1 ELSE 0 END, updated_at DESC LIMIT 100`).all(...values) as Record<string,unknown>[]).map(libraryFromRow);}
export function upsertFoodLibraryItem(input:Omit<FoodLibraryItem,"id"|"updatedAt">){database.prepare(`INSERT INTO food_library(name,brand,category,default_portion,reference_type,reference_energy_kj,reference_kcal,serving_weight,serving_kcal,data_source,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(name,brand) DO UPDATE SET category=excluded.category,default_portion=excluded.default_portion,reference_type=excluded.reference_type,reference_energy_kj=excluded.reference_energy_kj,reference_kcal=excluded.reference_kcal,serving_weight=excluded.serving_weight,serving_kcal=excluded.serving_kcal,data_source=excluded.data_source,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`).run(input.name,input.brand,input.category,input.defaultPortion,input.referenceType,input.referenceEnergyKj,input.referenceKcal,input.servingWeight,input.servingKcal,input.dataSource,input.notes);return libraryFromRow(database.prepare("SELECT * FROM food_library WHERE name=? AND brand=?").get(input.name,input.brand) as Record<string,unknown>);}

function drinkFromRow(row:Record<string,unknown>):DrinkLog{return{id:Number(row.id),occurredAt:String(row.occurred_at),name:String(row.name),brand:String(row.brand),drinkType:row.drink_type as DrinkLog["drinkType"],volumeMl:row.volume_ml===null?null:Number(row.volume_ml),sugarLevel:String(row.sugar_level),caffeineMg:row.caffeine_mg===null?null:Number(row.caffeine_mg),estimatedKcal:row.estimated_kcal===null?null:Number(row.estimated_kcal),kcalMin:row.kcal_min===null?null:Number(row.kcal_min),kcalMax:row.kcal_max===null?null:Number(row.kcal_max),confidence:row.confidence as DrinkLog["confidence"],foodLibraryId:row.food_library_id===null?null:Number(row.food_library_id),notes:String(row.notes),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
export function listDrinkLogs(input:{from?:string;to?:string;drinkType?:string}={}){const conditions:string[]=[],values:string[]=[];if(input.from){conditions.push("occurred_at >= ?");values.push(input.from);}if(input.to){conditions.push("occurred_at < ?");values.push(input.to);}if(input.drinkType){conditions.push("drink_type = ?");values.push(input.drinkType);}const where=conditions.length?`WHERE ${conditions.join(" AND ")}`:"";return(database.prepare(`SELECT * FROM drink_logs ${where} ORDER BY occurred_at DESC,id DESC`).all(...values) as Record<string,unknown>[]).map(drinkFromRow);}
export function getDrinkLog(id:number){const row=database.prepare("SELECT * FROM drink_logs WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?drinkFromRow(row):null;}
export function createDrinkLog(input:Omit<DrinkLog,"id"|"createdAt"|"updatedAt">){const result=database.prepare("INSERT INTO drink_logs(occurred_at,name,brand,drink_type,volume_ml,sugar_level,caffeine_mg,estimated_kcal,kcal_min,kcal_max,confidence,food_library_id,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(input.occurredAt,input.name,input.brand,input.drinkType,input.volumeMl,input.sugarLevel,input.caffeineMg,input.estimatedKcal,input.kcalMin,input.kcalMax,input.confidence,input.foodLibraryId,input.notes);return getDrinkLog(Number(result.lastInsertRowid))!;}
export function updateDrinkLog(id:number,input:Record<string,unknown>){const map:Record<string,string>={occurredAt:"occurred_at",name:"name",brand:"brand",drinkType:"drink_type",volumeMl:"volume_ml",sugarLevel:"sugar_level",caffeineMg:"caffeine_mg",estimatedKcal:"estimated_kcal",kcalMin:"kcal_min",kcalMax:"kcal_max",confidence:"confidence",foodLibraryId:"food_library_id",notes:"notes"};const entries=Object.entries(map).filter(([key])=>input[key]!==undefined);if(!entries.length)return getDrinkLog(id);database.prepare(`UPDATE drink_logs SET ${entries.map(([,column])=>`${column}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([key])=>input[key] as string|number|null),id);return getDrinkLog(id);}
export function deleteDrinkLog(id:number){return database.prepare("DELETE FROM drink_logs WHERE id=?").run(id).changes>0;}

function limitFromRow(row:Record<string,unknown>):DrinkLimit{return{id:Number(row.id),name:String(row.name),targetType:String(row.target_type),period:row.period as DrinkLimit["period"],limitValue:Number(row.limit_value),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
export function listDrinkLimits(){return(database.prepare("SELECT * FROM drink_limits ORDER BY enabled DESC,id").all() as Record<string,unknown>[]).map(limitFromRow);}
export function createDrinkLimit(input:Omit<DrinkLimit,"id"|"createdAt"|"updatedAt">){const result=database.prepare("INSERT INTO drink_limits(name,target_type,period,limit_value,enabled) VALUES(?,?,?,?,?)").run(input.name,input.targetType,input.period,input.limitValue,Number(input.enabled));return limitFromRow(database.prepare("SELECT * FROM drink_limits WHERE id=?").get(Number(result.lastInsertRowid)) as Record<string,unknown>);}
export function updateDrinkLimit(id:number,input:Record<string,unknown>){const map:Record<string,string>={name:"name",targetType:"target_type",period:"period",limitValue:"limit_value",enabled:"enabled"};const entries=Object.entries(map).filter(([key])=>input[key]!==undefined);if(!entries.length)return null;database.prepare(`UPDATE drink_limits SET ${entries.map(([,column])=>`${column}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([key])=>key==="enabled"?Number(input[key]):input[key] as string|number),id);const row=database.prepare("SELECT * FROM drink_limits WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?limitFromRow(row):null;}
export function deleteDrinkLimit(id:number){return database.prepare("DELETE FROM drink_limits WHERE id=?").run(id).changes>0;}
export function getNutritionSettings(date:string){const row=database.prepare("SELECT * FROM daily_nutrition_summaries WHERE date=?").get(date) as Record<string,unknown>|undefined;return{restingEnergyKcal:row?.resting_energy_kcal===null||row?.resting_energy_kcal===undefined?null:Number(row.resting_energy_kcal),activeEnergyKcal:row?.active_energy_kcal===null||row?.active_energy_kcal===undefined?null:Number(row.active_energy_kcal),notes:row?String(row.notes):""};}
export function updateNutritionSettings(date:string,input:{restingEnergyKcal:number|null;activeEnergyKcal:number|null;notes:string}){database.prepare("INSERT INTO daily_nutrition_summaries(date,resting_energy_kcal,active_energy_kcal,notes) VALUES(?,?,?,?) ON CONFLICT(date) DO UPDATE SET resting_energy_kcal=excluded.resting_energy_kcal,active_energy_kcal=excluded.active_energy_kcal,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP").run(date,input.restingEnergyKcal,input.activeEnergyKcal,input.notes);}
