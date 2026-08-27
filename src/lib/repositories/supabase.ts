import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encryptAiApiKey, resolveAiApiKey } from "../ai-secret";
import { maskApiKey } from "../ai-provider";
import { normalizeHomeModuleOrder, type HomeModuleId } from "../home-modules";
import { allowedEmail, supabaseConfig } from "../config";
import { ConflictError } from "../errors";
import { createSupabaseServerClient } from "../supabase/server";
import type { AiModelConfig, AiProvider, ChatMessage, ChatRole, ChatSession, DrinkLimit, DrinkLog, FoodLibraryItem, FoodLog, InboxItem, Memory, Task, TaskPriority, Tracker, TrackerEntry, TrackerField, TrackerGoal, TrackerReminder } from "../types";
import type { AiModelConfigInput, AiProviderInput, AiSettingsInput, EvaOrbitRepository, InternalAiProvider, InternalAiSettings, NewTask, TaskFilter } from "./types";

type Row = Record<string, unknown>;

function fail(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}失败：${error.message}`);
}

function taskFromRow(row: Row): Task {
  return {
    id: Number(row.id), title: String(row.title), notes: String(row.notes ?? ""), completed: Boolean(row.completed),
    dueDate: row.due_date ? String(row.due_date) : null, priority: row.priority as TaskPriority,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [], createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function memoryFromRow(row: Row): Memory {
  return {
    id: Number(row.id), title: String(row.title), content: String(row.content), category: String(row.category),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function messageFromRow(row: Row): ChatMessage {
  return {
    id: Number(row.id), sessionId: Number(row.session_id), role: row.role as ChatRole,
    content: String(row.content), model: row.model ? String(row.model) : null,
    providerId: row.provider_id ? Number(row.provider_id) : null, modelConfigId: row.model_config_id ? Number(row.model_config_id) : null,
    createdAt: String(row.created_at),
  };
}

function sessionFromRow(row: Row, preview = "", messageCount = 0): ChatSession {
  const providerRelation = row.ai_providers as Row | null | undefined;
  const modelRelation = row.ai_model_configs as Row | null | undefined;
  return {
    id: Number(row.id), title: String(row.title), model: row.model ? String(row.model) : null,
    providerId: row.provider_id ? Number(row.provider_id) : null, modelConfigId: row.model_config_id ? Number(row.model_config_id) : null,
    providerName: providerRelation?.name ? String(providerRelation.name) : null,
    modelDisplayName: modelRelation?.display_name ? String(modelRelation.display_name) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), preview, messageCount,
  };
}

function inboxFromRow(row: Row): InboxItem { return { id: Number(row.id), content: String(row.content), status: row.status as InboxItem["status"], source: String(row.source), processedAt: row.processed_at ? String(row.processed_at) : null, convertedType: row.converted_type ? String(row.converted_type) : null, convertedId: row.converted_id === null ? null : Number(row.converted_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
function foodFromRow(row: Row): FoodLog { return { id:Number(row.id),occurredAt:String(row.occurred_at),mealType:row.meal_type as FoodLog["mealType"],title:String(row.title),description:String(row.description),portion:String(row.portion),scene:row.scene as FoodLog["scene"],estimatedKcal:row.estimated_kcal===null?null:Number(row.estimated_kcal),kcalMin:row.kcal_min===null?null:Number(row.kcal_min),kcalMax:row.kcal_max===null?null:Number(row.kcal_max),confidence:row.confidence as FoodLog["confidence"],notes:String(row.notes),imageUrl:row.image_url?String(row.image_url):null,attachmentId:row.attachment_id?String(row.attachment_id):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)}; }
function libraryFromRow(row: Row): FoodLibraryItem { return {id:Number(row.id),name:String(row.name),brand:String(row.brand),category:row.category as FoodLibraryItem["category"],defaultPortion:String(row.default_portion),referenceType:row.reference_type as FoodLibraryItem["referenceType"],referenceEnergyKj:row.reference_energy_kj===null?null:Number(row.reference_energy_kj),referenceKcal:row.reference_kcal===null?null:Number(row.reference_kcal),servingWeight:row.serving_weight===null?null:Number(row.serving_weight),servingKcal:row.serving_kcal===null?null:Number(row.serving_kcal),dataSource:row.data_source as FoodLibraryItem["dataSource"],notes:String(row.notes),updatedAt:String(row.updated_at)}; }
function drinkFromRow(row: Row): DrinkLog { return {id:Number(row.id),occurredAt:String(row.occurred_at),name:String(row.name),brand:String(row.brand),drinkType:row.drink_type as DrinkLog["drinkType"],volumeMl:row.volume_ml===null?null:Number(row.volume_ml),sugarLevel:String(row.sugar_level),caffeineMg:row.caffeine_mg===null?null:Number(row.caffeine_mg),estimatedKcal:row.estimated_kcal===null?null:Number(row.estimated_kcal),kcalMin:row.kcal_min===null?null:Number(row.kcal_min),kcalMax:row.kcal_max===null?null:Number(row.kcal_max),confidence:row.confidence as DrinkLog["confidence"],foodLibraryId:row.food_library_id===null?null:Number(row.food_library_id),notes:String(row.notes),createdAt:String(row.created_at),updatedAt:String(row.updated_at)}; }
function limitFromRow(row: Row): DrinkLimit { return {id:Number(row.id),name:String(row.name),targetType:String(row.target_type),period:row.period as DrinkLimit["period"],limitValue:Number(row.limit_value),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)}; }
function trackerFromRow(row:Row):Tracker{return{id:Number(row.id),name:String(row.name),icon:String(row.icon),iconType:(row.icon_type??"default") as Tracker["iconType"],iconValue:String(row.icon_value??""),groupName:String(row.group_name),timeType:row.time_type as Tracker["timeType"],quickCaptureEnabled:Boolean(row.quick_capture_enabled),dataSourceType:row.data_source_type as Tracker["dataSourceType"],sourceConfig:row.source_config&&typeof row.source_config==="object"?row.source_config as Record<string,unknown>:{},statsConfig:row.stats_config&&typeof row.stats_config==="object"?row.stats_config as Record<string,unknown>:{},createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function trackerFieldFromRow(row:Row):TrackerField{return{id:Number(row.id),trackerId:Number(row.tracker_id),key:String(row.field_key??`field_${row.id}`),name:String(row.name),type:row.type as TrackerField["type"],required:Boolean(row.required),defaultValue:row.default_value??null,options:Array.isArray(row.options_json)?row.options_json.map(String):[],showAfterQuickCapture:Boolean(row.show_after_quick_capture),includeInStats:Boolean(row.include_in_stats),sortOrder:Number(row.sort_order),unit:String(row.unit??""),precision:Number(row.precision??0),config:row.config_json&&typeof row.config_json==="object"?row.config_json as Record<string,unknown>:{},archivedAt:row.archived_at?String(row.archived_at):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function trackerEntryFromRow(row:Row):TrackerEntry{return{id:Number(row.id),trackerId:Number(row.tracker_id),occurredAt:String(row.occurred_at),endAt:row.end_at?String(row.end_at):null,values:row.values_json&&typeof row.values_json==="object"?row.values_json as Record<string,unknown>:{},note:String(row.note),sourceType:"native_tracker",createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function trackerGoalFromRow(row:Row):TrackerGoal{return{id:Number(row.id),trackerId:Number(row.tracker_id),operator:row.operator as TrackerGoal["operator"],targetValue:Number(row.target_value),periodType:row.period_type as TrackerGoal["periodType"],customPeriod:String(row.custom_period),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function trackerReminderFromRow(row:Row):TrackerReminder{return{id:Number(row.id),trackerId:Number(row.tracker_id),reminderType:row.reminder_type as TrackerReminder["reminderType"],scheduleRule:String(row.schedule_rule),intervalDays:row.interval_days===null?null:Number(row.interval_days),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)};}
function mappedPatch(input: Record<string, unknown>, map: Record<string, string>) { return Object.fromEntries(Object.entries(map).filter(([key]) => input[key] !== undefined).map(([key, column]) => [column, input[key]])); }

const defaultAiSettings: Omit<InternalAiSettings, "apiKey" | "hasApiKey" | "updatedAt"> = {
  providerPreset: "openai", providerName: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini",
  enabled: false, temperature: 0.6, systemPrompt: "", responseLength: "balanced", initiative: "quiet",
  allowSuggestions: true, allowTeasing: true, includeTasks: true, includeMemories: true, allowWriteActions: false,
  userDisplayName: "我", userAvatarType: "default", userAvatarValue: "",
  assistantDisplayName: "Eva", assistantAvatarType: "default", assistantAvatarValue: "",
  showUserName: true, showAssistantName: true, showAvatars: true,
  maskedApiKey: null,
  providerId: null, modelConfigId: null,
};

function settingsFromRows(row: Row | null, provider: Row | null, model: Row | null): InternalAiSettings {
  const apiKey = provider ? resolveAiApiKey({
    ciphertext: provider.api_key_ciphertext ? String(provider.api_key_ciphertext) : null,
    iv: provider.api_key_iv ? String(provider.api_key_iv) : null,
    authTag: provider.api_key_auth_tag ? String(provider.api_key_auth_tag) : null,
  }) : "";
  return {
    providerPreset: provider ? String(provider.provider_type) : row ? String(row.provider_preset) : defaultAiSettings.providerPreset,
    providerName: provider ? String(provider.name) : row ? String(row.provider_name) : defaultAiSettings.providerName,
    baseUrl: provider ? String(provider.base_url) : row ? String(row.base_url) : defaultAiSettings.baseUrl,
    model: model ? String(model.model_id) : row ? String(row.model) : defaultAiSettings.model,
    enabled: Boolean(provider?.enabled && model?.enabled),
    providerId: provider ? Number(provider.id) : null,
    modelConfigId: model ? Number(model.id) : null,
    temperature: row ? Number(row.temperature) : defaultAiSettings.temperature,
    systemPrompt: row ? String(row.system_prompt) : defaultAiSettings.systemPrompt,
    responseLength: row ? row.response_length as InternalAiSettings["responseLength"] : defaultAiSettings.responseLength,
    initiative: row ? row.initiative as InternalAiSettings["initiative"] : defaultAiSettings.initiative,
    allowSuggestions: row ? Boolean(row.allow_suggestions) : defaultAiSettings.allowSuggestions,
    allowTeasing: row ? Boolean(row.allow_teasing) : defaultAiSettings.allowTeasing,
    includeTasks: row ? Boolean(row.include_tasks) : defaultAiSettings.includeTasks,
    includeMemories: row ? Boolean(row.include_memories) : defaultAiSettings.includeMemories,
    allowWriteActions: row ? Boolean(row.allow_write_actions) : defaultAiSettings.allowWriteActions,
    userDisplayName: row ? String(row.user_display_name) : defaultAiSettings.userDisplayName,
    userAvatarType: row ? row.user_avatar_type as InternalAiSettings["userAvatarType"] : defaultAiSettings.userAvatarType,
    userAvatarValue: row ? String(row.user_avatar_value) : defaultAiSettings.userAvatarValue,
    assistantDisplayName: row ? String(row.assistant_display_name) : defaultAiSettings.assistantDisplayName,
    assistantAvatarType: row ? row.assistant_avatar_type as InternalAiSettings["assistantAvatarType"] : defaultAiSettings.assistantAvatarType,
    assistantAvatarValue: row ? String(row.assistant_avatar_value) : defaultAiSettings.assistantAvatarValue,
    showUserName: row ? Boolean(row.show_user_name) : defaultAiSettings.showUserName,
    showAssistantName: row ? Boolean(row.show_assistant_name) : defaultAiSettings.showAssistantName,
    showAvatars: row ? Boolean(row.show_avatars) : defaultAiSettings.showAvatars,
    apiKey, hasApiKey: Boolean(apiKey), maskedApiKey: null,
    updatedAt: row ? String(row.updated_at) : "",
  };
}

function modelFromRow(row: Row): AiModelConfig {
  const capabilities = row.capabilities && typeof row.capabilities === "object" ? row.capabilities as Record<string, unknown> : {};
  return { id:Number(row.id),providerId:Number(row.provider_id),modelId:String(row.model_id),displayName:String(row.display_name),enabled:Boolean(row.enabled),isDefault:Boolean(row.is_default),capabilities,createdAt:String(row.created_at),updatedAt:String(row.updated_at) };
}

function providerFromRow(row: Row, models: AiModelConfig[] = []): AiProvider {
  const apiKey = resolveAiApiKey({ ciphertext: row.api_key_ciphertext ? String(row.api_key_ciphertext) : null, iv: row.api_key_iv ? String(row.api_key_iv) : null, authTag: row.api_key_auth_tag ? String(row.api_key_auth_tag) : null });
  return { id:Number(row.id),name:String(row.name),providerType:String(row.provider_type),baseUrl:String(row.base_url),enabled:Boolean(row.enabled),hasApiKey:Boolean(apiKey),maskedApiKey:maskApiKey(apiKey),models,createdAt:String(row.created_at),updatedAt:String(row.updated_at) };
}

function internalProviderFromRow(row: Row): InternalAiProvider {
  const apiKey = resolveAiApiKey({ ciphertext: row.api_key_ciphertext ? String(row.api_key_ciphertext) : null, iv: row.api_key_iv ? String(row.api_key_iv) : null, authTag: row.api_key_auth_tag ? String(row.api_key_auth_tag) : null });
  return { id:Number(row.id),name:String(row.name),providerType:String(row.provider_type),baseUrl:String(row.base_url),enabled:Boolean(row.enabled),apiKey,createdAt:String(row.created_at),updatedAt:String(row.updated_at) };
}

async function identity(client: SupabaseClient) {
  const { data, error } = await client.auth.getClaims();
  fail(error, "验证登录状态");
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLocaleLowerCase() : "";
  const expected = allowedEmail();
  if (!expected) throw new Error("EVAORBIT_ALLOWED_EMAIL 未配置；已拒绝访问私人数据");
  if (!userId || email !== expected) throw new Error("当前账户无权访问 EvaOrbit");
  return userId;
}

async function oneSession(client: SupabaseClient, row: Row) {
  const sessionId = Number(row.id);
  const [{ data: latest, error: latestError }, { count, error: countError }] = await Promise.all([
    client.from("chat_messages").select("content").eq("session_id", sessionId).order("id", { ascending: false }).limit(1).maybeSingle(),
    client.from("chat_messages").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
  ]);
  fail(latestError, "读取会话预览"); fail(countError, "统计会话消息");
  return sessionFromRow(row, latest?.content ? String(latest.content) : "", count ?? 0);
}

function buildSupabaseRepository(client: SupabaseClient, userId: string): EvaOrbitRepository {
  const runtimeSettings = async (modelConfigId: number | null = null) => {
    const [settingsResult, modelResult] = await Promise.all([
      client.from("ai_settings").select("*").maybeSingle(),
      modelConfigId
        ? client.from("ai_model_configs").select("*").eq("id", modelConfigId).maybeSingle()
        : client.from("ai_model_configs").select("*").eq("is_default", true).maybeSingle(),
    ]);
    fail(settingsResult.error, "读取 AI 设置"); fail(modelResult.error, "读取模型配置");
    if (modelConfigId && !modelResult.data) throw new ConflictError("当前会话选择的模型不存在");
    const model = modelResult.data as Row | null;
    const providerResult = model
      ? await client.from("ai_providers").select("*").eq("id", model.provider_id).maybeSingle()
      : { data: null, error: null };
    fail(providerResult.error, "读取 Provider");
    return settingsFromRows(settingsResult.data, providerResult.data as Row | null, model);
  };

  const repository: EvaOrbitRepository = {
    async listTasks(filter: TaskFilter = "all") {
      let query = client.from("tasks").select("*");
      if (filter === "open") query = query.eq("completed", false);
      if (filter === "done") query = query.eq("completed", true);
      const { data, error } = await query.order("completed").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
      fail(error, "读取任务");
      const priority = { high: 0, medium: 1, low: 2 };
      return (data as Row[]).map(taskFromRow).sort((a, b) => Number(a.completed) - Number(b.completed) || priority[a.priority] - priority[b.priority]);
    },
    async getTask(id) {
      const { data, error } = await client.from("tasks").select("*").eq("id", id).maybeSingle();
      fail(error, "读取任务"); return data ? taskFromRow(data) : null;
    },
    async createTask(input: NewTask) {
      const { data, error } = await client.from("tasks").insert({ user_id: userId, title: input.title, notes: input.notes, due_date: input.dueDate, priority: input.priority, tags: input.tags }).select().single();
      fail(error, "创建任务"); return taskFromRow(data);
    },
    async updateTask(id, input) {
      const map: Record<string, string> = { title: "title", notes: "notes", completed: "completed", dueDate: "due_date", priority: "priority", tags: "tags" };
      const patch = Object.fromEntries(Object.entries(map).filter(([key]) => input[key] !== undefined).map(([key, column]) => [column, input[key]]));
      if (!Object.keys(patch).length) return repository.getTask(id);
      const { data, error } = await client.from("tasks").update(patch).eq("id", id).select().maybeSingle();
      fail(error, "更新任务"); return data ? taskFromRow(data) : null;
    },
    async deleteTask(id) {
      const { data, error } = await client.from("tasks").delete().eq("id", id).select("id").maybeSingle();
      fail(error, "删除任务"); return Boolean(data);
    },
    async listMemories(query = "", category = "") {
      let request = client.from("memories").select("*");
      if (query) request = request.ilike("search_text", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
      if (category) request = request.eq("category", category);
      const { data, error } = await request.order("updated_at", { ascending: false }).order("id", { ascending: false });
      fail(error, "读取记忆"); return (data as Row[]).map(memoryFromRow);
    },
    async getMemory(id) {
      const { data, error } = await client.from("memories").select("*").eq("id", id).maybeSingle();
      fail(error, "读取记忆"); return data ? memoryFromRow(data) : null;
    },
    async createMemory(input) {
      const { data, error } = await client.from("memories").insert({ user_id: userId, ...input }).select().single();
      fail(error, "创建记忆"); return memoryFromRow(data);
    },
    async updateMemory(id, input) {
      const patch = Object.fromEntries(["title", "content", "category"].filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
      if (!Object.keys(patch).length) return repository.getMemory(id);
      const { data, error } = await client.from("memories").update(patch).eq("id", id).select().maybeSingle();
      fail(error, "更新记忆"); return data ? memoryFromRow(data) : null;
    },
    async deleteMemory(id) {
      const { data, error } = await client.from("memories").delete().eq("id", id).select("id").maybeSingle();
      fail(error, "删除记忆"); return Boolean(data);
    },
    async getDashboardSummary() {
      const [tasks, memories] = await Promise.all([repository.listTasks(), repository.listMemories()]);
      const today = new Date().toLocaleDateString("en-CA");
      return {
        openTasks: tasks.filter((task) => !task.completed).length,
        dueToday: tasks.filter((task) => !task.completed && task.dueDate === today).length,
        memories: memories.length,
        recentTasks: [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
        recentMemories: memories.slice(0, 3),
      };
    },
    async getUiPreferences() {
      const { data, error } = await client.from("ui_preferences").select("home_module_order,updated_at").maybeSingle();
      fail(error, "Read UI preferences");
      return { homeModuleOrder: normalizeHomeModuleOrder(data?.home_module_order), updatedAt: data?.updated_at ? String(data.updated_at) : "" };
    },
    async updateHomeModuleOrder(order: HomeModuleId[]) {
      const { data, error } = await client.from("ui_preferences").upsert({ user_id: userId, home_module_order: normalizeHomeModuleOrder(order) }, { onConflict: "user_id" }).select("home_module_order,updated_at").single();
      fail(error, "Save home module order");
      if (!data) throw new Error("Save home module order failed");
      return { homeModuleOrder: normalizeHomeModuleOrder(data.home_module_order), updatedAt: String(data.updated_at) };
    },
    async getAiSettings() {
      return runtimeSettings();
    },
    async updateAiSettings(input: AiSettingsInput) {
      const values: Row = {
        user_id: userId, temperature: input.temperature, system_prompt: input.systemPrompt,
        response_length: input.responseLength, initiative: input.initiative, allow_suggestions: input.allowSuggestions,
        allow_teasing: input.allowTeasing, include_tasks: input.includeTasks, include_memories: input.includeMemories,
        allow_write_actions: input.allowWriteActions,
        user_display_name: input.userDisplayName, user_avatar_type: input.userAvatarType, user_avatar_value: input.userAvatarValue,
        assistant_display_name: input.assistantDisplayName, assistant_avatar_type: input.assistantAvatarType, assistant_avatar_value: input.assistantAvatarValue,
        show_user_name: input.showUserName, show_assistant_name: input.showAssistantName, show_avatars: input.showAvatars,
      };
      const { error } = await client.from("ai_settings").upsert(values, { onConflict: "user_id" });
      fail(error, "保存 AI 设置");
      return runtimeSettings();
    },
    async updateChatPreferences(input) {
      const { error } = await client.from("ai_settings").upsert({
        user_id: userId,
        user_display_name: input.userDisplayName, user_avatar_type: input.userAvatarType, user_avatar_value: input.userAvatarValue,
        assistant_display_name: input.assistantDisplayName, assistant_avatar_type: input.assistantAvatarType, assistant_avatar_value: input.assistantAvatarValue,
        show_user_name: input.showUserName, show_assistant_name: input.showAssistantName, show_avatars: input.showAvatars,
      }, { onConflict: "user_id" });
      fail(error, "保存对话身份");
      return runtimeSettings();
    },
    async getAiRuntimeSettings(modelConfigId) { return runtimeSettings(modelConfigId ?? null); },
    async listAiProviders() {
      const [{ data: providers, error: providerError }, { data: models, error: modelError }] = await Promise.all([
        client.from("ai_providers").select("*").order("enabled", { ascending: false }).order("updated_at", { ascending: false }),
        client.from("ai_model_configs").select("*").order("is_default", { ascending: false }).order("display_name"),
      ]);
      fail(providerError, "读取 Providers"); fail(modelError, "读取模型配置");
      const parsedModels = (models as Row[]).map(modelFromRow);
      return (providers as Row[]).map((row) => providerFromRow(row, parsedModels.filter((model) => model.providerId === Number(row.id))));
    },
    async getAiProvider(id) {
      const { data, error } = await client.from("ai_providers").select("*").eq("id", id).maybeSingle();
      fail(error, "读取 Provider"); return data ? internalProviderFromRow(data) : null;
    },
    async createAiProvider(input: AiProviderInput) {
      const encrypted = input.apiKey ? encryptAiApiKey(input.apiKey) : { ciphertext: null, iv: null, authTag: null };
      const { data, error } = await client.from("ai_providers").insert({ user_id:userId,name:input.name,provider_type:input.providerType,base_url:input.baseUrl,enabled:input.enabled,api_key_ciphertext:encrypted.ciphertext,api_key_iv:encrypted.iv,api_key_auth_tag:encrypted.authTag }).select().single();
      fail(error, "创建 Provider"); return providerFromRow(data);
    },
    async updateAiProvider(id, input: AiProviderInput) {
      const current = await repository.getAiProvider(id); if (!current) return null;
      if (!input.enabled) {
        const { count, error } = await client.from("ai_model_configs").select("id", { count:"exact", head:true }).eq("provider_id", id).eq("is_default", true);
        fail(error, "检查默认模型"); if (count) throw new ConflictError("这个 Provider 正在承载全局默认模型，请先更换默认模型");
      }
      const secret = input.clearApiKey ? {api_key_ciphertext:null,api_key_iv:null,api_key_auth_tag:null} : input.apiKey !== undefined ? (()=>{const encrypted=encryptAiApiKey(input.apiKey!);return{api_key_ciphertext:encrypted.ciphertext,api_key_iv:encrypted.iv,api_key_auth_tag:encrypted.authTag};})() : {};
      const { data, error } = await client.from("ai_providers").update({name:input.name,provider_type:input.providerType,base_url:input.baseUrl,enabled:input.enabled,...secret}).eq("id",id).select().maybeSingle();
      fail(error,"保存 Provider"); return data ? providerFromRow(data,(await repository.listAiProviders()).find((provider)=>provider.id===id)?.models ?? []) : null;
    },
    async deleteAiProvider(id) {
      const [{count:sessions,error:sessionError},{count:messages,error:messageError},{count:defaults,error:defaultError}] = await Promise.all([
        client.from("chat_sessions").select("id",{count:"exact",head:true}).eq("provider_id",id),
        client.from("chat_messages").select("id",{count:"exact",head:true}).eq("provider_id",id),
        client.from("ai_model_configs").select("id",{count:"exact",head:true}).eq("provider_id",id).eq("is_default",true),
      ]); fail(sessionError,"检查会话引用");fail(messageError,"检查消息引用");fail(defaultError,"检查默认模型");
      if(defaults)throw new ConflictError("这个 Provider 正在承载全局默认模型，请先把另一个模型设为默认");
      if ((sessions??0)+(messages??0)>0) throw new ConflictError(`这个 Provider 仍被 ${(sessions??0)+(messages??0)} 条会话或消息使用，不能删除；可以先停用`);
      const {data,error}=await client.from("ai_providers").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Provider");return Boolean(data);
    },
    async createAiModelConfig(providerId, input: AiModelConfigInput) {
      const providers=await repository.listAiProviders(); const provider=providers.find((item)=>item.id===providerId); if(!provider) throw new ConflictError("Provider 不存在");
      const makeDefault=input.isDefault || (!providers.some((item)=>item.models.some((model)=>model.isDefault)) && input.enabled && provider.enabled);
      const {data,error}=await client.from("ai_model_configs").insert({user_id:userId,provider_id:providerId,model_id:input.modelId,display_name:input.displayName,enabled:input.enabled,is_default:false,capabilities:input.capabilities}).select().single();fail(error,"添加模型");
      if(makeDefault){const{error:defaultError}=await client.rpc("set_ai_default_model",{p_model_id:Number(data.id)});fail(defaultError,"设置默认模型");data.is_default=true;}
      return modelFromRow(data);
    },
    async updateAiModelConfig(id, input: AiModelConfigInput) {
      const {data:current,error:currentError}=await client.from("ai_model_configs").select("*").eq("id",id).maybeSingle();fail(currentError,"读取模型配置");if(!current)return null;
      if(Boolean(current.is_default)&&(!input.isDefault||!input.enabled)) throw new ConflictError("请先把另一个已启用模型设为全局默认，再停用或取消当前默认模型");
      if(input.isDefault){const provider=await repository.getAiProvider(Number(current.provider_id));if(!provider?.enabled||!input.enabled)throw new ConflictError("只有已启用 Provider 下的已启用模型可以设为默认");const{error}=await client.rpc("set_ai_default_model",{p_model_id:id});fail(error,"更新默认模型");}
      const{data,error}=await client.from("ai_model_configs").update({model_id:input.modelId,display_name:input.displayName,enabled:input.enabled,is_default:input.isDefault,capabilities:input.capabilities}).eq("id",id).select().maybeSingle();fail(error,"保存模型");return data?modelFromRow(data):null;
    },
    async deleteAiModelConfig(id) {
      const [{count:sessions,error:sessionError},{count:messages,error:messageError},{data:current,error:currentError}] = await Promise.all([client.from("chat_sessions").select("id",{count:"exact",head:true}).eq("model_config_id",id),client.from("chat_messages").select("id",{count:"exact",head:true}).eq("model_config_id",id),client.from("ai_model_configs").select("is_default").eq("id",id).maybeSingle()]);fail(sessionError,"检查会话引用");fail(messageError,"检查消息引用");fail(currentError,"读取模型配置");if(!current)return false;if(current.is_default)throw new ConflictError("这是全局默认模型，请先把另一个模型设为默认");if((sessions??0)+(messages??0)>0)throw new ConflictError(`这个模型仍被 ${(sessions??0)+(messages??0)} 条会话或消息使用，不能删除；可以先停用`);
      const{data,error}=await client.from("ai_model_configs").delete().eq("id",id).select("id,is_default").maybeSingle();fail(error,"删除模型");
      if(data?.is_default){const{data:replacement,error:replacementError}=await client.from("ai_model_configs").select("id,ai_providers!inner(enabled)").eq("enabled",true).eq("ai_providers.enabled",true).order("id").limit(1).maybeSingle();fail(replacementError,"选择默认模型");if(replacement)await client.from("ai_model_configs").update({is_default:true}).eq("id",replacement.id);}
      return Boolean(data);
    },
    async listChatSessions() {
      const { data, error } = await client.from("chat_sessions").select("*,ai_providers(name),ai_model_configs(display_name)").order("updated_at", { ascending: false }).order("id", { ascending: false });
      fail(error, "读取会话"); return Promise.all((data as Row[]).map((row) => oneSession(client, row)));
    },
    async getChatSession(id) {
      const { data, error } = await client.from("chat_sessions").select("*,ai_providers(name),ai_model_configs(display_name)").eq("id", id).maybeSingle();
      fail(error, "读取会话"); return data ? oneSession(client, data) : null;
    },
    async createChatSession(title = "New conversation", requestedModelConfigId) {
      const {data:model,error:modelError}=requestedModelConfigId
        ? await client.from("ai_model_configs").select("*").eq("id",requestedModelConfigId).maybeSingle()
        : await client.from("ai_model_configs").select("*").eq("is_default",true).maybeSingle();
      fail(modelError,"读取默认模型");if(requestedModelConfigId&&(!model||!model.enabled))throw new ConflictError("选择的模型不存在或已停用");
      if(model){const{data:provider,error:providerError}=await client.from("ai_providers").select("enabled").eq("id",model.provider_id).maybeSingle();fail(providerError,"读取 Provider");if(!provider?.enabled)throw new ConflictError("这个模型所属的 Provider 已停用");}
      const { data, error } = await client.from("chat_sessions").insert({ user_id: userId, title, provider_id:model?.provider_id??null,model_config_id:model?.id??null,model:model?.model_id??null }).select("*,ai_providers(name),ai_model_configs(display_name)").single();
      fail(error, "创建会话"); return sessionFromRow(data);
    },
    async updateChatSession(id, input) {
      const patch:Row={};if(input.title!==undefined)patch.title=input.title;
      if(input.modelConfigId!==undefined){const{data:model,error:modelError}=await client.from("ai_model_configs").select("*,ai_providers(enabled)").eq("id",input.modelConfigId).maybeSingle();fail(modelError,"读取模型配置");const provider=model?.ai_providers as Row|undefined;if(!model||!model.enabled||!provider?.enabled)throw new ConflictError("选择的模型不存在或已停用");patch.provider_id=model.provider_id;patch.model_config_id=model.id;patch.model=model.model_id;}
      const { data, error } = await client.from("chat_sessions").update(patch).eq("id", id).select("*,ai_providers(name),ai_model_configs(display_name)").maybeSingle();
      fail(error, "更新会话"); return data ? oneSession(client, data) : null;
    },
    async deleteChatSession(id) {
      const { data, error } = await client.from("chat_sessions").delete().eq("id", id).select("id").maybeSingle();
      fail(error, "删除会话"); return Boolean(data);
    },
    async listChatMessages(sessionId) {
      const { data, error } = await client.from("chat_messages").select("*").eq("session_id", sessionId).order("id");
      fail(error, "读取消息"); return (data as Row[]).map(messageFromRow);
    },
    async addChatMessage(sessionId, role, content, model = null, providerId = null, modelConfigId = null) {
      const { data, error } = await client.from("chat_messages").insert({ user_id: userId, session_id: sessionId, role, content, model, provider_id:providerId, model_config_id:modelConfigId }).select().single();
      fail(error, "保存消息");
      const sessionPatch = model ? { model } : { updated_at: new Date().toISOString() };
      const { error: sessionError } = await client.from("chat_sessions").update(sessionPatch).eq("id", sessionId);
      fail(sessionError, "更新会话"); return messageFromRow(data);
    },
    async listInbox(status = "inbox") {
      let request = client.from("inbox_items").select("*"); if (status !== "all") request = request.eq("status", status);
      const { data, error } = await request.order("created_at", { ascending: false }).order("id", { ascending: false }); fail(error,"读取 Inbox"); return (data as Row[]).map(inboxFromRow);
    },
    async getInboxItem(id) { const {data,error}=await client.from("inbox_items").select("*").eq("id",id).maybeSingle();fail(error,"读取 Inbox");return data?inboxFromRow(data):null; },
    async createInboxItem(input) { const {data,error}=await client.from("inbox_items").insert({user_id:userId,content:input.content,source:input.source}).select().single();fail(error,"写入 Inbox");return inboxFromRow(data); },
    async updateInboxItem(id,input) { const patch=mappedPatch(input,{content:"content",status:"status",processedAt:"processed_at",convertedType:"converted_type",convertedId:"converted_id"});if(!Object.keys(patch).length)return repository.getInboxItem(id);const{data,error}=await client.from("inbox_items").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Inbox");return data?inboxFromRow(data):null; },
    async deleteInboxItem(id){const{data,error}=await client.from("inbox_items").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Inbox");return Boolean(data);},
    async listFoodLogs(input={}) { let request=client.from("food_logs").select("*");if(input.query)request=request.ilike("search_text",`%${input.query.replace(/[\\%_]/g,"\\$&")}%`);if(input.mealType)request=request.eq("meal_type",input.mealType);if(input.from)request=request.gte("occurred_at",input.from);if(input.to)request=request.lt("occurred_at",input.to);const{data,error}=await request.order("occurred_at",{ascending:false}).order("id",{ascending:false});fail(error,"读取饮食记录");return(data as Row[]).map(foodFromRow);},
    async getFoodLog(id){const{data,error}=await client.from("food_logs").select("*").eq("id",id).maybeSingle();fail(error,"读取饮食记录");return data?foodFromRow(data):null;},
    async createFoodLog(input){const{data,error}=await client.from("food_logs").insert({user_id:userId,occurred_at:input.occurredAt,meal_type:input.mealType,title:input.title,description:input.description,portion:input.portion,scene:input.scene,estimated_kcal:input.estimatedKcal,kcal_min:input.kcalMin,kcal_max:input.kcalMax,confidence:input.confidence,notes:input.notes,image_url:input.imageUrl,attachment_id:input.attachmentId}).select().single();fail(error,"创建饮食记录");return foodFromRow(data);},
    async updateFoodLog(id,input){const patch=mappedPatch(input,{occurredAt:"occurred_at",mealType:"meal_type",title:"title",description:"description",portion:"portion",scene:"scene",estimatedKcal:"estimated_kcal",kcalMin:"kcal_min",kcalMax:"kcal_max",confidence:"confidence",notes:"notes",imageUrl:"image_url",attachmentId:"attachment_id"});if(!Object.keys(patch).length)return repository.getFoodLog(id);const{data,error}=await client.from("food_logs").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新饮食记录");return data?foodFromRow(data):null;},
    async deleteFoodLog(id){const{data,error}=await client.from("food_logs").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除饮食记录");return Boolean(data);},
    async searchFoodLibrary(query="",brand=""){let request=client.from("food_library").select("*");if(query)request=request.ilike("name",`%${query.replace(/[\\%_]/g,"\\$&")}%`);if(brand)request=request.eq("brand",brand);const{data,error}=await request.order("updated_at",{ascending:false}).limit(100);fail(error,"搜索 Food Library");return(data as Row[]).map(libraryFromRow);},
    async upsertFoodLibraryItem(input){const values={user_id:userId,name:input.name,brand:input.brand,category:input.category,default_portion:input.defaultPortion,reference_type:input.referenceType,reference_energy_kj:input.referenceEnergyKj,reference_kcal:input.referenceKcal,serving_weight:input.servingWeight,serving_kcal:input.servingKcal,data_source:input.dataSource,notes:input.notes};const{data,error}=await client.from("food_library").upsert(values,{onConflict:"user_id,name,brand"}).select().single();fail(error,"保存 Food Library");return libraryFromRow(data);},
    async listDrinkLogs(input={}){let request=client.from("drink_logs").select("*");if(input.from)request=request.gte("occurred_at",input.from);if(input.to)request=request.lt("occurred_at",input.to);if(input.drinkType)request=request.eq("drink_type",input.drinkType);const{data,error}=await request.order("occurred_at",{ascending:false}).order("id",{ascending:false});fail(error,"读取饮品记录");return(data as Row[]).map(drinkFromRow);},
    async getDrinkLog(id){const{data,error}=await client.from("drink_logs").select("*").eq("id",id).maybeSingle();fail(error,"读取饮品记录");return data?drinkFromRow(data):null;},
    async createDrinkLog(input){const{data,error}=await client.from("drink_logs").insert({user_id:userId,occurred_at:input.occurredAt,name:input.name,brand:input.brand,drink_type:input.drinkType,volume_ml:input.volumeMl,sugar_level:input.sugarLevel,caffeine_mg:input.caffeineMg,estimated_kcal:input.estimatedKcal,kcal_min:input.kcalMin,kcal_max:input.kcalMax,confidence:input.confidence,food_library_id:input.foodLibraryId,notes:input.notes}).select().single();fail(error,"创建饮品记录");return drinkFromRow(data);},
    async updateDrinkLog(id,input){const patch=mappedPatch(input,{occurredAt:"occurred_at",name:"name",brand:"brand",drinkType:"drink_type",volumeMl:"volume_ml",sugarLevel:"sugar_level",caffeineMg:"caffeine_mg",estimatedKcal:"estimated_kcal",kcalMin:"kcal_min",kcalMax:"kcal_max",confidence:"confidence",foodLibraryId:"food_library_id",notes:"notes"});if(!Object.keys(patch).length)return repository.getDrinkLog(id);const{data,error}=await client.from("drink_logs").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新饮品记录");return data?drinkFromRow(data):null;},
    async deleteDrinkLog(id){const{data,error}=await client.from("drink_logs").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除饮品记录");return Boolean(data);},
    async listDrinkLimits(){const{data,error}=await client.from("drink_limits").select("*").order("enabled",{ascending:false}).order("id");fail(error,"读取饮品限制");return(data as Row[]).map(limitFromRow);},
    async createDrinkLimit(input){const{data,error}=await client.from("drink_limits").insert({user_id:userId,name:input.name,target_type:input.targetType,period:input.period,limit_value:input.limitValue,enabled:input.enabled}).select().single();fail(error,"创建饮品限制");return limitFromRow(data);},
    async updateDrinkLimit(id,input){const patch=mappedPatch(input,{name:"name",targetType:"target_type",period:"period",limitValue:"limit_value",enabled:"enabled"});const{data,error}=await client.from("drink_limits").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新饮品限制");return data?limitFromRow(data):null;},
    async deleteDrinkLimit(id){const{data,error}=await client.from("drink_limits").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除饮品限制");return Boolean(data);},
    async listTrackers(){const{data,error}=await client.from("trackers").select("*").order("group_name").order("name");fail(error,"读取 Trackers");return(data as Row[]).map(trackerFromRow);},
    async getTracker(id){const{data,error}=await client.from("trackers").select("*").eq("id",id).maybeSingle();fail(error,"读取 Tracker");return data?trackerFromRow(data):null;},
    async createTracker(input){const{data,error}=await client.from("trackers").insert({user_id:userId,name:input.name,icon:input.icon,icon_type:input.iconType,icon_value:input.iconValue,group_name:input.groupName,time_type:"point",quick_capture_enabled:input.quickCaptureEnabled,data_source_type:input.dataSourceType,source_config:input.sourceConfig,stats_config:input.statsConfig}).select().single();fail(error,"创建 Tracker");return trackerFromRow(data);},
    async updateTracker(id,input){const patch=mappedPatch(input,{name:"name",icon:"icon",iconType:"icon_type",iconValue:"icon_value",groupName:"group_name",quickCaptureEnabled:"quick_capture_enabled",dataSourceType:"data_source_type",sourceConfig:"source_config",statsConfig:"stats_config"});if(!Object.keys(patch).length)return repository.getTracker(id);const{data,error}=await client.from("trackers").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Tracker");return data?trackerFromRow(data):null;},
    async deleteTracker(id){const{data,error}=await client.from("trackers").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Tracker");return Boolean(data);},
    async listTrackerFields(trackerId){const{data,error}=await client.from("tracker_fields").select("*").eq("tracker_id",trackerId).order("sort_order").order("id");fail(error,"读取 Tracker 字段");return(data as Row[]).map(trackerFieldFromRow);},
    async createTrackerField(input){const{data,error}=await client.from("tracker_fields").insert({user_id:userId,tracker_id:input.trackerId,field_key:input.key,name:input.name,type:input.type,required:input.required,default_value:input.defaultValue,options_json:input.options,show_after_quick_capture:input.showAfterQuickCapture,include_in_stats:input.includeInStats,sort_order:input.sortOrder,unit:input.unit,precision:input.precision,config_json:input.config,archived_at:input.archivedAt}).select().single();fail(error,"创建 Tracker 字段");return trackerFieldFromRow(data);},
    async deleteTrackerField(id){const{data,error}=await client.from("tracker_fields").update({archived_at:new Date().toISOString()}).eq("id",id).is("archived_at",null).select("id").maybeSingle();fail(error,"归档 Tracker 字段");return Boolean(data);},
    async listTrackerEntries(trackerId,input={}){let request=client.from("tracker_entries").select("*");if(trackerId!==undefined)request=request.eq("tracker_id",trackerId);if(input.from)request=request.gte("occurred_at",input.from);if(input.to)request=request.lt("occurred_at",input.to);const{data,error}=await request.order("occurred_at",{ascending:false}).order("id",{ascending:false});fail(error,"读取 Tracker 记录");const entries=(data as Row[]).map(trackerEntryFromRow);if(!input.query)return entries;const query=input.query.toLocaleLowerCase();return entries.filter((entry)=>`${entry.note} ${JSON.stringify(entry.values)}`.toLocaleLowerCase().includes(query));},
    async getTrackerEntry(id){const{data,error}=await client.from("tracker_entries").select("*").eq("id",id).maybeSingle();fail(error,"读取 Tracker 记录");return data?trackerEntryFromRow(data):null;},
    async createTrackerEntry(input){const{data,error}=await client.from("tracker_entries").insert({user_id:userId,tracker_id:input.trackerId,occurred_at:input.occurredAt,end_at:input.endAt,values_json:input.values,note:input.note}).select().single();fail(error,"创建 Tracker 记录");return trackerEntryFromRow(data);},
    async updateTrackerEntry(id,input){const patch=mappedPatch(input,{occurredAt:"occurred_at",endAt:"end_at",values:"values_json",note:"note"});if(!Object.keys(patch).length)return repository.getTrackerEntry(id);const{data,error}=await client.from("tracker_entries").update(patch).eq("id",id).select().maybeSingle();fail(error,"更新 Tracker 记录");return data?trackerEntryFromRow(data):null;},
    async deleteTrackerEntry(id){const{data,error}=await client.from("tracker_entries").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Tracker 记录");return Boolean(data);},
    async listTrackerGoals(trackerId){const{data,error}=await client.from("tracker_goals").select("*").eq("tracker_id",trackerId).order("enabled",{ascending:false}).order("id");fail(error,"读取 Tracker Goal");return(data as Row[]).map(trackerGoalFromRow);},
    async createTrackerGoal(input){const{data,error}=await client.from("tracker_goals").insert({user_id:userId,tracker_id:input.trackerId,operator:input.operator,target_value:input.targetValue,period_type:input.periodType,custom_period:input.customPeriod,enabled:input.enabled}).select().single();fail(error,"创建 Tracker Goal");return trackerGoalFromRow(data);},
    async deleteTrackerGoal(id){const{data,error}=await client.from("tracker_goals").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Tracker Goal");return Boolean(data);},
    async listTrackerReminders(trackerId){const{data,error}=await client.from("tracker_reminders").select("*").eq("tracker_id",trackerId).order("enabled",{ascending:false}).order("id");fail(error,"读取 Tracker Reminder");return(data as Row[]).map(trackerReminderFromRow);},
    async createTrackerReminder(input){const{data,error}=await client.from("tracker_reminders").insert({user_id:userId,tracker_id:input.trackerId,reminder_type:input.reminderType,schedule_rule:input.scheduleRule,interval_days:input.intervalDays,enabled:input.enabled}).select().single();fail(error,"创建 Tracker Reminder");return trackerReminderFromRow(data);},
    async deleteTrackerReminder(id){const{data,error}=await client.from("tracker_reminders").delete().eq("id",id).select("id").maybeSingle();fail(error,"删除 Tracker Reminder");return Boolean(data);},
    async getNutritionSettings(date){const{data,error}=await client.from("daily_nutrition_summaries").select("resting_energy_kcal,active_energy_kcal,notes").eq("date",date).maybeSingle();fail(error,"读取能量设置");return{restingEnergyKcal:data?.resting_energy_kcal===null||data?.resting_energy_kcal===undefined?null:Number(data.resting_energy_kcal),activeEnergyKcal:data?.active_energy_kcal===null||data?.active_energy_kcal===undefined?null:Number(data.active_energy_kcal),notes:data?String(data.notes):""};},
    async updateNutritionSettings(date,input){const{error}=await client.from("daily_nutrition_summaries").upsert({date,user_id:userId,resting_energy_kcal:input.restingEnergyKcal,active_energy_kcal:input.activeEnergyKcal,notes:input.notes},{onConflict:"date,user_id"});fail(error,"保存能量设置");},
    async autoTitleChatSession(id, content) {
      const session = await repository.getChatSession(id);
      if (!session || session.messageCount > 1 || !["新对话", "New conversation"].includes(session.title)) return;
      const compact = content.replace(/\s+/g, " ").trim();
      const title = compact.length > 28 ? `${compact.slice(0, 28)}…` : compact;
      const { error } = await client.from("chat_sessions").update({ title }).eq("id", id);
      fail(error, "生成会话标题");
    },
  };
  return repository;
}

export async function createSupabaseRepository(): Promise<EvaOrbitRepository> {
  const client = await createSupabaseServerClient();
  return buildSupabaseRepository(client, await identity(client));
}

export async function createMcpSupabaseRepository(): Promise<EvaOrbitRepository> {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const expectedEmail = allowedEmail();
  console.info("[mcp-diagnostic]", {
    stage: "supabase_config_present",
    supabase_url: Boolean(process.env.SUPABASE_URL?.trim()),
    supabase_secret_key: Boolean(secretKey),
    allowed_email: Boolean(expectedEmail),
  });
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY 未配置；远程 MCP 无法访问私人数据");
  if (!expectedEmail) throw new Error("EVAORBIT_ALLOWED_EMAIL 未配置；已拒绝 MCP 访问私人数据");
  const { url } = supabaseConfig();
  const client = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  console.info("[mcp-diagnostic]", { stage: "admin_list_users_start" });
  let result: Awaited<ReturnType<typeof client.auth.admin.listUsers>>;
  try {
    result = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  } catch (error) {
    console.error("[mcp-diagnostic]", { stage: "admin_list_users_failed", ...safeDiagnosticError(error) });
    throw error;
  }
  const { data, error } = result;
  if (error) console.error("[mcp-diagnostic]", { stage: "admin_list_users_failed", ...safeDiagnosticError(error) });
  fail(error, "识别 MCP 用户");
  console.info("[mcp-diagnostic]", { stage: "admin_list_users_success", users_count: data.users.length });
  const user = data.users.find((candidate) => candidate.email?.toLocaleLowerCase() === expectedEmail);
  console.info("[mcp-diagnostic]", { stage: "allowed_user_found", found: Boolean(user) });
  if (!user) throw new Error("EVAORBIT_ALLOWED_EMAIL 对应的 Supabase Auth 用户不存在");
  return buildSupabaseRepository(client, user.id);
}

function safeDiagnosticError(error: unknown) {
  if (!error || typeof error !== "object") return { error_name: "UnknownError" };
  const value = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  const message = typeof value.message === "string"
    ? value.message.replace(/https?:\/\/\S+/gi, "[redacted-url]").replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[redacted-email]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 300)
    : undefined;
  return {
    error_name: typeof value.name === "string" ? value.name : "Error",
    status: typeof value.status === "number" || typeof value.status === "string" ? value.status : undefined,
    code: typeof value.code === "string" ? value.code : undefined,
    message,
  };
}
