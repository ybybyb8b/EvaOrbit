import type { TaskPriority } from "./types";

export class ValidationError extends Error {}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("请求内容必须是对象");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number, required = true) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") throw new ValidationError(`${field} 格式不正确`);
  const result = value.trim();
  if (required && !result) throw new ValidationError(`${field} 不能为空`);
  if (result.length > max) throw new ValidationError(`${field} 不能超过 ${max} 个字符`);
  return result;
}

function dueDate(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError("截止日期格式不正确");
  }
  return value;
}

function priority(value: unknown): TaskPriority | undefined {
  if (value === undefined) return undefined;
  if (value !== "low" && value !== "medium" && value !== "high") {
    throw new ValidationError("优先级格式不正确");
  }
  return value;
}

function tags(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new ValidationError("标签格式不正确");
  }
  return [...new Set(value.map((tag) => tag.trim()).filter(Boolean))].slice(0, 10);
}

export function parseNewTask(value: unknown) {
  const body = objectValue(value);
  return {
    title: text(body.title, "任务标题", 160)!,
    notes: text(body.notes ?? "", "备注", 2000, false) ?? "",
    dueDate: dueDate(body.dueDate) ?? null,
    priority: priority(body.priority) ?? "medium",
    tags: tags(body.tags) ?? [],
  };
}

export function parseTaskPatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    title: body.title === undefined ? undefined : text(body.title, "任务标题", 160),
    notes: body.notes === undefined ? undefined : text(body.notes, "备注", 2000, false),
    completed:
      body.completed === undefined
        ? undefined
        : typeof body.completed === "boolean"
          ? body.completed
          : (() => { throw new ValidationError("完成状态格式不正确"); })(),
    dueDate: dueDate(body.dueDate),
    priority: priority(body.priority),
    tags: tags(body.tags),
  };
  if (Object.values(result).every((item) => item === undefined)) {
    throw new ValidationError("没有可更新的字段");
  }
  return result;
}

export function parseNewMemory(value: unknown) {
  const body = objectValue(value);
  return {
    title: text(body.title, "记忆标题", 160)!,
    content: text(body.content, "记忆内容", 10000)!,
    category: text(body.category ?? "其他", "分类", 40) || "其他",
  };
}

export function parseMemoryPatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    title: body.title === undefined ? undefined : text(body.title, "记忆标题", 160),
    content: body.content === undefined ? undefined : text(body.content, "记忆内容", 10000),
    category: body.category === undefined ? undefined : text(body.category, "分类", 40),
  };
  if (Object.values(result).every((item) => item === undefined)) {
    throw new ValidationError("没有可更新的字段");
  }
  return result;
}

function booleanValue(value: unknown, field: string, fallback: boolean) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new ValidationError(`${field}格式不正确`);
  return value;
}

function numberValue(value: unknown, field: string, minimum: number, maximum: number, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ValidationError(`${field}必须在 ${minimum} 到 ${maximum} 之间`);
  }
  return value;
}

function enumValue<T extends string>(value: unknown, field: string, values: readonly T[], fallback: T) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !values.includes(value as T)) throw new ValidationError(`${field}格式不正确`);
  return value as T;
}

function optionalNumber(value: unknown, field: string, minimum = 0, maximum = 100000) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ValidationError(`${field}格式不正确`);
  }
  return value;
}

function timestamp(value: unknown, field = "时间") {
  const result = text(value, field, 80)!;
  const date = new Date(result);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${field}格式不正确`);
  return date.toISOString();
}

function httpUrl(value: unknown) {
  const result = text(value, "接口地址", 500)!;
  try {
    const url = new URL(result);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return result.replace(/\/+$/, "");
  } catch {
    throw new ValidationError("接口地址必须是有效的 HTTP 或 HTTPS 地址");
  }
}

export function parseAiSettings(value: unknown) {
  const body = objectValue(value);
  const avatar = (subject: "user" | "assistant") => {
    const prefix = subject === "user" ? "我的" : "Eva 的";
    const typeKey = subject === "user" ? "userAvatarType" : "assistantAvatarType";
    const valueKey = subject === "user" ? "userAvatarValue" : "assistantAvatarValue";
    const type = enumValue(body[typeKey], `${prefix}头像类型`, ["default", "emoji", "image"] as const, "default");
    const raw = text(body[valueKey] ?? "", `${prefix}头像`, 32, false) ?? "";
    if (type === "emoji" && (!raw || Array.from(raw).length > 8)) throw new ValidationError(`${prefix} Emoji 格式不正确`);
    if (type === "image" && !["jpg", "png", "webp"].includes(raw)) throw new ValidationError(`${prefix}图片需要重新上传`);
    return { type, value: type === "default" ? "" : raw };
  };
  const userAvatar = avatar("user");
  const assistantAvatar = avatar("assistant");
  return {
    providerPreset: text(body.providerPreset ?? "custom", "Provider 类型", 40)!,
    providerName: text(body.providerName, "Provider 名称", 80)!,
    baseUrl: httpUrl(body.baseUrl),
    model: text(body.model, "模型", 160)!,
    apiKey: body.apiKey === undefined ? undefined : text(body.apiKey, "API Key", 1000, false),
    enabled: booleanValue(body.enabled, "启用状态", true),
    temperature: numberValue(body.temperature, "温度", 0, 2, 0.6),
    systemPrompt: text(body.systemPrompt ?? "", "系统提示词", 5000, false) ?? "",
    responseLength: enumValue(body.responseLength, "回复长度", ["brief", "balanced", "detailed"] as const, "balanced"),
    initiative: enumValue(body.initiative, "主动程度", ["quiet", "balanced", "active"] as const, "quiet"),
    allowSuggestions: booleanValue(body.allowSuggestions, "主动建议", true),
    allowTeasing: booleanValue(body.allowTeasing, "轻吐槽", true),
    includeTasks: booleanValue(body.includeTasks, "任务上下文", true),
    includeMemories: booleanValue(body.includeMemories, "记忆上下文", true),
    allowWriteActions: booleanValue(body.allowWriteActions, "AI 写入权限", false),
    userDisplayName: text(body.userDisplayName ?? "我", "我的称呼", 40)!,
    userAvatarType: userAvatar.type,
    userAvatarValue: userAvatar.value,
    assistantDisplayName: text(body.assistantDisplayName ?? "Eva", "Eva 的称呼", 40)!,
    assistantAvatarType: assistantAvatar.type,
    assistantAvatarValue: assistantAvatar.value,
    showUserName: booleanValue(body.showUserName, "显示我的名称", true),
    showAssistantName: booleanValue(body.showAssistantName, "显示 Eva 名称", true),
    showAvatars: booleanValue(body.showAvatars, "显示头像", true),
  };
}

export function parseChatPreferences(value: unknown) {
  const body = objectValue(value);
  const parsed = parseAiSettings({
    providerName: "placeholder", baseUrl: "https://example.com/v1", model: "placeholder",
    userDisplayName: body.userDisplayName, userAvatarType: body.userAvatarType, userAvatarValue: body.userAvatarValue,
    assistantDisplayName: body.assistantDisplayName, assistantAvatarType: body.assistantAvatarType, assistantAvatarValue: body.assistantAvatarValue,
    showUserName: body.showUserName, showAssistantName: body.showAssistantName, showAvatars: body.showAvatars,
  });
  return {
    userDisplayName: parsed.userDisplayName, userAvatarType: parsed.userAvatarType, userAvatarValue: parsed.userAvatarValue,
    assistantDisplayName: parsed.assistantDisplayName, assistantAvatarType: parsed.assistantAvatarType, assistantAvatarValue: parsed.assistantAvatarValue,
    showUserName: parsed.showUserName, showAssistantName: parsed.showAssistantName, showAvatars: parsed.showAvatars,
  };
}

export function parseNewChatSession(value: unknown) {
  const body = objectValue(value);
  return { title: text(body.title ?? "新对话", "会话标题", 120)! };
}

export function parseChatSessionPatch(value: unknown) {
  const body = objectValue(value);
  return { title: text(body.title, "会话标题", 120)! };
}

export function parseChatRequest(value: unknown) {
  const body = objectValue(value);
  const sessionId = body.sessionId;
  if (!Number.isSafeInteger(sessionId) || (sessionId as number) <= 0) {
    throw new ValidationError("会话 ID 格式不正确");
  }
  return {
    sessionId: sessionId as number,
    content: text(body.content, "消息", 20000)!,
  };
}

export function parseNewInbox(value: unknown) {
  const body = objectValue(value);
  return { content: text(body.content, "内容", 10000)!, source: text(body.source ?? "manual", "来源", 40)! };
}

export function parseInboxPatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    content: body.content === undefined ? undefined : text(body.content, "内容", 10000),
    status: body.status === undefined ? undefined : enumValue(body.status, "状态", ["inbox", "processed", "archived"] as const, "inbox"),
  };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("没有可更新的字段");
  return result;
}

export function parseInboxConversion(value: unknown) {
  const body = objectValue(value);
  return { target: enumValue(body.target, "转换类型", ["task", "memory"] as const, "task") };
}

export function parseNewFoodLog(value: unknown) {
  const body = objectValue(value);
  const kcalMin = optionalNumber(body.kcalMin, "热量下限");
  const kcalMax = optionalNumber(body.kcalMax, "热量上限");
  if (kcalMin !== null && kcalMax !== null && kcalMin > kcalMax) throw new ValidationError("热量下限不能大于上限");
  return {
    occurredAt: timestamp(body.occurredAt ?? new Date().toISOString()),
    mealType: enumValue(body.mealType, "餐次", ["breakfast", "lunch", "dinner", "snack", "late_night"] as const, "snack"),
    title: text(body.title, "饮食标题", 200)!, description: text(body.description ?? "", "食物明细", 4000, false) ?? "",
    portion: text(body.portion ?? "", "分量", 200, false) ?? "",
    scene: enumValue(body.scene, "场景", ["home", "delivery", "restaurant", "packaged_food", "other"] as const, "other"),
    estimatedKcal: optionalNumber(body.estimatedKcal, "估算热量"), kcalMin, kcalMax,
    confidence: enumValue(body.confidence, "可信度", ["high", "medium", "low"] as const, "low"),
    notes: text(body.notes ?? "", "备注", 2000, false) ?? "",
    imageUrl: body.imageUrl === undefined || body.imageUrl === null ? null : text(body.imageUrl, "图片地址", 1000, false) || null,
    attachmentId: body.attachmentId === undefined || body.attachmentId === null ? null : text(body.attachmentId, "附件 ID", 200, false) || null,
  };
}

export function parseFoodLogPatch(value: unknown) {
  const body = objectValue(value);
  const parsed = parseNewFoodLog({
    occurredAt: body.occurredAt ?? new Date().toISOString(), mealType: body.mealType ?? "snack",
    title: body.title ?? "placeholder", description: body.description ?? "", portion: body.portion ?? "", scene: body.scene ?? "other",
    estimatedKcal: body.estimatedKcal, kcalMin: body.kcalMin, kcalMax: body.kcalMax, confidence: body.confidence ?? "low",
    notes: body.notes ?? "", imageUrl: body.imageUrl, attachmentId: body.attachmentId,
  });
  const keys = ["occurredAt", "mealType", "title", "description", "portion", "scene", "estimatedKcal", "kcalMin", "kcalMax", "confidence", "notes", "imageUrl", "attachmentId"] as const;
  const result = Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, parsed[key]]));
  if (!Object.keys(result).length) throw new ValidationError("没有可更新的字段");
  return result;
}

export function parseFoodLibraryItem(value: unknown) {
  const body = objectValue(value);
  return {
    name: text(body.name, "食品名称", 200)!, brand: text(body.brand ?? "", "品牌", 120, false) ?? "",
    category: enumValue(body.category, "食品分类", ["staple", "dish", "snack", "drink", "other"] as const, "other"),
    defaultPortion: text(body.defaultPortion ?? "", "默认分量", 160, false) ?? "",
    referenceType: enumValue(body.referenceType, "参考类型", ["per_100g", "per_100ml", "per_serving"] as const, "per_serving"),
    referenceEnergyKj: optionalNumber(body.referenceEnergyKj, "参考能量"), referenceKcal: optionalNumber(body.referenceKcal, "参考热量"),
    servingWeight: optionalNumber(body.servingWeight, "份量重量"), servingKcal: optionalNumber(body.servingKcal, "每份热量"),
    dataSource: enumValue(body.dataSource, "数据来源", ["package_label", "official", "estimated", "manual"] as const, "manual"),
    notes: text(body.notes ?? "", "备注", 2000, false) ?? "",
  };
}

export function parseNewDrinkLog(value: unknown) {
  const body = objectValue(value);
  const kcalMin = optionalNumber(body.kcalMin, "热量下限");
  const kcalMax = optionalNumber(body.kcalMax, "热量上限");
  if (kcalMin !== null && kcalMax !== null && kcalMin > kcalMax) throw new ValidationError("热量下限不能大于上限");
  return {
    occurredAt: timestamp(body.occurredAt ?? new Date().toISOString()), name: text(body.name, "饮品名称", 200)!,
    brand: text(body.brand ?? "", "品牌", 120, false) ?? "",
    drinkType: enumValue(body.drinkType, "饮品类型", ["coffee", "milk_tea", "tea", "soda", "juice", "water", "alcohol", "other"] as const, "other"),
    volumeMl: optionalNumber(body.volumeMl, "容量", 0, 10000), sugarLevel: text(body.sugarLevel ?? "", "糖度", 80, false) ?? "",
    caffeineMg: optionalNumber(body.caffeineMg, "咖啡因", 0, 5000), estimatedKcal: optionalNumber(body.estimatedKcal, "估算热量"), kcalMin, kcalMax,
    confidence: enumValue(body.confidence, "可信度", ["high", "medium", "low"] as const, "low"),
    foodLibraryId: optionalNumber(body.foodLibraryId, "Food Library ID", 1, Number.MAX_SAFE_INTEGER), notes: text(body.notes ?? "", "备注", 2000, false) ?? "",
  };
}

export function parseDrinkLogPatch(value: unknown) {
  const body = objectValue(value);
  const parsed = parseNewDrinkLog({ occurredAt: body.occurredAt ?? new Date().toISOString(), name: body.name ?? "placeholder", brand: body.brand ?? "", drinkType: body.drinkType ?? "other", volumeMl: body.volumeMl, sugarLevel: body.sugarLevel ?? "", caffeineMg: body.caffeineMg, estimatedKcal: body.estimatedKcal, kcalMin: body.kcalMin, kcalMax: body.kcalMax, confidence: body.confidence ?? "low", foodLibraryId: body.foodLibraryId, notes: body.notes ?? "" });
  const keys = ["occurredAt", "name", "brand", "drinkType", "volumeMl", "sugarLevel", "caffeineMg", "estimatedKcal", "kcalMin", "kcalMax", "confidence", "foodLibraryId", "notes"] as const;
  const result = Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, parsed[key]]));
  if (!Object.keys(result).length) throw new ValidationError("没有可更新的字段");
  return result;
}

export function parseDrinkLimit(value: unknown) {
  const body = objectValue(value);
  return {
    name: text(body.name, "限制名称", 120)!, targetType: text(body.targetType, "目标类型", 80)!,
    period: enumValue(body.period, "周期", ["daily", "weekly"] as const, "weekly"),
    limitValue: numberValue(body.limitValue, "限制数量", 1, 1000, 1), enabled: booleanValue(body.enabled, "启用状态", true),
  };
}

export function parseDailyEnergy(value: unknown) {
  const body = objectValue(value);
  const date = text(body.date, "日期", 10)!;
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new ValidationError("日期格式不正确");
  return {
    date,
    restingEnergyKcal: optionalNumber(body.restingEnergyKcal, "静息消耗", 0, 20000),
    activeEnergyKcal: optionalNumber(body.activeEnergyKcal, "活动消耗", 0, 20000),
    notes: text(body.notes ?? "", "备注", 2000, false) ?? "",
  };
}
