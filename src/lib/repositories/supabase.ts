import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedEmail } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import type { ChatMessage, ChatRole, ChatSession, DrinkLimit, DrinkLog, FoodLibraryItem, FoodLog, InboxItem, Memory, Task, TaskPriority } from "../types";
import type { AiSettingsInput, EvaOrbitRepository, InternalAiSettings, NewTask, TaskFilter } from "./types";

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
    content: String(row.content), model: row.model ? String(row.model) : null, createdAt: String(row.created_at),
  };
}

function sessionFromRow(row: Row, preview = "", messageCount = 0): ChatSession {
  return {
    id: Number(row.id), title: String(row.title), model: row.model ? String(row.model) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), preview, messageCount,
  };
}

function inboxFromRow(row: Row): InboxItem { return { id: Number(row.id), content: String(row.content), status: row.status as InboxItem["status"], source: String(row.source), processedAt: row.processed_at ? String(row.processed_at) : null, convertedType: row.converted_type ? String(row.converted_type) : null, convertedId: row.converted_id === null ? null : Number(row.converted_id), createdAt: String(row.created_at), updatedAt: String(row.updated_at) }; }
function foodFromRow(row: Row): FoodLog { return { id:Number(row.id),occurredAt:String(row.occurred_at),mealType:row.meal_type as FoodLog["mealType"],title:String(row.title),description:String(row.description),portion:String(row.portion),scene:row.scene as FoodLog["scene"],estimatedKcal:row.estimated_kcal===null?null:Number(row.estimated_kcal),kcalMin:row.kcal_min===null?null:Number(row.kcal_min),kcalMax:row.kcal_max===null?null:Number(row.kcal_max),confidence:row.confidence as FoodLog["confidence"],notes:String(row.notes),imageUrl:row.image_url?String(row.image_url):null,attachmentId:row.attachment_id?String(row.attachment_id):null,createdAt:String(row.created_at),updatedAt:String(row.updated_at)}; }
function libraryFromRow(row: Row): FoodLibraryItem { return {id:Number(row.id),name:String(row.name),brand:String(row.brand),category:row.category as FoodLibraryItem["category"],defaultPortion:String(row.default_portion),referenceType:row.reference_type as FoodLibraryItem["referenceType"],referenceEnergyKj:row.reference_energy_kj===null?null:Number(row.reference_energy_kj),referenceKcal:row.reference_kcal===null?null:Number(row.reference_kcal),servingWeight:row.serving_weight===null?null:Number(row.serving_weight),servingKcal:row.serving_kcal===null?null:Number(row.serving_kcal),dataSource:row.data_source as FoodLibraryItem["dataSource"],notes:String(row.notes),updatedAt:String(row.updated_at)}; }
function drinkFromRow(row: Row): DrinkLog { return {id:Number(row.id),occurredAt:String(row.occurred_at),name:String(row.name),brand:String(row.brand),drinkType:row.drink_type as DrinkLog["drinkType"],volumeMl:row.volume_ml===null?null:Number(row.volume_ml),sugarLevel:String(row.sugar_level),caffeineMg:row.caffeine_mg===null?null:Number(row.caffeine_mg),estimatedKcal:row.estimated_kcal===null?null:Number(row.estimated_kcal),kcalMin:row.kcal_min===null?null:Number(row.kcal_min),kcalMax:row.kcal_max===null?null:Number(row.kcal_max),confidence:row.confidence as DrinkLog["confidence"],foodLibraryId:row.food_library_id===null?null:Number(row.food_library_id),notes:String(row.notes),createdAt:String(row.created_at),updatedAt:String(row.updated_at)}; }
function limitFromRow(row: Row): DrinkLimit { return {id:Number(row.id),name:String(row.name),targetType:String(row.target_type),period:row.period as DrinkLimit["period"],limitValue:Number(row.limit_value),enabled:Boolean(row.enabled),createdAt:String(row.created_at),updatedAt:String(row.updated_at)}; }
function mappedPatch(input: Record<string, unknown>, map: Record<string, string>) { return Object.fromEntries(Object.entries(map).filter(([key]) => input[key] !== undefined).map(([key, column]) => [column, input[key]])); }

const defaultAiSettings: Omit<InternalAiSettings, "apiKey" | "hasApiKey" | "updatedAt"> = {
  providerPreset: "openai", providerName: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini",
  enabled: false, temperature: 0.6, systemPrompt: "", responseLength: "balanced", initiative: "quiet",
  allowSuggestions: true, allowTeasing: true, includeTasks: true, includeMemories: true, allowWriteActions: false,
  userDisplayName: "我", userAvatarType: "default", userAvatarValue: "",
  assistantDisplayName: "Eva", assistantAvatarType: "default", assistantAvatarValue: "",
  showUserName: true, showAssistantName: true, showAvatars: true,
  apiKeyManagedByEnvironment: true,
};

function settingsFromRow(row: Row | null): InternalAiSettings {
  const apiKey = process.env.AI_API_KEY?.trim() ?? "";
  return {
    providerPreset: row ? String(row.provider_preset) : defaultAiSettings.providerPreset,
    providerName: row ? String(row.provider_name) : defaultAiSettings.providerName,
    baseUrl: row ? String(row.base_url) : defaultAiSettings.baseUrl,
    model: row ? String(row.model) : defaultAiSettings.model,
    enabled: row ? Boolean(row.enabled) : defaultAiSettings.enabled,
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
    apiKey, hasApiKey: Boolean(apiKey), apiKeyManagedByEnvironment: true,
    updatedAt: row ? String(row.updated_at) : "",
  };
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

export async function createSupabaseRepository(): Promise<EvaOrbitRepository> {
  const client = await createSupabaseServerClient();
  const userId = await identity(client);

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
    async getAiSettings() {
      const { data, error } = await client.from("ai_settings").select("*").maybeSingle();
      fail(error, "读取 AI 设置"); return settingsFromRow(data);
    },
    async updateAiSettings(input: AiSettingsInput) {
      if (input.apiKey !== undefined) throw new Error("Supabase 模式的 AI API Key 只能通过服务器 AI_API_KEY 环境变量配置");
      const values: Row = {
        user_id: userId, provider_preset: input.providerPreset, provider_name: input.providerName, base_url: input.baseUrl,
        model: input.model, enabled: input.enabled, temperature: input.temperature, system_prompt: input.systemPrompt,
        response_length: input.responseLength, initiative: input.initiative, allow_suggestions: input.allowSuggestions,
        allow_teasing: input.allowTeasing, include_tasks: input.includeTasks, include_memories: input.includeMemories,
        allow_write_actions: input.allowWriteActions,
        user_display_name: input.userDisplayName, user_avatar_type: input.userAvatarType, user_avatar_value: input.userAvatarValue,
        assistant_display_name: input.assistantDisplayName, assistant_avatar_type: input.assistantAvatarType, assistant_avatar_value: input.assistantAvatarValue,
        show_user_name: input.showUserName, show_assistant_name: input.showAssistantName, show_avatars: input.showAvatars,
      };
      const { data, error } = await client.from("ai_settings").upsert(values, { onConflict: "user_id" }).select().single();
      fail(error, "保存 AI 设置");
      return settingsFromRow(data);
    },
    async updateChatPreferences(input) {
      const { data, error } = await client.from("ai_settings").upsert({
        user_id: userId,
        user_display_name: input.userDisplayName, user_avatar_type: input.userAvatarType, user_avatar_value: input.userAvatarValue,
        assistant_display_name: input.assistantDisplayName, assistant_avatar_type: input.assistantAvatarType, assistant_avatar_value: input.assistantAvatarValue,
        show_user_name: input.showUserName, show_assistant_name: input.showAssistantName, show_avatars: input.showAvatars,
      }, { onConflict: "user_id" }).select().single();
      fail(error, "保存对话身份");
      return settingsFromRow(data);
    },
    async listChatSessions() {
      const { data, error } = await client.from("chat_sessions").select("*").order("updated_at", { ascending: false }).order("id", { ascending: false });
      fail(error, "读取会话"); return Promise.all((data as Row[]).map((row) => oneSession(client, row)));
    },
    async getChatSession(id) {
      const { data, error } = await client.from("chat_sessions").select("*").eq("id", id).maybeSingle();
      fail(error, "读取会话"); return data ? oneSession(client, data) : null;
    },
    async createChatSession(title = "新对话") {
      const { data, error } = await client.from("chat_sessions").insert({ user_id: userId, title }).select().single();
      fail(error, "创建会话"); return sessionFromRow(data);
    },
    async updateChatSession(id, title) {
      const { data, error } = await client.from("chat_sessions").update({ title }).eq("id", id).select().maybeSingle();
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
    async addChatMessage(sessionId, role, content, model = null) {
      const { data, error } = await client.from("chat_messages").insert({ user_id: userId, session_id: sessionId, role, content, model }).select().single();
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
    async getNutritionSettings(date){const{data,error}=await client.from("daily_nutrition_summaries").select("resting_energy_kcal,active_energy_kcal,notes").eq("date",date).maybeSingle();fail(error,"读取能量设置");return{restingEnergyKcal:data?.resting_energy_kcal===null||data?.resting_energy_kcal===undefined?null:Number(data.resting_energy_kcal),activeEnergyKcal:data?.active_energy_kcal===null||data?.active_energy_kcal===undefined?null:Number(data.active_energy_kcal),notes:data?String(data.notes):""};},
    async updateNutritionSettings(date,input){const{error}=await client.from("daily_nutrition_summaries").upsert({date,user_id:userId,resting_energy_kcal:input.restingEnergyKcal,active_energy_kcal:input.activeEnergyKcal,notes:input.notes},{onConflict:"date,user_id"});fail(error,"保存能量设置");},
    async autoTitleChatSession(id, content) {
      const session = await repository.getChatSession(id);
      if (!session || session.messageCount > 1 || session.title !== "新对话") return;
      const compact = content.replace(/\s+/g, " ").trim();
      const title = compact.length > 28 ? `${compact.slice(0, 28)}…` : compact;
      const { error } = await client.from("chat_sessions").update({ title }).eq("id", id);
      fail(error, "生成会话标题");
    },
  };
  return repository;
}
