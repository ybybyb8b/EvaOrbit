import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const source = path.resolve(process.env.SQLITE_SOURCE_PATH || process.env.EVAORBIT_SQLITE_PATH || "data/personal-hub.db");
const userId = process.env.MIGRATION_USER_ID?.trim() ?? "";
const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

if (!fs.existsSync(source)) throw new Error(`找不到 SQLite 文件：${source}`);
if (apply && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
  throw new Error("MIGRATION_USER_ID 必须是 Supabase Auth 用户的 UUID。");
}

const sqlite = new DatabaseSync(source, { readOnly: true });
sqlite.exec("PRAGMA query_only = ON; PRAGMA foreign_keys = ON;");

function rows(table) {
  return sqlite.prepare(`select * from ${table} order by id`).all();
}

function tableExists(table) {
  return Boolean(sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table));
}

function optionalRows(table, orderBy = "id") {
  return tableExists(table) ? sqlite.prepare(`select * from ${table} order by ${orderBy}`).all() : [];
}

const tasks = rows("tasks");
const memories = rows("memories");
const sessions = rows("chat_sessions");
const messages = rows("chat_messages");
const inboxItems = optionalRows("inbox_items");
const foodLogs = optionalRows("food_logs");
const foodLibrary = optionalRows("food_library");
const drinkLogs = optionalRows("drink_logs");
const drinkLimits = optionalRows("drink_limits");
const nutritionSummaries = optionalRows("daily_nutrition_summaries", "date");
const settings = sqlite.prepare("select * from ai_settings where id = 1").get();
const orphanMessages = sqlite.prepare("select count(*) as count from chat_messages m left join chat_sessions s on s.id = m.session_id where s.id is null").get().count;
if (orphanMessages) throw new Error(`发现 ${orphanMessages} 条孤立消息，导入已停止。`);

function timestamp(value) {
  const text = String(value);
  return /(?:Z|[+-]\d\d:\d\d)$/.test(text) ? text : `${text.replace(" ", "T")}Z`;
}

function tags(value) {
  const parsed = JSON.parse(String(value || "[]"));
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error(`任务 tags 不是字符串数组：${value}`);
  return parsed;
}

const hasLocalAiKey = Boolean(settings?.api_key || settings?.api_key_ciphertext);
console.log("SQLite source:", source);
console.table({ tasks: tasks.length, memories: memories.length, conversations: sessions.length, messages: messages.length, inbox: inboxItems.length, food_logs: foodLogs.length, food_library: foodLibrary.length, drink_logs: drinkLogs.length, drink_limits: drinkLimits.length, daily_summaries: nutritionSummaries.length, ai_settings: settings ? 1 : 0 });
if (hasLocalAiKey) console.log("AI API Key: 不随数据导入；部署后请在网页 Settings 中重新保存。" );
if (!apply) {
  console.log("Dry run only. 检查通过；确认目标库为空或可覆盖后，追加 --apply 执行正式导入。");
  sqlite.close();
  process.exit(0);
}
if (!databaseUrl) throw new Error("正式导入需要 DATABASE_URL。");

const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 15 });
try {
  await sql.begin(async (tx) => {
    for (const row of tasks) await tx`
      insert into public.tasks (id, user_id, title, notes, completed, due_date, priority, tags, created_at, updated_at)
      values (${row.id}, ${userId}, ${row.title}, ${row.notes}, ${Boolean(row.completed)}, ${row.due_date}, ${row.priority}, ${tags(row.tags)}, ${timestamp(row.created_at)}, ${timestamp(row.updated_at)})
      on conflict (id) do update set title=excluded.title, notes=excluded.notes, completed=excluded.completed, due_date=excluded.due_date,
        priority=excluded.priority, tags=excluded.tags, created_at=excluded.created_at, updated_at=excluded.updated_at
      where tasks.user_id=excluded.user_id`;
    for (const row of memories) await tx`
      insert into public.memories (id, user_id, title, content, category, created_at, updated_at)
      values (${row.id}, ${userId}, ${row.title}, ${row.content}, ${row.category}, ${timestamp(row.created_at)}, ${timestamp(row.updated_at)})
      on conflict (id) do update set title=excluded.title, content=excluded.content, category=excluded.category,
        created_at=excluded.created_at, updated_at=excluded.updated_at where memories.user_id=excluded.user_id`;
    for (const row of inboxItems) await tx`
      insert into public.inbox_items (id,user_id,content,status,source,processed_at,converted_type,converted_id,created_at,updated_at)
      values (${row.id},${userId},${row.content},${row.status},${row.source},${row.processed_at ? timestamp(row.processed_at) : null},${row.converted_type},${row.converted_id},${timestamp(row.created_at)},${timestamp(row.updated_at)})
      on conflict (id) do update set content=excluded.content,status=excluded.status,source=excluded.source,processed_at=excluded.processed_at,
        converted_type=excluded.converted_type,converted_id=excluded.converted_id,created_at=excluded.created_at,updated_at=excluded.updated_at
      where inbox_items.user_id=excluded.user_id`;
    for (const row of foodLogs) await tx`
      insert into public.food_logs (id,user_id,occurred_at,meal_type,title,description,portion,scene,estimated_kcal,kcal_min,kcal_max,confidence,notes,image_url,attachment_id,created_at,updated_at)
      values (${row.id},${userId},${timestamp(row.occurred_at)},${row.meal_type},${row.title},${row.description},${row.portion},${row.scene},${row.estimated_kcal},${row.kcal_min},${row.kcal_max},${row.confidence},${row.notes},${row.image_url},${row.attachment_id},${timestamp(row.created_at)},${timestamp(row.updated_at)})
      on conflict (id) do update set occurred_at=excluded.occurred_at,meal_type=excluded.meal_type,title=excluded.title,description=excluded.description,
        portion=excluded.portion,scene=excluded.scene,estimated_kcal=excluded.estimated_kcal,kcal_min=excluded.kcal_min,kcal_max=excluded.kcal_max,
        confidence=excluded.confidence,notes=excluded.notes,image_url=excluded.image_url,attachment_id=excluded.attachment_id,created_at=excluded.created_at,updated_at=excluded.updated_at
      where food_logs.user_id=excluded.user_id`;
    for (const row of foodLibrary) await tx`
      insert into public.food_library (id,user_id,name,brand,category,default_portion,reference_type,reference_energy_kj,reference_kcal,serving_weight,serving_kcal,data_source,notes,updated_at)
      values (${row.id},${userId},${row.name},${row.brand},${row.category},${row.default_portion},${row.reference_type},${row.reference_energy_kj},${row.reference_kcal},${row.serving_weight},${row.serving_kcal},${row.data_source},${row.notes},${timestamp(row.updated_at)})
      on conflict (id) do update set name=excluded.name,brand=excluded.brand,category=excluded.category,default_portion=excluded.default_portion,
        reference_type=excluded.reference_type,reference_energy_kj=excluded.reference_energy_kj,reference_kcal=excluded.reference_kcal,
        serving_weight=excluded.serving_weight,serving_kcal=excluded.serving_kcal,data_source=excluded.data_source,notes=excluded.notes,updated_at=excluded.updated_at
      where food_library.user_id=excluded.user_id`;
    for (const row of drinkLogs) await tx`
      insert into public.drink_logs (id,user_id,occurred_at,name,brand,drink_type,volume_ml,sugar_level,caffeine_mg,estimated_kcal,kcal_min,kcal_max,confidence,food_library_id,notes,created_at,updated_at)
      values (${row.id},${userId},${timestamp(row.occurred_at)},${row.name},${row.brand},${row.drink_type},${row.volume_ml},${row.sugar_level},${row.caffeine_mg},${row.estimated_kcal},${row.kcal_min},${row.kcal_max},${row.confidence},${row.food_library_id},${row.notes},${timestamp(row.created_at)},${timestamp(row.updated_at)})
      on conflict (id) do update set occurred_at=excluded.occurred_at,name=excluded.name,brand=excluded.brand,drink_type=excluded.drink_type,
        volume_ml=excluded.volume_ml,sugar_level=excluded.sugar_level,caffeine_mg=excluded.caffeine_mg,estimated_kcal=excluded.estimated_kcal,
        kcal_min=excluded.kcal_min,kcal_max=excluded.kcal_max,confidence=excluded.confidence,food_library_id=excluded.food_library_id,
        notes=excluded.notes,created_at=excluded.created_at,updated_at=excluded.updated_at where drink_logs.user_id=excluded.user_id`;
    for (const row of drinkLimits) await tx`
      insert into public.drink_limits (id,user_id,name,target_type,period,limit_value,enabled,created_at,updated_at)
      values (${row.id},${userId},${row.name},${row.target_type},${row.period},${row.limit_value},${Boolean(row.enabled)},${timestamp(row.created_at)},${timestamp(row.updated_at)})
      on conflict (id) do update set name=excluded.name,target_type=excluded.target_type,period=excluded.period,limit_value=excluded.limit_value,
        enabled=excluded.enabled,created_at=excluded.created_at,updated_at=excluded.updated_at where drink_limits.user_id=excluded.user_id`;
    for (const row of nutritionSummaries) await tx`
      insert into public.daily_nutrition_summaries (date,user_id,resting_energy_kcal,active_energy_kcal,notes,updated_at)
      values (${row.date},${userId},${row.resting_energy_kcal},${row.active_energy_kcal},${row.notes},${timestamp(row.updated_at)})
      on conflict (date,user_id) do update set resting_energy_kcal=excluded.resting_energy_kcal,active_energy_kcal=excluded.active_energy_kcal,
        notes=excluded.notes,updated_at=excluded.updated_at`;
    for (const row of sessions) await tx`
      insert into public.chat_sessions (id, user_id, title, model, created_at, updated_at)
      values (${row.id}, ${userId}, ${row.title}, ${row.model}, ${timestamp(row.created_at)}, ${timestamp(row.updated_at)})
      on conflict (id) do update set title=excluded.title, model=excluded.model, created_at=excluded.created_at,
        updated_at=excluded.updated_at where chat_sessions.user_id=excluded.user_id`;
    for (const row of messages) await tx`
      insert into public.chat_messages (id, user_id, session_id, role, content, model, created_at)
      values (${row.id}, ${userId}, ${row.session_id}, ${row.role}, ${row.content}, ${row.model}, ${timestamp(row.created_at)})
      on conflict (id) do update set session_id=excluded.session_id, role=excluded.role, content=excluded.content,
        model=excluded.model, created_at=excluded.created_at where chat_messages.user_id=excluded.user_id`;
    if (settings) await tx`
      insert into public.ai_settings (user_id, provider_preset, provider_name, base_url, model, enabled,
        temperature, system_prompt, response_length, initiative, allow_suggestions, allow_teasing, include_tasks,
        include_memories, allow_write_actions, user_display_name, user_avatar_type, user_avatar_value,
        assistant_display_name, assistant_avatar_type, assistant_avatar_value, show_user_name, show_assistant_name, show_avatars, updated_at)
      values (${userId}, ${settings.provider_preset}, ${settings.provider_name}, ${settings.base_url},
        ${settings.model}, ${Boolean(settings.enabled)},
        ${settings.temperature}, ${settings.system_prompt}, ${settings.response_length}, ${settings.initiative},
        ${Boolean(settings.allow_suggestions)}, ${Boolean(settings.allow_teasing)}, ${Boolean(settings.include_tasks)},
        ${Boolean(settings.include_memories)}, ${Boolean(settings.allow_write_actions)},
        ${settings.user_display_name ?? "我"}, ${settings.user_avatar_type === "image" ? "default" : settings.user_avatar_type ?? "default"}, ${settings.user_avatar_type === "image" ? "" : settings.user_avatar_value ?? ""},
        ${settings.assistant_display_name ?? "Eva"}, ${settings.assistant_avatar_type === "image" ? "default" : settings.assistant_avatar_type ?? "default"}, ${settings.assistant_avatar_type === "image" ? "" : settings.assistant_avatar_value ?? ""},
        ${settings.show_user_name === undefined ? true : Boolean(settings.show_user_name)},
        ${settings.show_assistant_name === undefined ? true : Boolean(settings.show_assistant_name)},
        ${settings.show_avatars === undefined ? true : Boolean(settings.show_avatars)}, ${timestamp(settings.updated_at)})
      on conflict (user_id) do update set provider_preset=excluded.provider_preset, provider_name=excluded.provider_name,
        base_url=excluded.base_url, model=excluded.model, enabled=excluded.enabled,
        temperature=excluded.temperature, system_prompt=excluded.system_prompt, response_length=excluded.response_length,
        initiative=excluded.initiative, allow_suggestions=excluded.allow_suggestions, allow_teasing=excluded.allow_teasing,
        include_tasks=excluded.include_tasks, include_memories=excluded.include_memories,
        allow_write_actions=excluded.allow_write_actions, user_display_name=excluded.user_display_name,
        user_avatar_type=excluded.user_avatar_type, user_avatar_value=excluded.user_avatar_value,
        assistant_display_name=excluded.assistant_display_name, assistant_avatar_type=excluded.assistant_avatar_type,
        assistant_avatar_value=excluded.assistant_avatar_value, show_user_name=excluded.show_user_name,
        show_assistant_name=excluded.show_assistant_name, show_avatars=excluded.show_avatars, updated_at=excluded.updated_at`;

    const target = await tx`
      select
        (select count(*)::int from public.tasks where user_id=${userId}) as tasks,
        (select count(*)::int from public.memories where user_id=${userId}) as memories,
        (select count(*)::int from public.chat_sessions where user_id=${userId}) as conversations,
        (select count(*)::int from public.chat_messages where user_id=${userId}) as messages,
        (select count(*)::int from public.inbox_items where user_id=${userId}) as inbox,
        (select count(*)::int from public.food_logs where user_id=${userId}) as food_logs,
        (select count(*)::int from public.food_library where user_id=${userId}) as food_library,
        (select count(*)::int from public.drink_logs where user_id=${userId}) as drink_logs,
        (select count(*)::int from public.drink_limits where user_id=${userId}) as drink_limits,
        (select count(*)::int from public.daily_nutrition_summaries where user_id=${userId}) as daily_summaries`;
    const expected = [tasks.length, memories.length, sessions.length, messages.length, inboxItems.length, foodLogs.length, foodLibrary.length, drinkLogs.length, drinkLimits.length, nutritionSummaries.length];
    const actual = [target[0].tasks, target[0].memories, target[0].conversations, target[0].messages, target[0].inbox, target[0].food_logs, target[0].food_library, target[0].drink_logs, target[0].drink_limits, target[0].daily_summaries];
    if (expected.some((count, index) => count !== actual[index])) throw new Error(`导入计数不一致：expected=${expected.join(",")} actual=${actual.join(",")}`);

    await tx.unsafe("select setval(pg_get_serial_sequence('public.tasks','id'), greatest(coalesce((select max(id) from public.tasks), 1), 1), true)");
    await tx.unsafe("select setval(pg_get_serial_sequence('public.memories','id'), greatest(coalesce((select max(id) from public.memories), 1), 1), true)");
    await tx.unsafe("select setval(pg_get_serial_sequence('public.chat_sessions','id'), greatest(coalesce((select max(id) from public.chat_sessions), 1), 1), true)");
    await tx.unsafe("select setval(pg_get_serial_sequence('public.chat_messages','id'), greatest(coalesce((select max(id) from public.chat_messages), 1), 1), true)");
    await tx.unsafe("select setval(pg_get_serial_sequence('public.inbox_items','id'), greatest(coalesce((select max(id) from public.inbox_items), 1), 1), true)");
    await tx.unsafe("select setval(pg_get_serial_sequence('public.food_logs','id'), greatest(coalesce((select max(id) from public.food_logs), 1), 1), true)");
    await tx.unsafe("select setval(pg_get_serial_sequence('public.food_library','id'), greatest(coalesce((select max(id) from public.food_library), 1), 1), true)");
    await tx.unsafe("select setval(pg_get_serial_sequence('public.drink_logs','id'), greatest(coalesce((select max(id) from public.drink_logs), 1), 1), true)");
    await tx.unsafe("select setval(pg_get_serial_sequence('public.drink_limits','id'), greatest(coalesce((select max(id) from public.drink_limits), 1), 1), true)");
  });
  console.log("SQLite → PostgreSQL 导入完成，关系与计数校验通过。");
} finally {
  sqlite.close();
  await sql.end();
}
