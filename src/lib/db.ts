import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { encryptAiApiKey, resolveAiApiKey } from "./ai-secret";
import { ConflictError } from "./errors";
import { maskApiKey } from "./ai-provider";
import { HOME_MODULE_IDS, normalizeHomeModuleOrder, type HomeModuleId } from "./home-modules";
import type { AiModelConfig, AiProvider, AiSettings, CatEvent, CatMeasurement, CatMedication, CatRoutine, CatSymptom, CatVetVisit, ChatMessage, ChatPreferences, ChatRole, ChatSession, DashboardSummary, DrinkLimit, DrinkLog, FoodLibraryItem, FoodLog, HealthRecord, InboxItem, Memory, NotificationDelivery, Pet, PushSubscriptionRecord, Reminder, ReminderOccurrence, Task, Tracker, TrackerEntry, TrackerField, TrackerGoal, TrackerReminder } from "./types";
import type { AiModelConfigInput, AiProviderInput, AiSettingsInput, FoodLibrarySearchOptions, HealthRecordListInput, NewHealthRecord } from "./repositories/types";

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
  api_key_ciphertext: string | null;
  api_key_iv: string | null;
  api_key_auth_tag: string | null;
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
  provider_id: number | null;
  model_config_id: number | null;
  provider_name?: string | null;
  model_display_name?: string | null;
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
  provider_id: number | null;
  model_config_id: number | null;
  created_at: string;
};

type AiProviderRow = { id: number; name: string; provider_type: string; base_url: string; api_key_ciphertext: string | null; api_key_iv: string | null; api_key_auth_tag: string | null; enabled: number; created_at: string; updated_at: string };
type AiModelConfigRow = { id: number; provider_id: number; model_id: string; display_name: string; enabled: number; is_default: number; capabilities: string; created_at: string; updated_at: string };

export type InternalAiSettings = AiSettings & { apiKey: string; providerId: number | null; modelConfigId: number | null };

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
    title TEXT NOT NULL DEFAULT 'New conversation',
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

const hasV7 = database.prepare("SELECT 1 FROM migrations WHERE version = 7").get();
if (!hasV7) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      ALTER TABLE ai_settings ADD COLUMN api_key_ciphertext TEXT;
      ALTER TABLE ai_settings ADD COLUMN api_key_iv TEXT;
      ALTER TABLE ai_settings ADD COLUMN api_key_auth_tag TEXT;
    `);
    const legacy = database.prepare("SELECT api_key FROM ai_settings WHERE id = 1").get() as { api_key?: string } | undefined;
    if (legacy?.api_key) {
      const encrypted = encryptAiApiKey(legacy.api_key);
      database.prepare("UPDATE ai_settings SET api_key_ciphertext=?, api_key_iv=?, api_key_auth_tag=? WHERE id=1")
        .run(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
    }
    database.exec("ALTER TABLE ai_settings DROP COLUMN api_key; INSERT INTO migrations(version) VALUES (7); COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

const hasV8 = database.prepare("SELECT 1 FROM migrations WHERE version = 8").get();
if (!hasV8) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE ai_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
        base_url TEXT NOT NULL,
        api_key_ciphertext TEXT,
        api_key_iv TEXT,
        api_key_auth_tag TEXT,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK ((api_key_ciphertext IS NULL AND api_key_iv IS NULL AND api_key_auth_tag IS NULL) OR (api_key_ciphertext IS NOT NULL AND api_key_iv IS NOT NULL AND api_key_auth_tag IS NOT NULL))
      );
      CREATE TABLE ai_model_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
        model_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
        is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
        capabilities TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider_id, model_id)
      );
      CREATE UNIQUE INDEX idx_ai_model_configs_one_default ON ai_model_configs(is_default) WHERE is_default = 1;
      INSERT INTO ai_providers(name, provider_type, base_url, api_key_ciphertext, api_key_iv, api_key_auth_tag, enabled)
        SELECT provider_name, provider_preset, base_url, api_key_ciphertext, api_key_iv, api_key_auth_tag, enabled FROM ai_settings WHERE id=1;
      INSERT INTO ai_model_configs(provider_id, model_id, display_name, enabled, is_default)
        SELECT p.id, s.model, s.model, s.enabled, 1 FROM ai_settings s CROSS JOIN ai_providers p WHERE s.id=1 ORDER BY p.id LIMIT 1;
      ALTER TABLE chat_sessions ADD COLUMN provider_id INTEGER;
      ALTER TABLE chat_sessions ADD COLUMN model_config_id INTEGER;
      ALTER TABLE chat_messages ADD COLUMN provider_id INTEGER;
      ALTER TABLE chat_messages ADD COLUMN model_config_id INTEGER;
      UPDATE chat_sessions SET provider_id=(SELECT provider_id FROM ai_model_configs WHERE is_default=1), model_config_id=(SELECT id FROM ai_model_configs WHERE is_default=1);
      UPDATE chat_messages SET provider_id=(SELECT provider_id FROM ai_model_configs WHERE is_default=1), model_config_id=(SELECT id FROM ai_model_configs WHERE is_default=1) WHERE role='assistant';
      UPDATE ai_settings SET api_key_ciphertext=NULL, api_key_iv=NULL, api_key_auth_tag=NULL WHERE id=1;
      INSERT INTO migrations(version) VALUES (8);
      COMMIT;
    `);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

const hasV9 = database.prepare("SELECT 1 FROM migrations WHERE version = 9").get();
if (!hasV9) {
  database.exec(`
    CREATE TABLE trackers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '◉', group_name TEXT NOT NULL DEFAULT '日常',
      time_type TEXT NOT NULL DEFAULT 'point' CHECK(time_type IN ('point','range')), quick_capture_enabled INTEGER NOT NULL DEFAULT 1 CHECK(quick_capture_enabled IN (0,1)),
      data_source_type TEXT NOT NULL DEFAULT 'native_tracker' CHECK(data_source_type IN ('native_tracker','linked_source')), source_config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE tracker_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE, name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('number','single_select','multi_select','text','boolean','rating')), required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
      default_value TEXT, options_json TEXT NOT NULL DEFAULT '[]', show_after_quick_capture INTEGER NOT NULL DEFAULT 0 CHECK(show_after_quick_capture IN (0,1)),
      include_in_stats INTEGER NOT NULL DEFAULT 0 CHECK(include_in_stats IN (0,1)), sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE tracker_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE, occurred_at TEXT NOT NULL, end_at TEXT,
      values_json TEXT NOT NULL DEFAULT '{}', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE tracker_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE, operator TEXT NOT NULL CHECK(operator IN ('<=','>=','=')),
      target_value REAL NOT NULL CHECK(target_value > 0), period_type TEXT NOT NULL CHECK(period_type IN ('daily','weekly','monthly','yearly','custom')),
      custom_period TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE tracker_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      reminder_type TEXT NOT NULL CHECK(reminder_type IN ('scheduled','interval')), schedule_rule TEXT NOT NULL DEFAULT '', interval_days INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_trackers_group ON trackers(group_name, updated_at DESC);
    CREATE INDEX idx_tracker_fields_tracker ON tracker_fields(tracker_id, sort_order, id);
    CREATE INDEX idx_tracker_entries_tracker_time ON tracker_entries(tracker_id, occurred_at DESC);
    CREATE INDEX idx_tracker_entries_time ON tracker_entries(occurred_at DESC);
    INSERT INTO migrations(version) VALUES (9);
  `);
}

const hasV10 = database.prepare("SELECT 1 FROM migrations WHERE version = 10").get();
if (!hasV10) {
  database.exec(`
    CREATE TABLE ui_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      home_module_order TEXT NOT NULL DEFAULT '${JSON.stringify(HOME_MODULE_IDS)}',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO ui_preferences(id) VALUES (1);
    INSERT INTO migrations(version) VALUES (10);
  `);
}

const hasV11 = database.prepare("SELECT 1 FROM migrations WHERE version = 11").get();
if (!hasV11) {
  database.exec(`
    ALTER TABLE trackers ADD COLUMN icon_type TEXT NOT NULL DEFAULT 'default' CHECK(icon_type IN ('default','image'));
    ALTER TABLE trackers ADD COLUMN icon_value TEXT NOT NULL DEFAULT '';
    ALTER TABLE trackers ADD COLUMN stats_config TEXT NOT NULL DEFAULT '{}';
    UPDATE trackers SET time_type='point';
    ALTER TABLE tracker_fields ADD COLUMN field_key TEXT;
    ALTER TABLE tracker_fields ADD COLUMN unit TEXT NOT NULL DEFAULT '';
    ALTER TABLE tracker_fields ADD COLUMN precision INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tracker_fields ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE tracker_fields ADD COLUMN archived_at TEXT;
    UPDATE tracker_fields SET field_key='field_' || id WHERE field_key IS NULL OR field_key='';
    CREATE UNIQUE INDEX idx_tracker_fields_key ON tracker_fields(tracker_id,field_key);
    INSERT INTO migrations(version) VALUES (11);
  `);
}

const hasV12 = database.prepare("SELECT 1 FROM migrations WHERE version = 12").get();
if (!hasV12) {
  database.exec(`
    ALTER TABLE food_library ADD COLUMN archived_at TEXT;
    CREATE INDEX idx_food_library_active ON food_library(archived_at, updated_at DESC);
    INSERT INTO migrations(version) VALUES (12);
  `);
}

const hasV13 = database.prepare("SELECT 1 FROM migrations WHERE version = 13").get();
if (!hasV13) {
  database.exec(`
    CREATE TABLE pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,avatar_url TEXT NOT NULL DEFAULT '',sex TEXT,birthday TEXT,adoption_date TEXT,
      notes TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE cat_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,pet_id INTEGER REFERENCES pets(id) ON DELETE RESTRICT,event_type TEXT NOT NULL CHECK(event_type IN ('deworming','grooming','care','note','cleaning','shared_note')),
      occurred_at TEXT NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',source_type TEXT,source_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE cat_symptoms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,occurred_at TEXT NOT NULL,title TEXT NOT NULL,severity TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '',body_area TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE vet_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,occurred_at TEXT NOT NULL,clinic TEXT NOT NULL DEFAULT '',doctor TEXT NOT NULL DEFAULT '',reason TEXT NOT NULL,symptoms TEXT NOT NULL DEFAULT '',diagnosis TEXT NOT NULL DEFAULT '',examinations TEXT NOT NULL DEFAULT '',treatment TEXT NOT NULL DEFAULT '',prescriptions TEXT NOT NULL DEFAULT '',cost REAL,follow_up_at TEXT,notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE cat_medications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,name TEXT NOT NULL,dose TEXT NOT NULL DEFAULT '',unit TEXT NOT NULL DEFAULT '',frequency_text TEXT NOT NULL DEFAULT '',started_at TEXT NOT NULL,ended_at TEXT,reason TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE cat_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,occurred_at TEXT NOT NULL,measurement_type TEXT NOT NULL,value REAL NOT NULL,unit TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,target_type TEXT NOT NULL CHECK(target_type IN ('cat','cat_household','tracker')),target_id INTEGER,source_type TEXT,source_id INTEGER,
      schedule_type TEXT NOT NULL CHECK(schedule_type IN ('one_time','interval','course')),starts_at TEXT NOT NULL,next_due_at TEXT,interval_value INTEGER,interval_unit TEXT,times_of_day TEXT NOT NULL DEFAULT '[]',ends_at TEXT,timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),last_completed_at TEXT,snoozed_until TEXT,last_notified_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE reminder_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,action TEXT NOT NULL CHECK(action IN ('completed','skipped')),scheduled_for TEXT NOT NULL,acted_at TEXT NOT NULL,created_event_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_pets_active ON pets(is_active,updated_at DESC);
    CREATE INDEX idx_cat_events_pet_time ON cat_events(pet_id,occurred_at DESC);
    CREATE INDEX idx_cat_symptoms_pet_time ON cat_symptoms(pet_id,occurred_at DESC);
    CREATE INDEX idx_vet_visits_pet_time ON vet_visits(pet_id,occurred_at DESC);
    CREATE INDEX idx_cat_medications_pet_time ON cat_medications(pet_id,started_at DESC);
    CREATE INDEX idx_cat_measurements_pet_time ON cat_measurements(pet_id,occurred_at DESC);
    CREATE INDEX idx_reminders_due ON reminders(is_active,next_due_at);
    INSERT INTO migrations(version) VALUES (13);
  `);
}

const hasV14 = database.prepare("SELECT 1 FROM migrations WHERE version = 14").get();
if (!hasV14) {
  database.exec(`
    ALTER TABLE reminders ADD COLUMN note TEXT NOT NULL DEFAULT '';
    ALTER TABLE reminders ADD COLUMN lead_time_minutes INTEGER NOT NULL DEFAULT 0 CHECK(lead_time_minutes BETWEEN 0 AND 525600);
    ALTER TABLE reminders ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','sent','cancelled','failed','completed'));
    ALTER TABLE reminders ADD COLUMN sent_at TEXT;
    ALTER TABLE reminders ADD COLUMN cancelled_at TEXT;
    UPDATE reminders SET status=CASE WHEN is_active=0 AND last_completed_at IS NOT NULL THEN 'completed' WHEN is_active=0 THEN 'cancelled' WHEN last_notified_at IS NOT NULL THEN 'sent' ELSE 'scheduled' END;
    CREATE TABLE cat_routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL CHECK(scope IN ('cat','household')),pet_id INTEGER REFERENCES pets(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,interval_value INTEGER NOT NULL CHECK(interval_value>0),interval_unit TEXT NOT NULL CHECK(interval_unit IN ('day','week','month')),
      first_due_at TEXT NOT NULL,last_completed_at TEXT,next_due_at TEXT NOT NULL,reminder_lead_minutes INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),reminder_id INTEGER UNIQUE REFERENCES reminders(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK((scope='cat' AND pet_id IS NOT NULL) OR (scope='household' AND pet_id IS NULL))
    );
    CREATE TABLE notification_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,reminder_id INTEGER REFERENCES reminders(id) ON DELETE SET NULL,title TEXT NOT NULL,source_type TEXT,source_id INTEGER,
      target_type TEXT NOT NULL,target_id INTEGER,scheduled_at TEXT NOT NULL,sent_at TEXT,status TEXT NOT NULL CHECK(status IN ('sent','failed','cancelled')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO cat_routines(scope,pet_id,title,interval_value,interval_unit,first_due_at,last_completed_at,next_due_at,reminder_lead_minutes,notes,enabled,reminder_id)
      SELECT CASE WHEN target_type='cat' THEN 'cat' ELSE 'household' END,target_id,title,interval_value,interval_unit,starts_at,last_completed_at,COALESCE(next_due_at,starts_at),lead_time_minutes,note,is_active,id
      FROM reminders WHERE target_type IN ('cat','cat_household') AND schedule_type='interval' AND interval_value IS NOT NULL AND interval_unit IN ('day','week','month');
    UPDATE reminders SET source_type='cat_routine',source_id=(SELECT id FROM cat_routines WHERE reminder_id=reminders.id),status=CASE WHEN is_active=1 THEN 'scheduled' ELSE 'cancelled' END WHERE id IN (SELECT reminder_id FROM cat_routines) AND (source_type IS NULL OR source_type='');
    CREATE INDEX idx_cat_routines_scope ON cat_routines(scope,enabled,next_due_at);
    CREATE INDEX idx_cat_routines_pet ON cat_routines(pet_id,enabled,next_due_at);
    CREATE INDEX idx_notification_deliveries_time ON notification_deliveries(created_at DESC);
    CREATE INDEX idx_reminders_status_due ON reminders(status,is_active,next_due_at);
    INSERT INTO migrations(version) VALUES (14);
  `);
}

const hasV15 = database.prepare("SELECT 1 FROM migrations WHERE version = 15").get();
if (!hasV15) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS health_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'local',
        occurred_at TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('symptom','medication','visit','test','condition','treatment','measurement','note')),
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved')),
        started_at TEXT,
        ended_at TEXT,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK(started_at IS NULL OR ended_at IS NULL OR ended_at >= started_at)
      );
      CREATE INDEX IF NOT EXISTS idx_health_records_user_occurred ON health_records(user_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_health_records_active ON health_records(user_id, occurred_at DESC) WHERE status='active';
      INSERT OR IGNORE INTO migrations(version) VALUES (15);
      COMMIT;
    `);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

const hasV16 = database.prepare("SELECT 1 FROM migrations WHERE version = 16").get();
if (!hasV16) {
  database.exec(`
    ALTER TABLE cat_events ADD COLUMN occurred_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(occurred_has_explicit_time IN (0,1));
    ALTER TABLE cat_symptoms ADD COLUMN occurred_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(occurred_has_explicit_time IN (0,1));
    ALTER TABLE vet_visits ADD COLUMN occurred_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(occurred_has_explicit_time IN (0,1));
    ALTER TABLE cat_measurements ADD COLUMN occurred_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(occurred_has_explicit_time IN (0,1));
    ALTER TABLE cat_medications ADD COLUMN started_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(started_has_explicit_time IN (0,1));
    ALTER TABLE cat_medications ADD COLUMN ended_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(ended_has_explicit_time IN (0,1));
    ALTER TABLE health_records ADD COLUMN occurred_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(occurred_has_explicit_time IN (0,1));
    ALTER TABLE health_records ADD COLUMN started_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(started_has_explicit_time IN (0,1));
    ALTER TABLE health_records ADD COLUMN ended_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(ended_has_explicit_time IN (0,1));
    ALTER TABLE reminders ADD COLUMN due_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(due_has_explicit_time IN (0,1));
    ALTER TABLE notification_deliveries ADD COLUMN scheduled_has_explicit_time INTEGER NOT NULL DEFAULT 1 CHECK(scheduled_has_explicit_time IN (0,1));
    INSERT INTO migrations(version) VALUES (16);
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
    providerId: row.provider_id,
    modelConfigId: row.model_config_id,
    providerName: row.provider_name ?? null,
    modelDisplayName: row.model_display_name ?? null,
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
    providerId: row.provider_id,
    modelConfigId: row.model_config_id,
    createdAt: row.created_at,
  };
}

function aiModelFromRow(row: AiModelConfigRow): AiModelConfig {
  let capabilities: Record<string, unknown> = {};
  try { capabilities = JSON.parse(row.capabilities) as Record<string, unknown>; } catch { capabilities = {}; }
  return { id: row.id, providerId: row.provider_id, modelId: row.model_id, displayName: row.display_name, enabled: Boolean(row.enabled), isDefault: Boolean(row.is_default), capabilities, createdAt: row.created_at, updatedAt: row.updated_at };
}

function aiProviderFromRow(row: AiProviderRow, models: AiModelConfig[] = []): AiProvider {
  const apiKey = resolveAiApiKey({ ciphertext: row.api_key_ciphertext, iv: row.api_key_iv, authTag: row.api_key_auth_tag });
  return { id: row.id, name: row.name, providerType: row.provider_type, baseUrl: row.base_url, enabled: Boolean(row.enabled), hasApiKey: Boolean(apiKey), maskedApiKey: maskApiKey(apiKey), models, createdAt: row.created_at, updatedAt: row.updated_at };
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

export function getUiPreferences() {
  const row = database.prepare("SELECT home_module_order, updated_at FROM ui_preferences WHERE id=1").get() as { home_module_order: string; updated_at: string };
  let order: unknown = [];
  try { order = JSON.parse(row.home_module_order); } catch { order = []; }
  return { homeModuleOrder: normalizeHomeModuleOrder(order), updatedAt: row.updated_at };
}

export function updateHomeModuleOrder(order: HomeModuleId[]) {
  database.prepare("UPDATE ui_preferences SET home_module_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=1").run(JSON.stringify(normalizeHomeModuleOrder(order)));
  return getUiPreferences();
}

export function getAiSettings(): InternalAiSettings {
  return getAiRuntimeSettings(null);
}

export function getAiRuntimeSettings(modelConfigId: number | null = null): InternalAiSettings {
  const row = database.prepare("SELECT * FROM ai_settings WHERE id = 1").get() as AiSettingsRow;
  const model = (modelConfigId
    ? database.prepare("SELECT * FROM ai_model_configs WHERE id=?").get(modelConfigId)
    : database.prepare("SELECT * FROM ai_model_configs WHERE is_default=1").get()) as AiModelConfigRow | undefined;
  const provider = model ? database.prepare("SELECT * FROM ai_providers WHERE id=?").get(model.provider_id) as AiProviderRow | undefined : undefined;
  const apiKey = provider ? resolveAiApiKey({ ciphertext: provider.api_key_ciphertext, iv: provider.api_key_iv, authTag: provider.api_key_auth_tag }) : "";
  return {
    providerPreset: provider?.provider_type ?? row.provider_preset,
    providerName: provider?.name ?? row.provider_name,
    baseUrl: provider?.base_url ?? row.base_url,
    apiKey,
    hasApiKey: Boolean(apiKey),
    maskedApiKey: null,
    model: model?.model_id ?? row.model,
    enabled: Boolean(provider?.enabled && model?.enabled),
    providerId: provider?.id ?? null,
    modelConfigId: model?.id ?? null,
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
  database.prepare(`UPDATE ai_settings SET
    temperature = ?, system_prompt = ?, response_length = ?, initiative = ?, allow_suggestions = ?, allow_teasing = ?,
    include_tasks = ?, include_memories = ?, allow_write_actions = ?,
    user_display_name = ?, user_avatar_type = ?, user_avatar_value = ?, assistant_display_name = ?, assistant_avatar_type = ?, assistant_avatar_value = ?,
    show_user_name = ?, show_assistant_name = ?, show_avatars = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1`).run(
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

export function listAiProviders() {
  const models = (database.prepare("SELECT * FROM ai_model_configs ORDER BY is_default DESC, display_name, id").all() as AiModelConfigRow[]).map(aiModelFromRow);
  return (database.prepare("SELECT * FROM ai_providers ORDER BY enabled DESC, updated_at DESC, id").all() as AiProviderRow[])
    .map((row) => aiProviderFromRow(row, models.filter((model) => model.providerId === row.id)));
}

export function getAiProvider(id: number) {
  const row = database.prepare("SELECT * FROM ai_providers WHERE id=?").get(id) as AiProviderRow | undefined;
  if (!row) return null;
  const apiKey = resolveAiApiKey({ ciphertext: row.api_key_ciphertext, iv: row.api_key_iv, authTag: row.api_key_auth_tag });
  return { id: row.id, name: row.name, providerType: row.provider_type, baseUrl: row.base_url, enabled: Boolean(row.enabled), apiKey, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function createAiProvider(input: AiProviderInput) {
  const encrypted = input.apiKey ? encryptAiApiKey(input.apiKey) : { ciphertext: null, iv: null, authTag: null };
  const result = database.prepare("INSERT INTO ai_providers(name,provider_type,base_url,api_key_ciphertext,api_key_iv,api_key_auth_tag,enabled) VALUES(?,?,?,?,?,?,?)")
    .run(input.name, input.providerType, input.baseUrl, encrypted.ciphertext, encrypted.iv, encrypted.authTag, Number(input.enabled));
  return listAiProviders().find((provider) => provider.id === Number(result.lastInsertRowid))!;
}

export function updateAiProvider(id: number, input: AiProviderInput) {
  const row = database.prepare("SELECT * FROM ai_providers WHERE id=?").get(id) as AiProviderRow | undefined;
  if (!row) return null;
  let encrypted = { ciphertext: row.api_key_ciphertext, iv: row.api_key_iv, authTag: row.api_key_auth_tag };
  if (input.clearApiKey) encrypted = { ciphertext: null, iv: null, authTag: null };
  else if (input.apiKey !== undefined) encrypted = encryptAiApiKey(input.apiKey);
  if (!input.enabled && database.prepare("SELECT 1 FROM ai_model_configs WHERE provider_id=? AND is_default=1").get(id)) throw new ConflictError("这个 Provider 正在承载全局默认模型，请先更换默认模型");
  database.prepare("UPDATE ai_providers SET name=?,provider_type=?,base_url=?,api_key_ciphertext=?,api_key_iv=?,api_key_auth_tag=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(input.name, input.providerType, input.baseUrl, encrypted.ciphertext, encrypted.iv, encrypted.authTag, Number(input.enabled), id);
  return listAiProviders().find((provider) => provider.id === id) ?? null;
}

function promoteDefaultModel() {
  if (database.prepare("SELECT 1 FROM ai_model_configs WHERE is_default=1").get()) return;
  const replacement = database.prepare("SELECT m.id FROM ai_model_configs m JOIN ai_providers p ON p.id=m.provider_id WHERE m.enabled=1 AND p.enabled=1 ORDER BY m.id LIMIT 1").get() as { id: number } | undefined;
  if (replacement) database.prepare("UPDATE ai_model_configs SET is_default=1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(replacement.id);
}

export function deleteAiProvider(id: number) {
  if (!database.prepare("SELECT 1 FROM ai_providers WHERE id=?").get(id)) return false;
  if (database.prepare("SELECT 1 FROM ai_model_configs WHERE provider_id=? AND is_default=1").get(id)) throw new ConflictError("这个 Provider 正在承载全局默认模型，请先把另一个模型设为默认");
  const usage = database.prepare("SELECT (SELECT COUNT(*) FROM chat_sessions WHERE provider_id=?) + (SELECT COUNT(*) FROM chat_messages WHERE provider_id=?) count").get(id, id) as { count: number };
  if (usage.count) throw new ConflictError(`这个 Provider 仍被 ${usage.count} 条会话或消息使用，不能删除；可以先停用`);
  database.prepare("DELETE FROM ai_providers WHERE id=?").run(id);
  promoteDefaultModel();
  return true;
}

export function createAiModelConfig(providerId: number, input: AiModelConfigInput) {
  const provider = database.prepare("SELECT enabled FROM ai_providers WHERE id=?").get(providerId) as { enabled: number } | undefined;
  if (!provider) throw new ConflictError("Provider 不存在");
  const hasDefault = Boolean(database.prepare("SELECT 1 FROM ai_model_configs WHERE is_default=1").get());
  const makeDefault = input.isDefault || (!hasDefault && input.enabled && Boolean(provider.enabled));
  database.exec("BEGIN IMMEDIATE");
  try {
    if (makeDefault) database.prepare("UPDATE ai_model_configs SET is_default=0").run();
    const result = database.prepare("INSERT INTO ai_model_configs(provider_id,model_id,display_name,enabled,is_default,capabilities) VALUES(?,?,?,?,?,?)")
      .run(providerId, input.modelId, input.displayName, Number(input.enabled), Number(makeDefault), JSON.stringify(input.capabilities));
    database.exec("COMMIT");
    return aiModelFromRow(database.prepare("SELECT * FROM ai_model_configs WHERE id=?").get(Number(result.lastInsertRowid)) as AiModelConfigRow);
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

export function updateAiModelConfig(id: number, input: AiModelConfigInput) {
  const current = database.prepare("SELECT * FROM ai_model_configs WHERE id=?").get(id) as AiModelConfigRow | undefined;
  if (!current) return null;
  if (current.is_default && (!input.isDefault || !input.enabled)) throw new ConflictError("请先把另一个已启用模型设为全局默认，再停用或取消当前默认模型");
  const provider = database.prepare("SELECT enabled FROM ai_providers WHERE id=?").get(current.provider_id) as { enabled: number };
  if (input.isDefault && (!input.enabled || !provider.enabled)) throw new ConflictError("只有已启用 Provider 下的已启用模型可以设为默认");
  database.exec("BEGIN IMMEDIATE");
  try {
    if (input.isDefault) database.prepare("UPDATE ai_model_configs SET is_default=0 WHERE id<>?").run(id);
    database.prepare("UPDATE ai_model_configs SET model_id=?,display_name=?,enabled=?,is_default=?,capabilities=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(input.modelId, input.displayName, Number(input.enabled), Number(input.isDefault), JSON.stringify(input.capabilities), id);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return aiModelFromRow(database.prepare("SELECT * FROM ai_model_configs WHERE id=?").get(id) as AiModelConfigRow);
}

export function deleteAiModelConfig(id: number) {
  const model = database.prepare("SELECT is_default FROM ai_model_configs WHERE id=?").get(id) as { is_default: number } | undefined;
  if (!model) return false;
  if (model.is_default) throw new ConflictError("这是全局默认模型，请先把另一个模型设为默认");
  const usage = database.prepare("SELECT (SELECT COUNT(*) FROM chat_sessions WHERE model_config_id=?) + (SELECT COUNT(*) FROM chat_messages WHERE model_config_id=?) count").get(id, id) as { count: number };
  if (usage.count) throw new ConflictError(`这个模型仍被 ${usage.count} 条会话或消息使用，不能删除；可以先停用`);
  database.prepare("DELETE FROM ai_model_configs WHERE id=?").run(id);
  promoteDefaultModel();
  return true;
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
    (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) AS message_count,
    p.name AS provider_name, m.display_name AS model_display_name
    FROM chat_sessions s LEFT JOIN ai_providers p ON p.id=s.provider_id LEFT JOIN ai_model_configs m ON m.id=s.model_config_id
    ORDER BY s.updated_at DESC, s.id DESC`).all() as ChatSessionRow[];
  return rows.map(chatSessionFromRow);
}

export function getChatSession(id: number) {
  const row = database.prepare(`SELECT s.*,
    COALESCE((SELECT content FROM chat_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1), '') AS preview,
    (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) AS message_count,
    p.name AS provider_name, m.display_name AS model_display_name
    FROM chat_sessions s LEFT JOIN ai_providers p ON p.id=s.provider_id LEFT JOIN ai_model_configs m ON m.id=s.model_config_id
    WHERE s.id = ?`).get(id) as ChatSessionRow | undefined;
  return row ? chatSessionFromRow(row) : null;
}

export function createChatSession(title = "New conversation", requestedModelConfigId?: number | null) {
  const model = (requestedModelConfigId
    ? database.prepare("SELECT * FROM ai_model_configs WHERE id=?").get(requestedModelConfigId)
    : database.prepare("SELECT * FROM ai_model_configs WHERE is_default=1").get()) as AiModelConfigRow | undefined;
  if (requestedModelConfigId && (!model || !model.enabled)) throw new ConflictError("选择的模型不存在或已停用");
  if (model) {
    const provider = database.prepare("SELECT enabled FROM ai_providers WHERE id=?").get(model.provider_id) as { enabled: number } | undefined;
    if (!provider?.enabled) throw new ConflictError("这个模型所属的 Provider 已停用");
  }
  const result = database.prepare("INSERT INTO chat_sessions(title,provider_id,model_config_id,model) VALUES (?,?,?,?)").run(title, model?.provider_id ?? null, model?.id ?? null, model?.model_id ?? null);
  return getChatSession(Number(result.lastInsertRowid))!;
}

export function updateChatSession(id: number, input: { title?: string; modelConfigId?: number | null }) {
  if (input.title !== undefined) database.prepare("UPDATE chat_sessions SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(input.title, id);
  if (input.modelConfigId !== undefined) {
    const model = input.modelConfigId ? database.prepare("SELECT * FROM ai_model_configs WHERE id=?").get(input.modelConfigId) as AiModelConfigRow | undefined : undefined;
    if (!model || !model.enabled) throw new ConflictError("选择的模型不存在或已停用");
    const provider = database.prepare("SELECT enabled FROM ai_providers WHERE id=?").get(model.provider_id) as { enabled: number } | undefined;
    if (!provider?.enabled) throw new ConflictError("这个模型所属的 Provider 已停用");
    database.prepare("UPDATE chat_sessions SET provider_id=?,model_config_id=?,model=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(model.provider_id, model.id, model.model_id, id);
  }
  return getChatSession(id);
}

export function deleteChatSession(id: number) {
  return database.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id).changes > 0;
}

export function listChatMessages(sessionId: number) {
  return (database.prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id").all(sessionId) as ChatMessageRow[]).map(chatMessageFromRow);
}

export function addChatMessage(sessionId: number, role: ChatRole, content: string, model: string | null = null, providerId: number | null = null, modelConfigId: number | null = null) {
  const result = database.prepare("INSERT INTO chat_messages(session_id, role, content, model, provider_id, model_config_id) VALUES (?, ?, ?, ?, ?, ?)").run(sessionId, role, content, model, providerId, modelConfigId);
  database.prepare("UPDATE chat_sessions SET model = COALESCE(?, model), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(model, sessionId);
  const row = database.prepare("SELECT * FROM chat_messages WHERE id = ?").get(Number(result.lastInsertRowid)) as ChatMessageRow;
  return chatMessageFromRow(row);
}

export function autoTitleChatSession(id: number, content: string) {
  const session = getChatSession(id);
  if (!session || session.messageCount > 1 || !["新对话", "New conversation"].includes(session.title)) return;
  const compact = content.replace(/\s+/g, " ").trim();
  const title = compact.length > 28 ? `${compact.slice(0, 28)}…` : compact;
  database.prepare("UPDATE chat_sessions SET title = ? WHERE id = ?").run(title, id);
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

function libraryFromRow(row:Record<string,unknown>):FoodLibraryItem{return{id:Number(row.id),name:String(row.name),brand:String(row.brand),category:row.category as FoodLibraryItem["category"],defaultPortion:String(row.default_portion),referenceType:row.reference_type as FoodLibraryItem["referenceType"],referenceEnergyKj:row.reference_energy_kj===null?null:Number(row.reference_energy_kj),referenceKcal:row.reference_kcal===null?null:Number(row.reference_kcal),servingWeight:row.serving_weight===null?null:Number(row.serving_weight),servingKcal:row.serving_kcal===null?null:Number(row.serving_kcal),dataSource:row.data_source as FoodLibraryItem["dataSource"],notes:String(row.notes),archivedAt:row.archived_at?String(row.archived_at):null,updatedAt:String(row.updated_at)};}
export function searchFoodLibrary(query="",brand="",options:FoodLibrarySearchOptions={}){const conditions:string[]=["archived_at IS NULL"],values:string[]=[];const keyword=query.trim();if(keyword){conditions.push("(name LIKE ? OR brand LIKE ?)");values.push(`%${keyword}%`,`%${keyword}%`);}if(options.name){conditions.push("name LIKE ?");values.push(`%${options.name}%`);}if(brand){conditions.push("brand = ?");values.push(brand);}if(options.category){conditions.push("category = ?");values.push(options.category);}const limit=Math.min(Math.max(options.limit??100,1),100);return(database.prepare(`SELECT * FROM food_library WHERE ${conditions.join(" AND ")} ORDER BY CASE WHEN brand='' THEN 1 ELSE 0 END, updated_at DESC LIMIT ?`).all(...values,limit) as Record<string,unknown>[]).map(libraryFromRow);}
export function getFoodLibraryItem(id:number){const row=database.prepare("SELECT * FROM food_library WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?libraryFromRow(row):null;}
export function upsertFoodLibraryItem(input:Omit<FoodLibraryItem,"id"|"archivedAt"|"updatedAt">){database.prepare(`INSERT INTO food_library(name,brand,category,default_portion,reference_type,reference_energy_kj,reference_kcal,serving_weight,serving_kcal,data_source,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(name,brand) DO UPDATE SET category=excluded.category,default_portion=excluded.default_portion,reference_type=excluded.reference_type,reference_energy_kj=excluded.reference_energy_kj,reference_kcal=excluded.reference_kcal,serving_weight=excluded.serving_weight,serving_kcal=excluded.serving_kcal,data_source=excluded.data_source,notes=excluded.notes,archived_at=NULL,updated_at=CURRENT_TIMESTAMP`).run(input.name,input.brand,input.category,input.defaultPortion,input.referenceType,input.referenceEnergyKj,input.referenceKcal,input.servingWeight,input.servingKcal,input.dataSource,input.notes);return libraryFromRow(database.prepare("SELECT * FROM food_library WHERE name=? AND brand=?").get(input.name,input.brand) as Record<string,unknown>);}
export function updateFoodLibraryItem(id:number,input:Omit<FoodLibraryItem,"id"|"archivedAt"|"updatedAt">){const result=database.prepare(`UPDATE food_library SET name=?,brand=?,category=?,default_portion=?,reference_type=?,reference_energy_kj=?,reference_kcal=?,serving_weight=?,serving_kcal=?,data_source=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived_at IS NULL`).run(input.name,input.brand,input.category,input.defaultPortion,input.referenceType,input.referenceEnergyKj,input.referenceKcal,input.servingWeight,input.servingKcal,input.dataSource,input.notes,id);return result.changes?getFoodLibraryItem(id):null;}
export function removeFoodLibraryItem(id:number){if(!getFoodLibraryItem(id))return null;const references=Number((database.prepare("SELECT COUNT(*) AS count FROM drink_logs WHERE food_library_id=?").get(id) as {count:number}).count);if(references>0){database.prepare("UPDATE food_library SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);return{id,action:"archived" as const};}database.prepare("DELETE FROM food_library WHERE id=?").run(id);return{id,action:"deleted" as const};}
function healthDetailsFromRow(value: unknown): HealthRecord["details"] { let parsed: unknown; try { parsed = typeof value === "string" ? JSON.parse(value) : value; } catch { return {}; } if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}; return Object.fromEntries(Object.entries(parsed).filter(([, item]) => item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean")); }
function healthRecordFromRow(row:Record<string,unknown>):HealthRecord{return{id:Number(row.id),occurredAt:String(row.occurred_at),occurredHasExplicitTime:row.occurred_has_explicit_time===undefined?true:Boolean(row.occurred_has_explicit_time),type:row.type as HealthRecord["type"],title:String(row.title),summary:String(row.summary??""),status:row.status as HealthRecord["status"],startedAt:row.started_at?String(row.started_at):null,startedHasExplicitTime:row.started_has_explicit_time===undefined?true:Boolean(row.started_has_explicit_time),endedAt:row.ended_at?String(row.ended_at):null,endedHasExplicitTime:row.ended_has_explicit_time===undefined?true:Boolean(row.ended_has_explicit_time),details:healthDetailsFromRow(row.details),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
export function listHealthRecords(input:HealthRecordListInput={}){const conditions:string[]=["user_id = 'local'"],values:(string|number)[]=[];if(input.status){conditions.push("status = ?");values.push(input.status);}if(input.type){conditions.push("type = ?");values.push(input.type);}if(input.from){conditions.push("occurred_at >= ?");values.push(input.from);}if(input.to){conditions.push("occurred_at < ?");values.push(input.to);}const limit=Math.min(Math.max(input.limit??100,1),100);return(database.prepare(`SELECT * FROM health_records WHERE ${conditions.join(" AND ")} ORDER BY occurred_at DESC,id DESC LIMIT ?`).all(...values,limit) as Record<string,unknown>[]).map(healthRecordFromRow);}
export function getHealthRecord(id:number){const row=database.prepare("SELECT * FROM health_records WHERE id=? AND user_id='local'").get(id) as Record<string,unknown>|undefined;return row?healthRecordFromRow(row):null;}
export function createHealthRecord(input:NewHealthRecord){const result=database.prepare("INSERT INTO health_records(user_id,occurred_at,occurred_has_explicit_time,type,title,summary,status,started_at,started_has_explicit_time,ended_at,ended_has_explicit_time,details) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run("local",input.occurredAt,Number(input.occurredHasExplicitTime),input.type,input.title,input.summary,input.status,input.startedAt,Number(input.startedHasExplicitTime),input.endedAt,Number(input.endedHasExplicitTime),JSON.stringify(input.details));return getHealthRecord(Number(result.lastInsertRowid))!;}
export function updateHealthRecord(id:number,input:Record<string,unknown>){const map:Record<string,string>={occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",type:"type",title:"title",summary:"summary",status:"status",startedAt:"started_at",startedHasExplicitTime:"started_has_explicit_time",endedAt:"ended_at",endedHasExplicitTime:"ended_has_explicit_time",details:"details"};const entries=Object.entries(map).filter(([key])=>input[key]!==undefined);if(!entries.length)return getHealthRecord(id);const value=(key:string)=>key==="details"?JSON.stringify(input[key]):key.endsWith("HasExplicitTime")?Number(input[key]):input[key] as string|null;const result=database.prepare(`UPDATE health_records SET ${entries.map(([,column])=>`${column}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id='local'`).run(...entries.map(([key])=>value(key)),id);return result.changes?getHealthRecord(id):null;}
export function deleteHealthRecord(id:number){return database.prepare("DELETE FROM health_records WHERE id=? AND user_id='local'").run(id).changes>0;}

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

function jsonValue<T>(value: unknown, fallback: T): T { try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function trackerFromRow(row:Record<string,unknown>):Tracker{return{id:Number(row.id),name:String(row.name),icon:String(row.icon),iconType:(row.icon_type??"default") as Tracker["iconType"],iconValue:String(row.icon_value??""),groupName:String(row.group_name),timeType:row.time_type as Tracker["timeType"],quickCaptureEnabled:Boolean(row.quick_capture_enabled),dataSourceType:row.data_source_type as Tracker["dataSourceType"],sourceConfig:jsonValue(row.source_config,{}),statsConfig:jsonValue(row.stats_config,{}),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
export function listTrackers(){return(database.prepare("SELECT * FROM trackers ORDER BY group_name,name,id").all() as Record<string,unknown>[]).map(trackerFromRow);}
export function getTracker(id:number){const row=database.prepare("SELECT * FROM trackers WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?trackerFromRow(row):null;}
export function createTracker(input:Omit<Tracker,"id"|"createdAt"|"updatedAt">){const result=database.prepare("INSERT INTO trackers(name,icon,icon_type,icon_value,group_name,time_type,quick_capture_enabled,data_source_type,source_config,stats_config) VALUES(?,?,?,?,?,?,?,?,?,?)").run(input.name,input.icon,input.iconType,input.iconValue,input.groupName,"point",Number(input.quickCaptureEnabled),input.dataSourceType,JSON.stringify(input.sourceConfig),JSON.stringify(input.statsConfig));return getTracker(Number(result.lastInsertRowid))!;}
export function updateTracker(id:number,input:Record<string,unknown>){const map:Record<string,string>={name:"name",icon:"icon",iconType:"icon_type",iconValue:"icon_value",groupName:"group_name",quickCaptureEnabled:"quick_capture_enabled",dataSourceType:"data_source_type",sourceConfig:"source_config",statsConfig:"stats_config"};const entries=Object.entries(map).filter(([key])=>input[key]!==undefined);if(!entries.length)return getTracker(id);const value=(key:string)=>key==="quickCaptureEnabled"?Number(input[key]):key==="sourceConfig"||key==="statsConfig"?JSON.stringify(input[key]):input[key] as string|number;database.prepare(`UPDATE trackers SET ${entries.map(([,column])=>`${column}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([key])=>value(key)),id);return getTracker(id);}
export function deleteTracker(id:number){return database.prepare("DELETE FROM trackers WHERE id=?").run(id).changes>0;}

function trackerFieldFromRow(row:Record<string,unknown>):TrackerField{return{id:Number(row.id),trackerId:Number(row.tracker_id),key:String(row.field_key??`field_${row.id}`),name:String(row.name),type:row.type as TrackerField["type"],required:Boolean(row.required),defaultValue:row.default_value===null?null:jsonValue(row.default_value,null),options:jsonValue(row.options_json,[]),showAfterQuickCapture:Boolean(row.show_after_quick_capture),includeInStats:Boolean(row.include_in_stats),sortOrder:Number(row.sort_order),unit:String(row.unit??""),precision:Number(row.precision??0),config:jsonValue(row.config_json,{}),archivedAt:row.archived_at?String(row.archived_at):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
export function listTrackerFields(trackerId:number){return(database.prepare("SELECT * FROM tracker_fields WHERE tracker_id=? ORDER BY sort_order,id").all(trackerId) as Record<string,unknown>[]).map(trackerFieldFromRow);}
export function createTrackerField(input:Omit<TrackerField,"id"|"createdAt"|"updatedAt">){const result=database.prepare("INSERT INTO tracker_fields(tracker_id,field_key,name,type,required,default_value,options_json,show_after_quick_capture,include_in_stats,sort_order,unit,precision,config_json,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(input.trackerId,input.key,input.name,input.type,Number(input.required),input.defaultValue===null?null:JSON.stringify(input.defaultValue),JSON.stringify(input.options),Number(input.showAfterQuickCapture),Number(input.includeInStats),input.sortOrder,input.unit,input.precision,JSON.stringify(input.config),input.archivedAt);return trackerFieldFromRow(database.prepare("SELECT * FROM tracker_fields WHERE id=?").get(Number(result.lastInsertRowid)) as Record<string,unknown>);}
export function deleteTrackerField(id:number){return database.prepare("UPDATE tracker_fields SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived_at IS NULL").run(id).changes>0;}

function trackerEntryFromRow(row:Record<string,unknown>):TrackerEntry{return{id:Number(row.id),trackerId:Number(row.tracker_id),occurredAt:String(row.occurred_at),endAt:row.end_at?String(row.end_at):null,values:jsonValue(row.values_json,{}),note:String(row.note),sourceType:"native_tracker",createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
export function listTrackerEntries(trackerId?:number,input:{from?:string;to?:string;query?:string}={}){const conditions:string[]=[],values:Array<string|number>=[];if(trackerId!==undefined){conditions.push("tracker_id=?");values.push(trackerId);}if(input.from){conditions.push("occurred_at>=?");values.push(input.from);}if(input.to){conditions.push("occurred_at<?");values.push(input.to);}if(input.query){conditions.push("(note LIKE ? OR values_json LIKE ?)");values.push(`%${input.query}%`,`%${input.query}%`);}const where=conditions.length?`WHERE ${conditions.join(" AND ")}`:"";return(database.prepare(`SELECT * FROM tracker_entries ${where} ORDER BY occurred_at DESC,id DESC`).all(...values) as Record<string,unknown>[]).map(trackerEntryFromRow);}
export function getTrackerEntry(id:number){const row=database.prepare("SELECT * FROM tracker_entries WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?trackerEntryFromRow(row):null;}
export function createTrackerEntry(input:Omit<TrackerEntry,"id"|"sourceType"|"createdAt"|"updatedAt">){const result=database.prepare("INSERT INTO tracker_entries(tracker_id,occurred_at,end_at,values_json,note) VALUES(?,?,?,?,?)").run(input.trackerId,input.occurredAt,input.endAt,JSON.stringify(input.values),input.note);return getTrackerEntry(Number(result.lastInsertRowid))!;}
export function updateTrackerEntry(id:number,input:Record<string,unknown>){const map:Record<string,string>={occurredAt:"occurred_at",endAt:"end_at",values:"values_json",note:"note"};const entries=Object.entries(map).filter(([key])=>input[key]!==undefined);if(!entries.length)return getTrackerEntry(id);database.prepare(`UPDATE tracker_entries SET ${entries.map(([,column])=>`${column}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([key])=>key==="values"?JSON.stringify(input[key]):input[key] as string|null),id);return getTrackerEntry(id);}
export function deleteTrackerEntry(id:number){return database.prepare("DELETE FROM tracker_entries WHERE id=?").run(id).changes>0;}

function trackerGoalFromRow(row:Record<string,unknown>):TrackerGoal{return{id:Number(row.id),trackerId:Number(row.tracker_id),operator:row.operator as TrackerGoal["operator"],targetValue:Number(row.target_value),periodType:row.period_type as TrackerGoal["periodType"],customPeriod:String(row.custom_period),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
export function listTrackerGoals(trackerId:number){return(database.prepare("SELECT * FROM tracker_goals WHERE tracker_id=? ORDER BY enabled DESC,id").all(trackerId) as Record<string,unknown>[]).map(trackerGoalFromRow);}
export function createTrackerGoal(input:Omit<TrackerGoal,"id"|"createdAt"|"updatedAt">){const result=database.prepare("INSERT INTO tracker_goals(tracker_id,operator,target_value,period_type,custom_period,enabled) VALUES(?,?,?,?,?,?)").run(input.trackerId,input.operator,input.targetValue,input.periodType,input.customPeriod,Number(input.enabled));return trackerGoalFromRow(database.prepare("SELECT * FROM tracker_goals WHERE id=?").get(Number(result.lastInsertRowid)) as Record<string,unknown>);}
export function deleteTrackerGoal(id:number){return database.prepare("DELETE FROM tracker_goals WHERE id=?").run(id).changes>0;}

function trackerReminderFromRow(row:Record<string,unknown>):TrackerReminder{return{id:Number(row.id),trackerId:Number(row.tracker_id),reminderType:row.reminder_type as TrackerReminder["reminderType"],scheduleRule:String(row.schedule_rule),intervalDays:row.interval_days===null?null:Number(row.interval_days),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
export function listTrackerReminders(trackerId:number){return(database.prepare("SELECT * FROM tracker_reminders WHERE tracker_id=? ORDER BY enabled DESC,id").all(trackerId) as Record<string,unknown>[]).map(trackerReminderFromRow);}
export function createTrackerReminder(input:Omit<TrackerReminder,"id"|"createdAt"|"updatedAt">){const result=database.prepare("INSERT INTO tracker_reminders(tracker_id,reminder_type,schedule_rule,interval_days,enabled) VALUES(?,?,?,?,?)").run(input.trackerId,input.reminderType,input.scheduleRule,input.intervalDays,Number(input.enabled));return trackerReminderFromRow(database.prepare("SELECT * FROM tracker_reminders WHERE id=?").get(Number(result.lastInsertRowid)) as Record<string,unknown>);}
export function deleteTrackerReminder(id:number){return database.prepare("DELETE FROM tracker_reminders WHERE id=?").run(id).changes>0;}

function petFromRow(row:Record<string,unknown>):Pet{return{id:Number(row.id),name:String(row.name),avatarUrl:String(row.avatar_url??""),sex:row.sex as Pet["sex"],birthday:row.birthday?String(row.birthday):null,adoptionDate:row.adoption_date?String(row.adoption_date):null,notes:String(row.notes??""),isActive:Boolean(row.is_active),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catEventFromRow(row:Record<string,unknown>):CatEvent{return{id:Number(row.id),petId:row.pet_id===null?null:Number(row.pet_id),eventType:row.event_type as CatEvent["eventType"],occurredAt:String(row.occurred_at),occurredHasExplicitTime:row.occurred_has_explicit_time===undefined?true:Boolean(row.occurred_has_explicit_time),title:String(row.title),note:String(row.note??""),sourceType:row.source_type?String(row.source_type):null,sourceId:row.source_id===null?null:Number(row.source_id),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catSymptomFromRow(row:Record<string,unknown>):CatSymptom{return{id:Number(row.id),petId:Number(row.pet_id),occurredAt:String(row.occurred_at),occurredHasExplicitTime:row.occurred_has_explicit_time===undefined?true:Boolean(row.occurred_has_explicit_time),title:String(row.title),severity:String(row.severity??""),description:String(row.description??""),bodyArea:String(row.body_area??""),note:String(row.note??""),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catVetVisitFromRow(row:Record<string,unknown>):CatVetVisit{return{id:Number(row.id),petId:Number(row.pet_id),occurredAt:String(row.occurred_at),occurredHasExplicitTime:row.occurred_has_explicit_time===undefined?true:Boolean(row.occurred_has_explicit_time),clinic:String(row.clinic??""),doctor:String(row.doctor??""),reason:String(row.reason),symptoms:String(row.symptoms??""),diagnosis:String(row.diagnosis??""),examinations:String(row.examinations??""),treatment:String(row.treatment??""),prescriptions:String(row.prescriptions??""),cost:row.cost===null?null:Number(row.cost),followUpAt:row.follow_up_at?String(row.follow_up_at):null,notes:String(row.notes??""),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catMedicationFromRow(row:Record<string,unknown>):CatMedication{return{id:Number(row.id),petId:Number(row.pet_id),name:String(row.name),dose:String(row.dose??""),unit:String(row.unit??""),frequencyText:String(row.frequency_text??""),startedAt:String(row.started_at),startedHasExplicitTime:row.started_has_explicit_time===undefined?true:Boolean(row.started_has_explicit_time),endedAt:row.ended_at?String(row.ended_at):null,endedHasExplicitTime:row.ended_has_explicit_time===undefined?true:Boolean(row.ended_has_explicit_time),reason:String(row.reason??""),active:Boolean(row.active),notes:String(row.notes??""),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catMeasurementFromRow(row:Record<string,unknown>):CatMeasurement{return{id:Number(row.id),petId:Number(row.pet_id),occurredAt:String(row.occurred_at),occurredHasExplicitTime:row.occurred_has_explicit_time===undefined?true:Boolean(row.occurred_has_explicit_time),measurementType:String(row.measurement_type),value:Number(row.value),unit:String(row.unit),note:String(row.note??""),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function catRoutineFromRow(row:Record<string,unknown>):CatRoutine{return{id:Number(row.id),scope:row.scope as CatRoutine["scope"],petId:row.pet_id===null?null:Number(row.pet_id),title:String(row.title),intervalValue:Number(row.interval_value),intervalUnit:row.interval_unit as CatRoutine["intervalUnit"],firstDueAt:String(row.first_due_at),lastCompletedAt:row.last_completed_at?String(row.last_completed_at):null,nextDueAt:String(row.next_due_at),reminderLeadMinutes:Number(row.reminder_lead_minutes??0),notes:String(row.notes??""),enabled:Boolean(row.enabled),reminderId:row.reminder_id===null?null:Number(row.reminder_id),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function reminderFromRow(row:Record<string,unknown>):Reminder{return{id:Number(row.id),title:String(row.title),targetType:row.target_type as Reminder["targetType"],targetId:row.target_id===null?null:Number(row.target_id),sourceType:row.source_type?String(row.source_type):null,sourceId:row.source_id===null?null:Number(row.source_id),scheduleType:row.schedule_type as Reminder["scheduleType"],startsAt:String(row.starts_at),nextDueAt:row.next_due_at?String(row.next_due_at):null,dueHasExplicitTime:row.due_has_explicit_time===undefined?true:Boolean(row.due_has_explicit_time),intervalValue:row.interval_value===null?null:Number(row.interval_value),intervalUnit:row.interval_unit as Reminder["intervalUnit"],timesOfDay:jsonValue(row.times_of_day,[]),endsAt:row.ends_at?String(row.ends_at):null,timezone:String(row.timezone),note:String(row.note??""),leadTimeMinutes:Number(row.lead_time_minutes??0),status:(row.status??"scheduled") as Reminder["status"],sentAt:row.sent_at?String(row.sent_at):null,cancelledAt:row.cancelled_at?String(row.cancelled_at):null,isActive:Boolean(row.is_active),lastCompletedAt:row.last_completed_at?String(row.last_completed_at):null,snoozedUntil:row.snoozed_until?String(row.snoozed_until):null,lastNotifiedAt:row.last_notified_at?String(row.last_notified_at):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function reminderOccurrenceFromRow(row:Record<string,unknown>):ReminderOccurrence{return{id:Number(row.id),reminderId:Number(row.reminder_id),action:row.action as ReminderOccurrence["action"],scheduledFor:String(row.scheduled_for),actedAt:String(row.acted_at),createdEventId:row.created_event_id===null?null:Number(row.created_event_id),createdAt:String(row.created_at)};}
function notificationDeliveryFromRow(row:Record<string,unknown>):NotificationDelivery{return{id:Number(row.id),reminderId:row.reminder_id===null?null:Number(row.reminder_id),title:String(row.title),sourceType:row.source_type?String(row.source_type):null,sourceId:row.source_id===null?null:Number(row.source_id),targetType:row.target_type as Reminder["targetType"],targetId:row.target_id===null?null:Number(row.target_id),scheduledAt:String(row.scheduled_at),scheduledHasExplicitTime:row.scheduled_has_explicit_time===undefined?true:Boolean(row.scheduled_has_explicit_time),sentAt:row.sent_at?String(row.sent_at):null,status:row.status as NotificationDelivery["status"],createdAt:String(row.created_at)};}
function pushSubscriptionFromRow(row:Record<string,unknown>):PushSubscriptionRecord{return{id:Number(row.id),endpoint:String(row.endpoint),p256dh:String(row.p256dh),auth:String(row.auth),createdAt:String(row.created_at),lastUsedAt:String(row.last_used_at)};}
function updateCatsRow(table:string,id:number,input:Record<string,unknown>,map:Record<string,string>,jsonKeys:string[]=[],booleanKeys:string[]=[]){const entries=Object.entries(map).filter(([key])=>input[key]!==undefined);if(!entries.length)return false;database.prepare(`UPDATE ${table} SET ${entries.map(([,column])=>`${column}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([key])=>jsonKeys.includes(key)?JSON.stringify(input[key]):booleanKeys.includes(key)?Number(input[key]):input[key] as string|number|null),id);return true;}
function listByPet<T>(table:string,mapper:(row:Record<string,unknown>)=>T,petId?:number|null,timeColumn="occurred_at"){const where=petId===null?"WHERE pet_id IS NULL":typeof petId==="number"?"WHERE pet_id=?":"";const values=typeof petId==="number"?[petId]:[];return(database.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${timeColumn} DESC,id DESC`).all(...values) as Record<string,unknown>[]).map(mapper);}

export function listPets(includeInactive=false){return(database.prepare(`SELECT * FROM pets ${includeInactive?"":"WHERE is_active=1"} ORDER BY is_active DESC,name`).all() as Record<string,unknown>[]).map(petFromRow);}
export function getPet(id:number){const row=database.prepare("SELECT * FROM pets WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?petFromRow(row):null;}
export function createPet(input:Omit<Pet,"id"|"createdAt"|"updatedAt">){const result=database.prepare("INSERT INTO pets(name,avatar_url,sex,birthday,adoption_date,notes,is_active) VALUES(?,?,?,?,?,?,?)").run(input.name,input.avatarUrl,input.sex,input.birthday,input.adoptionDate,input.notes,Number(input.isActive));return getPet(Number(result.lastInsertRowid))!;}
export function updatePet(id:number,input:Record<string,unknown>){updateCatsRow("pets",id,input,{name:"name",avatarUrl:"avatar_url",sex:"sex",birthday:"birthday",adoptionDate:"adoption_date",notes:"notes",isActive:"is_active"},[],["isActive"]);return getPet(id);}
export function archivePet(id:number){return database.prepare("UPDATE pets SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id).changes>0;}
export function listCatEvents(petId?:number|null){return listByPet("cat_events",catEventFromRow,petId);}
export function getCatEvent(id:number){const row=database.prepare("SELECT * FROM cat_events WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?catEventFromRow(row):null;}
export function createCatEvent(input:Omit<CatEvent,"id"|"createdAt"|"updatedAt">){const result=database.prepare("INSERT INTO cat_events(pet_id,event_type,occurred_at,occurred_has_explicit_time,title,note,source_type,source_id) VALUES(?,?,?,?,?,?,?,?)").run(input.petId,input.eventType,input.occurredAt,Number(input.occurredHasExplicitTime),input.title,input.note,input.sourceType,input.sourceId);return getCatEvent(Number(result.lastInsertRowid))!;}
export function updateCatEvent(id:number,input:Record<string,unknown>){updateCatsRow("cat_events",id,input,{petId:"pet_id",eventType:"event_type",occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",title:"title",note:"note",sourceType:"source_type",sourceId:"source_id"},[],["occurredHasExplicitTime"]);return getCatEvent(id);}
export function deleteCatEvent(id:number){return database.prepare("DELETE FROM cat_events WHERE id=?").run(id).changes>0;}
export function listCatSymptoms(petId?:number){return listByPet("cat_symptoms",catSymptomFromRow,petId);}
export function getCatSymptom(id:number){const row=database.prepare("SELECT * FROM cat_symptoms WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?catSymptomFromRow(row):null;}
export function createCatSymptom(input:Omit<CatSymptom,"id"|"createdAt"|"updatedAt">){const r=database.prepare("INSERT INTO cat_symptoms(pet_id,occurred_at,occurred_has_explicit_time,title,severity,description,body_area,note) VALUES(?,?,?,?,?,?,?,?)").run(input.petId,input.occurredAt,Number(input.occurredHasExplicitTime),input.title,input.severity,input.description,input.bodyArea,input.note);return getCatSymptom(Number(r.lastInsertRowid))!;}
export function updateCatSymptom(id:number,input:Record<string,unknown>){updateCatsRow("cat_symptoms",id,input,{petId:"pet_id",occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",title:"title",severity:"severity",description:"description",bodyArea:"body_area",note:"note"},[],["occurredHasExplicitTime"]);return getCatSymptom(id);}
export function deleteCatSymptom(id:number){return database.prepare("DELETE FROM cat_symptoms WHERE id=?").run(id).changes>0;}
export function listCatVetVisits(petId?:number){return listByPet("vet_visits",catVetVisitFromRow,petId);}
export function getCatVetVisit(id:number){const row=database.prepare("SELECT * FROM vet_visits WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?catVetVisitFromRow(row):null;}
export function createCatVetVisit(input:Omit<CatVetVisit,"id"|"createdAt"|"updatedAt">){const r=database.prepare("INSERT INTO vet_visits(pet_id,occurred_at,occurred_has_explicit_time,clinic,doctor,reason,symptoms,diagnosis,examinations,treatment,prescriptions,cost,follow_up_at,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(input.petId,input.occurredAt,Number(input.occurredHasExplicitTime),input.clinic,input.doctor,input.reason,input.symptoms,input.diagnosis,input.examinations,input.treatment,input.prescriptions,input.cost,input.followUpAt,input.notes);return getCatVetVisit(Number(r.lastInsertRowid))!;}
export function updateCatVetVisit(id:number,input:Record<string,unknown>){updateCatsRow("vet_visits",id,input,{petId:"pet_id",occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",clinic:"clinic",doctor:"doctor",reason:"reason",symptoms:"symptoms",diagnosis:"diagnosis",examinations:"examinations",treatment:"treatment",prescriptions:"prescriptions",cost:"cost",followUpAt:"follow_up_at",notes:"notes"},[],["occurredHasExplicitTime"]);return getCatVetVisit(id);}
export function deleteCatVetVisit(id:number){return database.prepare("DELETE FROM vet_visits WHERE id=?").run(id).changes>0;}
export function listCatMedications(petId?:number){return listByPet("cat_medications",catMedicationFromRow,petId,"started_at");}
export function getCatMedication(id:number){const row=database.prepare("SELECT * FROM cat_medications WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?catMedicationFromRow(row):null;}
export function createCatMedication(input:Omit<CatMedication,"id"|"createdAt"|"updatedAt">){const r=database.prepare("INSERT INTO cat_medications(pet_id,name,dose,unit,frequency_text,started_at,started_has_explicit_time,ended_at,ended_has_explicit_time,reason,active,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(input.petId,input.name,input.dose,input.unit,input.frequencyText,input.startedAt,Number(input.startedHasExplicitTime),input.endedAt,Number(input.endedHasExplicitTime),input.reason,Number(input.active),input.notes);return getCatMedication(Number(r.lastInsertRowid))!;}
export function updateCatMedication(id:number,input:Record<string,unknown>){updateCatsRow("cat_medications",id,input,{petId:"pet_id",name:"name",dose:"dose",unit:"unit",frequencyText:"frequency_text",startedAt:"started_at",startedHasExplicitTime:"started_has_explicit_time",endedAt:"ended_at",endedHasExplicitTime:"ended_has_explicit_time",reason:"reason",active:"active",notes:"notes"},[],["active","startedHasExplicitTime","endedHasExplicitTime"]);return getCatMedication(id);}
export function deleteCatMedication(id:number){return database.prepare("DELETE FROM cat_medications WHERE id=?").run(id).changes>0;}
export function listCatMeasurements(petId?:number){return listByPet("cat_measurements",catMeasurementFromRow,petId);}
export function getCatMeasurement(id:number){const row=database.prepare("SELECT * FROM cat_measurements WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?catMeasurementFromRow(row):null;}
export function createCatMeasurement(input:Omit<CatMeasurement,"id"|"createdAt"|"updatedAt">){const r=database.prepare("INSERT INTO cat_measurements(pet_id,occurred_at,occurred_has_explicit_time,measurement_type,value,unit,note) VALUES(?,?,?,?,?,?,?)").run(input.petId,input.occurredAt,Number(input.occurredHasExplicitTime),input.measurementType,input.value,input.unit,input.note);return getCatMeasurement(Number(r.lastInsertRowid))!;}
export function updateCatMeasurement(id:number,input:Record<string,unknown>){updateCatsRow("cat_measurements",id,input,{petId:"pet_id",occurredAt:"occurred_at",occurredHasExplicitTime:"occurred_has_explicit_time",measurementType:"measurement_type",value:"value",unit:"unit",note:"note"},[],["occurredHasExplicitTime"]);return getCatMeasurement(id);}
export function deleteCatMeasurement(id:number){return database.prepare("DELETE FROM cat_measurements WHERE id=?").run(id).changes>0;}

export function listCatRoutines(input:{scope?:string;petId?:number|null;enabledOnly?:boolean}={}){const c:string[]=[],v:Array<string|number>=[];if(input.scope){c.push("scope=?");v.push(input.scope);}if(input.petId===null)c.push("pet_id IS NULL");else if(typeof input.petId==="number"){c.push("pet_id=?");v.push(input.petId);}if(input.enabledOnly)c.push("enabled=1");return(database.prepare(`SELECT * FROM cat_routines ${c.length?`WHERE ${c.join(" AND ")}`:""} ORDER BY enabled DESC,next_due_at,id`).all(...v) as Record<string,unknown>[]).map(catRoutineFromRow);}
export function getCatRoutine(id:number){const row=database.prepare("SELECT * FROM cat_routines WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?catRoutineFromRow(row):null;}
export function createCatRoutine(input:Omit<CatRoutine,"id"|"lastCompletedAt"|"createdAt"|"updatedAt">){const r=database.prepare("INSERT INTO cat_routines(scope,pet_id,title,interval_value,interval_unit,first_due_at,next_due_at,reminder_lead_minutes,notes,enabled,reminder_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(input.scope,input.petId,input.title,input.intervalValue,input.intervalUnit,input.firstDueAt,input.nextDueAt,input.reminderLeadMinutes,input.notes,Number(input.enabled),input.reminderId);return getCatRoutine(Number(r.lastInsertRowid))!;}
export function updateCatRoutine(id:number,input:Record<string,unknown>){updateCatsRow("cat_routines",id,input,{scope:"scope",petId:"pet_id",title:"title",intervalValue:"interval_value",intervalUnit:"interval_unit",firstDueAt:"first_due_at",lastCompletedAt:"last_completed_at",nextDueAt:"next_due_at",reminderLeadMinutes:"reminder_lead_minutes",notes:"notes",enabled:"enabled",reminderId:"reminder_id"},[],["enabled"]);return getCatRoutine(id);}
export function archiveCatRoutine(id:number){return database.prepare("UPDATE cat_routines SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id).changes>0;}

export function listReminders(input:{targetType?:string;targetId?:number|null;activeOnly?:boolean;dueBefore?:string}={}){const c:string[]=[],v:Array<string|number>=[];if(input.targetType){c.push("target_type=?");v.push(input.targetType);}if(input.targetId===null)c.push("target_id IS NULL");else if(typeof input.targetId==="number"){c.push("target_id=?");v.push(input.targetId);}if(input.activeOnly)c.push("is_active=1");if(input.dueBefore){c.push("COALESCE(snoozed_until,next_due_at)<=?");v.push(input.dueBefore);}return(database.prepare(`SELECT * FROM reminders ${c.length?`WHERE ${c.join(" AND ")}`:""} ORDER BY COALESCE(snoozed_until,next_due_at),id`).all(...v) as Record<string,unknown>[]).map(reminderFromRow);}
export function getReminder(id:number){const row=database.prepare("SELECT * FROM reminders WHERE id=?").get(id) as Record<string,unknown>|undefined;return row?reminderFromRow(row):null;}
export function createReminder(input:Omit<Reminder,"id"|"lastCompletedAt"|"snoozedUntil"|"lastNotifiedAt"|"sentAt"|"cancelledAt"|"createdAt"|"updatedAt">){const r=database.prepare("INSERT INTO reminders(title,target_type,target_id,source_type,source_id,schedule_type,starts_at,next_due_at,due_has_explicit_time,interval_value,interval_unit,times_of_day,ends_at,timezone,note,lead_time_minutes,status,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(input.title,input.targetType,input.targetId,input.sourceType,input.sourceId,input.scheduleType,input.startsAt,input.nextDueAt,Number(input.dueHasExplicitTime),input.intervalValue,input.intervalUnit,JSON.stringify(input.timesOfDay),input.endsAt,input.timezone,input.note,input.leadTimeMinutes,input.status,Number(input.isActive));return getReminder(Number(r.lastInsertRowid))!;}
export function updateReminder(id:number,input:Record<string,unknown>){updateCatsRow("reminders",id,input,{title:"title",targetType:"target_type",targetId:"target_id",sourceType:"source_type",sourceId:"source_id",scheduleType:"schedule_type",startsAt:"starts_at",nextDueAt:"next_due_at",dueHasExplicitTime:"due_has_explicit_time",intervalValue:"interval_value",intervalUnit:"interval_unit",timesOfDay:"times_of_day",endsAt:"ends_at",timezone:"timezone",note:"note",leadTimeMinutes:"lead_time_minutes",status:"status",sentAt:"sent_at",cancelledAt:"cancelled_at",isActive:"is_active",lastCompletedAt:"last_completed_at",snoozedUntil:"snoozed_until",lastNotifiedAt:"last_notified_at"},["timesOfDay"],["isActive","dueHasExplicitTime"]);return getReminder(id);}
export function deleteReminder(id:number){return database.prepare("DELETE FROM reminders WHERE id=?").run(id).changes>0;}
export function createReminderOccurrence(input:Omit<ReminderOccurrence,"id"|"createdAt">){const r=database.prepare("INSERT INTO reminder_occurrences(reminder_id,action,scheduled_for,acted_at,created_event_id) VALUES(?,?,?,?,?)").run(input.reminderId,input.action,input.scheduledFor,input.actedAt,input.createdEventId);return reminderOccurrenceFromRow(database.prepare("SELECT * FROM reminder_occurrences WHERE id=?").get(Number(r.lastInsertRowid)) as Record<string,unknown>);}
export function listNotificationDeliveries(limit=100){return(database.prepare("SELECT * FROM notification_deliveries ORDER BY created_at DESC,id DESC LIMIT ?").all(limit) as Record<string,unknown>[]).map(notificationDeliveryFromRow);}
export function createNotificationDelivery(input:Omit<NotificationDelivery,"id"|"createdAt">){const r=database.prepare("INSERT INTO notification_deliveries(reminder_id,title,source_type,source_id,target_type,target_id,scheduled_at,scheduled_has_explicit_time,sent_at,status) VALUES(?,?,?,?,?,?,?,?,?,?)").run(input.reminderId,input.title,input.sourceType,input.sourceId,input.targetType,input.targetId,input.scheduledAt,Number(input.scheduledHasExplicitTime),input.sentAt,input.status);return notificationDeliveryFromRow(database.prepare("SELECT * FROM notification_deliveries WHERE id=?").get(Number(r.lastInsertRowid)) as Record<string,unknown>);}
export function listPushSubscriptions(){return(database.prepare("SELECT * FROM push_subscriptions ORDER BY id").all() as Record<string,unknown>[]).map(pushSubscriptionFromRow);}
export function upsertPushSubscription(input:Pick<PushSubscriptionRecord,"endpoint"|"p256dh"|"auth">){database.prepare("INSERT INTO push_subscriptions(endpoint,p256dh,auth) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,last_used_at=CURRENT_TIMESTAMP").run(input.endpoint,input.p256dh,input.auth);return pushSubscriptionFromRow(database.prepare("SELECT * FROM push_subscriptions WHERE endpoint=?").get(input.endpoint) as Record<string,unknown>);}
export function deletePushSubscription(endpoint:string){return database.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").run(endpoint).changes>0;}

export function getNutritionSettings(date:string){const row=database.prepare("SELECT * FROM daily_nutrition_summaries WHERE date=?").get(date) as Record<string,unknown>|undefined;return{restingEnergyKcal:row?.resting_energy_kcal===null||row?.resting_energy_kcal===undefined?null:Number(row.resting_energy_kcal),activeEnergyKcal:row?.active_energy_kcal===null||row?.active_energy_kcal===undefined?null:Number(row.active_energy_kcal),notes:row?String(row.notes):""};}
export function listNutritionSettings(limit=30){const size=Math.min(Math.max(Math.trunc(limit),1),90);return(database.prepare("SELECT date,resting_energy_kcal,active_energy_kcal,notes FROM daily_nutrition_summaries WHERE resting_energy_kcal IS NOT NULL OR active_energy_kcal IS NOT NULL ORDER BY date DESC LIMIT ?").all(size) as Record<string,unknown>[]).map((row)=>({date:String(row.date),restingEnergyKcal:row.resting_energy_kcal===null||row.resting_energy_kcal===undefined?null:Number(row.resting_energy_kcal),activeEnergyKcal:row.active_energy_kcal===null||row.active_energy_kcal===undefined?null:Number(row.active_energy_kcal),notes:String(row.notes??"")}));}
export function updateNutritionSettings(date:string,input:{restingEnergyKcal:number|null;activeEnergyKcal:number|null;notes:string}){database.prepare("INSERT INTO daily_nutrition_summaries(date,resting_energy_kcal,active_energy_kcal,notes) VALUES(?,?,?,?) ON CONFLICT(date) DO UPDATE SET resting_energy_kcal=excluded.resting_energy_kcal,active_energy_kcal=excluded.active_energy_kcal,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP").run(date,input.restingEnergyKcal,input.activeEnergyKcal,input.notes);}
