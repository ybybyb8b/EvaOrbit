import type { ChatMessage } from "./types";
import type { InternalAiSettings } from "./repositories/types";
import { aiToolDefinitions } from "./ai-tool-definitions.ts";
import { ExternalApiError } from "./errors.ts";
import { readSelfPersona, selectRelevantMemories, selectRelevantTasks } from "./persona.ts";
import { EVAORBIT_TIME_ZONE } from "./time.ts";

export type ProviderMessage = {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};

type PromptContext = { module?: string; sessionTitle?: string; omittedMessages?: number };
type PromptResources = { tasks: import("./types").Task[]; memories: import("./types").Memory[] };

function endpoint(baseUrl: string, pathname: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
}

function providerHeaders(settings: InternalAiSettings) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  if (settings.providerPreset === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "EvaOrbit";
  }
  return headers;
}

export function publicAiSettings(settings: InternalAiSettings) {
  return {
    providerPreset: settings.providerPreset, providerName: settings.providerName, baseUrl: settings.baseUrl,
    model: settings.model, hasApiKey: settings.hasApiKey, maskedApiKey: maskApiKey(settings.apiKey),
    enabled: settings.enabled, temperature: settings.temperature,
    systemPrompt: settings.systemPrompt, responseLength: settings.responseLength, initiative: settings.initiative,
    allowSuggestions: settings.allowSuggestions, allowTeasing: settings.allowTeasing,
    includeTasks: settings.includeTasks, includeMemories: settings.includeMemories,
    allowWriteActions: settings.allowWriteActions, updatedAt: settings.updatedAt,
    userDisplayName: settings.userDisplayName, userAvatarType: settings.userAvatarType, userAvatarValue: settings.userAvatarValue,
    assistantDisplayName: settings.assistantDisplayName, assistantAvatarType: settings.assistantAvatarType, assistantAvatarValue: settings.assistantAvatarValue,
    showUserName: settings.showUserName, showAssistantName: settings.showAssistantName, showAvatars: settings.showAvatars,
  };
}

export function maskApiKey(apiKey: string) {
  if (!apiKey) return null;
  return `${"•".repeat(12)}${apiKey.slice(-4)}`;
}

export async function discoverModels(settings: InternalAiSettings, signal?: AbortSignal) {
  const response = await fetch(endpoint(settings.baseUrl, "models"), {
    headers: providerHeaders(settings),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw await providerError(response, "读取模型列表失败");
  const payload = await response.json() as { data?: Array<{ id?: unknown }> };
  const models = (payload.data ?? [])
    .map((item) => typeof item.id === "string" ? item.id : "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return [...new Set(models)].slice(0, 500);
}

function compact(value: string, max = 700) {
  const result = value.replace(/\s+/g, " ").trim();
  return result.length > max ? `${result.slice(0, max)}…` : result;
}

function currentTime() {
  return `${new Intl.DateTimeFormat("zh-CN", { dateStyle: "full", timeStyle: "short", timeZone: EVAORBIT_TIME_ZONE }).format(new Date())}（${EVAORBIT_TIME_ZONE}）`;
}

function lastUserMessage(messages: Array<ChatMessage | ProviderMessage>) {
  return [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

export function buildSystemPrompt(settings: InternalAiSettings, messages: Array<ChatMessage | ProviderMessage>, context: PromptContext = {}, resources: PromptResources = { tasks: [], memories: [] }) {
  const query = lastUserMessage(messages) ?? "";
  const tasks = settings.includeTasks ? selectRelevantTasks(resources.tasks, query) : [];
  const memories = settings.includeMemories ? selectRelevantMemories(resources.memories, query) : [];
  const lengthRule = settings.responseLength === "brief" ? "默认短答；能一句说清就不要展开。" : settings.responseLength === "detailed" ? "需要解释时可以充分展开，但不要凑长度。" : "默认适中；简单问题短答，复杂问题再展开。";
  const initiativeRule = settings.initiative === "quiet" ? "主动程度克制：先看清现状，不额外安排。" : settings.initiative === "active" ? "发现明确遗漏或风险时可以主动指出，但不要接管生活。" : "有明显价值时再主动补充一两点。";
  const voice = [
    lengthRule,
    initiativeRule,
    settings.allowSuggestions ? "必要时可以给建议，普通闲聊不强行给方案。" : "除非本人明确要求，不主动给建议或计划。",
    settings.allowTeasing ? "允许自然的轻吐槽；不要为了有趣而硬玩梗。" : "保持自然，但不要主动吐槽或玩梗。",
    settings.systemPrompt.trim() ? `本人补充的 Persona 说明：${settings.systemPrompt.trim()}` : "",
  ].filter(Boolean).join("\n");
  const taskContext = tasks.length
    ? tasks.map((task) => `- [${task.priority}] ${task.title}${task.dueDate ? `，截止 ${task.dueDate}` : ""}${task.notes ? `；${compact(task.notes, 240)}` : ""}`).join("\n")
    : "- 本次没有自动带入任务；需要时直接调用 list_tasks。";
  const memoryContext = memories.length
    ? memories.map((memory) => `- [${memory.category} · 更新于 ${memory.updatedAt}] ${memory.title}：${compact(memory.content)}`).join("\n")
    : settings.includeMemories ? "- 本次没有召回到相关 Memory。不要假装记得；需要时调用 search_memories。" : "- Memory 自动召回已关闭。";
  const tools = [
    "可读取 Tasks、Memory、Inbox、Food、Drinks、Food Library、Drink Limits 和每日摄入汇总。",
    "涉及本人今天/历史吃喝过什么、摄入多少、上次何时吃过时，以 Tool 返回的数据库事实为准，不凭聊天上下文猜。",
    "记录食物前优先检索 Food Library；品牌已知时必须匹配品牌，不同品牌不能默认等价。估算不确定时保留范围并降低可信度。",
    "饮品限制只报告数量和状态，措辞保持中性，不评价自律、健康或好坏。",
    settings.allowWriteActions ? "已允许按本人明确要求写入或整理上述数据。" : "写入权限关闭，不要声称已经修改数据。",
    "只有 Tool 明确返回成功后才能说操作完成。",
  ].join("\n");
  const currentContext = [
    `当前模块：${context.module ?? "EvaOrbit / 想想"}`,
    `Conversation UI 当前显示：user=${settings.userDisplayName}，assistant=${settings.assistantDisplayName}。这只是界面称呼，不是 Persona 或 Memory 事实，也不改变 user/assistant role。`,
    context.sessionTitle ? `当前话题：${context.sessionTitle}` : "",
    context.omittedMessages ? `为控制上下文，较早的 ${context.omittedMessages} 条消息本次未发送；不要假装看到了。` : "",
    `与当前问题相关的待办：\n${taskContext}`,
  ].filter(Boolean).join("\n");
  return [
    `[CORE IDENTITY]\n${readSelfPersona()}`,
    `[VOICE]\n${voice}`,
    `[CURRENT TIME]\n${currentTime()}`,
    `[RELEVANT MEMORY]\n${memoryContext}`,
    `[CURRENT CONTEXT]\n${currentContext}`,
    `[TOOLS]\n${tools}`,
  ].join("\n\n");
}

export function selectConversationHistory<T extends ChatMessage>(messages: T[], maxMessages = 28, maxCharacters = 45000) {
  const selected: T[] = [];
  let characters = 0;
  for (let index = messages.length - 1; index >= 0 && selected.length < maxMessages; index -= 1) {
    const message = messages[index];
    if (selected.length >= 2 && characters + message.content.length > maxCharacters) break;
    selected.unshift(message);
    characters += message.content.length;
  }
  return { messages: selected, omittedMessages: messages.length - selected.length };
}

export async function startChatCompletion(settings: InternalAiSettings, messages: Array<ChatMessage | ProviderMessage>, signal?: AbortSignal, context: PromptContext = {}, resources: PromptResources = { tasks: [], memories: [] }) {
  const response = await fetch(endpoint(settings.baseUrl, "chat/completions"), {
    method: "POST",
    headers: providerHeaders(settings),
    signal,
    body: JSON.stringify({
      model: settings.model,
      temperature: settings.temperature,
      stream: true,
      messages: [
        { role: "system", content: buildSystemPrompt(settings, messages, context, resources) },
        ...messages.map((message) => {
          if ("tool_call_id" in message || "tool_calls" in message) return message;
          return { role: message.role, content: message.content };
        }),
      ],
      tools: aiToolDefinitions,
      tool_choice: "auto",
    }),
  });
  if (!response.ok) throw await providerError(response, "模型请求失败");
  return response;
}

export async function providerError(response: Response, fallback: string) {
  // Provider bodies can echo request data. Never forward or log them because
  // that could expose the Authorization credential in an API response.
  await response.body?.cancel().catch(() => undefined);
  return new ExternalApiError(`${fallback}（Provider HTTP ${response.status}）`);
}

export function extractDelta(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown }; text?: unknown }> }).choices;
  const value = choices?.[0]?.delta?.content ?? choices?.[0]?.message?.content ?? choices?.[0]?.text;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => part && typeof part === "object" && "text" in part ? String(part.text) : "").join("");
  }
  return "";
}
