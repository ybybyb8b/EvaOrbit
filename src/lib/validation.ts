import type { ChronicleSource, HealthRecordDetailValue, HealthRecordDetails, HealthRecordStatus, HealthRecordType, LuciusCaseErrorType, LuciusCaseSeverity, LuciusCaseStatus, MediaRating, MediaStatus, MediaType, MemoStatus, MemoType, ProjectItemStatus, ProjectItemType, ProjectStatus, TaskPriority, TrackerFieldType, TrackerGoalOperator, TrackerPeriodType, TrackerReminderType, TrainingBodyPart, TrainingType } from "./types";
import { ONGOING_HEALTH_RECORD_TYPES, SUGAR_LEVELS, TRAINING_BODY_PARTS } from "./types.ts";

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

export function dateOnly(value: unknown, field = "日期") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`${field}格式不正确`);
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new ValidationError(`${field}格式不正确`);
  return value;
}

const mediaTypes = ["movie", "tv", "anime", "documentary", "other"] as const;
const mediaStatuses = ["planned", "watching", "completed", "paused", "dropped"] as const;
const mediaRatingPattern = /^(goat|dope|mid|nope|shit)[+-]?$/;
function mediaRating(value: unknown): MediaRating | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !mediaRatingPattern.test(value)) throw new ValidationError("评分格式不正确");
  return value as MediaRating;
}
function nullableMediaText(value: unknown, field: string, max: number) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, field, max, false) || null;
}
function nullablePositiveInteger(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 999) throw new ValidationError(`${field}格式不正确`);
  return result;
}
function nullableId(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new ValidationError(`${field}格式不正确`);
  return result;
}
function mediaFields(body: Record<string, unknown>, partial: boolean) {
  const mediaType = body.mediaType === undefined ? undefined : enumValue(body.mediaType, "Media 类型", mediaTypes, "other") as MediaType;
  const seasonNumber = body.seasonNumber === undefined && partial ? undefined : nullablePositiveInteger(body.seasonNumber, "Season number");
  const seasonTitle = body.seasonTitle === undefined && partial ? undefined : nullableMediaText(body.seasonTitle, "Season title", 120);
  if (mediaType && !["tv", "anime"].includes(mediaType) && (seasonNumber || seasonTitle)) throw new ValidationError("只有 TV 或 Anime 可以填写 Season");
  return {
    originalTitle: body.originalTitle === undefined && body.title === undefined && partial ? undefined : nullableMediaText(body.originalTitle === undefined ? body.title : body.originalTitle, "原名", 300),
    translatedTitle: body.translatedTitle === undefined && partial ? undefined : nullableMediaText(body.translatedTitle, "译名", 300),
    mediaType,
    status: body.status === undefined && partial ? undefined : enumValue(body.status, "Media 状态", mediaStatuses, "completed") as MediaStatus,
    rating: body.rating === undefined && partial ? undefined : mediaRating(body.rating),
    isFavorite: body.isFavorite === undefined && partial ? undefined : booleanValue(body.isFavorite, "Favorite", false),
    note: body.note === undefined && partial ? undefined : nullableMediaText(body.note, "备注", 5000),
    seriesId: body.seriesId === undefined && partial ? undefined : nullableId(body.seriesId, "Series"),
    seasonNumber,
    seasonTitle,
  };
}

export function parseNewMedia(value: unknown) {
  const body = objectValue(value);
  if (body.mediaType === undefined) throw new ValidationError("Media 类型不能为空");
  const fields = mediaFields(body, false);
  const legacyTitle = nullableMediaText(body.title, "标题", 300);
  const hasItemName=Boolean(fields.originalTitle||fields.translatedTitle||legacyTitle);
  if(!hasItemName&&!fields.seriesId)throw new ValidationError("请填写原名、译名或选择 Series / Franchise");
  if(!hasItemName&&!(["tv","anime"] as MediaType[]).includes(fields.mediaType!))throw new ValidationError("该 Media item 需要原名或译名");
  const watchedDate = body.watchedDate === null || body.watchedDate === undefined || body.watchedDate === "" ? null : dateOnly(body.watchedDate, "完成日期");
  if (fields.status === "completed" && !watchedDate) throw new ValidationError("Completed Media 需要完成日期");
  return {
    item: {
      originalTitle: fields.originalTitle ?? null, translatedTitle: fields.translatedTitle ?? null, mediaType: fields.mediaType!, status: fields.status!, rating: fields.rating ?? null,
      isFavorite: fields.isFavorite ?? false, note: fields.note ?? null, coverUrl: null,
      seriesId: fields.seriesId ?? null, seasonNumber: fields.seasonNumber ?? null, seasonTitle: fields.seasonTitle ?? null,
    },
    watchedDate, legacyTitle,
  };
}

export function parseMediaPatch(value: unknown) {
  const body = objectValue(value);
  const result = mediaFields(body, true);
  if (Object.values(result).every((entry) => entry === undefined)) throw new ValidationError("没有可更新的 Media 字段");
  return result;
}

export function parseMediaSeries(value: unknown) {
  return { name: text(objectValue(value).name, "Series / Franchise", 200)! };
}

export function parseMediaViewing(value: unknown) {
  return { watchedDate: dateOnly(objectValue(value).watchedDate, "观看日期") };
}

const chronicleSources = ["manual", "chatgpt"] as const satisfies readonly ChronicleSource[];

function markdownText(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new ValidationError("正文不能为空");
  if (value.length > 100_000) throw new ValidationError("正文不能超过 100000 个字符");
  return value;
}

export function parseNewChronicleEntry(value: unknown) {
  const body = objectValue(value);
  return {
    date: dateOnly(body.date),
    title: text(body.title, "标题", 300)!,
    contentMd: markdownText(body.contentMd),
    source: enumValue(body.source, "来源", chronicleSources, "manual"),
  };
}

export function parseChronicleEntryPatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    date: body.date === undefined ? undefined : dateOnly(body.date),
    title: body.title === undefined ? undefined : text(body.title, "标题", 300),
    contentMd: body.contentMd === undefined ? undefined : markdownText(body.contentMd),
    source: body.source === undefined ? undefined : enumValue(body.source, "来源", chronicleSources, "manual"),
  };
  if (Object.values(result).every((entry) => entry === undefined)) throw new ValidationError("没有可更新的 Chronicle 字段");
  return result;
}

const projectStatuses = ["active", "paused", "archived"] as const satisfies readonly ProjectStatus[];
const projectItemTypes = ["feature", "bug", "ui", "migration", "research", "tech_debt", "other"] as const satisfies readonly ProjectItemType[];
const projectItemStatuses = ["to_solve", "doing", "blocked", "done", "verified", "dropped"] as const satisfies readonly ProjectItemStatus[];

function nullableProjectText(value: unknown, field: string, max: number): string | null;
function nullableProjectText(value: unknown, field: string, max: number, optional: true): string | null | undefined;
function nullableProjectText(value: unknown, field: string, max: number, optional = false): string | null | undefined {
  if (value === undefined && optional) return undefined;
  if (value === undefined || value === null || value === "") return null;
  return text(value, field, max, false) || null;
}

function positiveProjectId(value: unknown, optional = false) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new ValidationError("项目 ID 格式不正确");
  return value;
}

export function parseNewProject(value: unknown) {
  const body = objectValue(value);
  return { name: text(body.name, "项目名称", 200)!, description: nullableProjectText(body.description, "项目描述", 5000), status: enumValue(body.status, "项目状态", projectStatuses, "active") };
}

export function parseProjectPatch(value: unknown) {
  const body = objectValue(value);
  const result = { name: body.name === undefined ? undefined : text(body.name, "项目名称", 200), description: nullableProjectText(body.description, "项目描述", 5000, true), status: body.status === undefined ? undefined : enumValue(body.status, "项目状态", projectStatuses, "active") };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("没有可更新的项目字段");
  return result;
}

export function parseNewProjectItem(value: unknown) {
  const body = objectValue(value);
  return { projectId: positiveProjectId(body.projectId)!, title: text(body.title, "需求标题", 300)!, description: nullableProjectText(body.description, "原始需求", 20000), type: enumValue(body.type, "需求类型", projectItemTypes, "other"), status: enumValue(body.status, "需求状态", projectItemStatuses, "to_solve"), module: nullableProjectText(body.module, "模块", 120), priority: nullableProjectText(body.priority, "优先级", 60), nextStep: nullableProjectText(body.nextStep, "下一步", 5000), resolution: nullableProjectText(body.resolution, "解决说明", 10000) };
}

export function parseProjectItemPatch(value: unknown) {
  const body = objectValue(value);
  const result = { projectId: positiveProjectId(body.projectId, true), title: body.title === undefined ? undefined : text(body.title, "需求标题", 300), description: nullableProjectText(body.description, "原始需求", 20000, true), type: body.type === undefined ? undefined : enumValue(body.type, "需求类型", projectItemTypes, "other"), status: body.status === undefined ? undefined : enumValue(body.status, "需求状态", projectItemStatuses, "to_solve"), module: nullableProjectText(body.module, "模块", 120, true), priority: nullableProjectText(body.priority, "优先级", 60, true), nextStep: nullableProjectText(body.nextStep, "下一步", 5000, true), resolution: nullableProjectText(body.resolution, "解决说明", 10000, true) };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("没有可更新的需求字段");
  return result;
}

const memoTypes = ["basic", "supplement", "event", "note"] as const satisfies readonly MemoType[];
const memoStatuses = ["active", "merged", "archived", "historical"] as const satisfies readonly MemoStatus[];
const luciusCaseErrorTypes = ["naming", "memory_omission", "factual", "tool_misuse", "expression", "other"] as const satisfies readonly LuciusCaseErrorType[];
const luciusCaseSeverities = ["minor", "moderate", "serious", "habitual"] as const satisfies readonly LuciusCaseSeverity[];
const luciusCaseStatuses = ["serving", "probation", "temporary_release", "permanent_record"] as const satisfies readonly LuciusCaseStatus[];

function longTermTags(value: unknown, field: string): string[];
function longTermTags(value: unknown, field: string, optional: true): string[] | undefined;
function longTermTags(value: unknown, field: string, optional = false): string[] | undefined {
  if (value === undefined && optional) return undefined;
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new ValidationError(`${field}格式不正确`);
  const result = [...new Set((value as string[]).map((item) => item.trim()).filter(Boolean))];
  if (result.length > 20 || result.some((item) => item.length > 60)) throw new ValidationError(`${field}最多 20 个，每个不能超过 60 个字符`);
  return result;
}

function nullableLongTermText(value: unknown, field: string, max: number): string | null;
function nullableLongTermText(value: unknown, field: string, max: number, optional: true): string | null | undefined;
function nullableLongTermText(value: unknown, field: string, max: number, optional = false): string | null | undefined {
  if (value === undefined && optional) return undefined;
  if (value === undefined || value === null || value === "") return null;
  return text(value, field, max, false) || null;
}

function nullableLongTermDate(value: unknown, field: string): string | null;
function nullableLongTermDate(value: unknown, field: string, optional: true): string | null | undefined;
function nullableLongTermDate(value: unknown, field: string, optional = false): string | null | undefined {
  if (value === undefined && optional) return undefined;
  if (value === undefined || value === null || value === "") return null;
  return dateOnly(value, field);
}

function nullableLongTermTimestamp(value: unknown, field: string): string | null;
function nullableLongTermTimestamp(value: unknown, field: string, optional: true): string | null | undefined;
function nullableLongTermTimestamp(value: unknown, field: string, optional = false): string | null | undefined {
  if (value === undefined && optional) return undefined;
  if (value === undefined || value === null || value === "") return null;
  return timestamp(value, field);
}

function nullableLongTermUrl(value: unknown): string | null;
function nullableLongTermUrl(value: unknown, optional: true): string | null | undefined;
function nullableLongTermUrl(value: unknown, optional = false): string | null | undefined {
  const result = optional ? nullableLongTermText(value, "来源链接", 2000, true) : nullableLongTermText(value, "来源链接", 2000);
  if (result === undefined || result === null) return result;
  try {
    const parsed = new URL(result);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return result;
  } catch {
    throw new ValidationError("来源链接必须是有效的 HTTP 或 HTTPS 地址");
  }
}

function nullablePositiveId(value: unknown, field: string): number | null;
function nullablePositiveId(value: unknown, field: string, optional: true): number | null | undefined;
function nullablePositiveId(value: unknown, field: string, optional = false): number | null | undefined {
  if (value === undefined && optional) return undefined;
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new ValidationError(`${field}格式不正确`);
  return value;
}

function integerValue(value: unknown, field: string, minimum: number, maximum: number, fallback?: number) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new ValidationError(`${field}必须是 ${minimum} 到 ${maximum} 之间的整数`);
  return value;
}

function migrationTrace(body: Record<string, unknown>): { sourceSystem: string | null; sourceId: string | null; sourceUrl: string | null; importedAt: string | null };
function migrationTrace(body: Record<string, unknown>, optional: true): { sourceSystem: string | null | undefined; sourceId: string | null | undefined; sourceUrl: string | null | undefined; importedAt: string | null | undefined };
function migrationTrace(body: Record<string, unknown>, optional = false) {
  return {
    sourceSystem: optional ? nullableLongTermText(body.sourceSystem, "来源系统", 120, true) : nullableLongTermText(body.sourceSystem, "来源系统", 120),
    sourceId: optional ? nullableLongTermText(body.sourceId, "来源 ID", 300, true) : nullableLongTermText(body.sourceId, "来源 ID", 300),
    sourceUrl: optional ? nullableLongTermUrl(body.sourceUrl, true) : nullableLongTermUrl(body.sourceUrl),
    importedAt: optional ? nullableLongTermTimestamp(body.importedAt, "导入时间", true) : nullableLongTermTimestamp(body.importedAt, "导入时间"),
  };
}

export function parseNewMemo(value: unknown) {
  const body = objectValue(value);
  return {
    title: text(body.title, "Memo 标题", 300)!,
    content: text(body.content, "Memo 内容", 100_000)!,
    type: enumValue(body.type, "Memo 类型", memoTypes, "note"),
    status: enumValue(body.status, "Memo 状态", memoStatuses, "active"),
    tags: longTermTags(body.tags, "Memo 标签"),
    eventDate: nullableLongTermDate(body.eventDate, "事件日期"),
    confirmedAt: nullableLongTermTimestamp(body.confirmedAt, "确认时间"),
    mergedIntoId: nullablePositiveId(body.mergedIntoId, "合并目标"),
    ...migrationTrace(body),
  };
}

export function parseMemoPatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    title: body.title === undefined ? undefined : text(body.title, "Memo 标题", 300),
    content: body.content === undefined ? undefined : text(body.content, "Memo 内容", 100_000),
    type: body.type === undefined ? undefined : enumValue(body.type, "Memo 类型", memoTypes, "note"),
    status: body.status === undefined ? undefined : enumValue(body.status, "Memo 状态", memoStatuses, "active"),
    tags: longTermTags(body.tags, "Memo 标签", true),
    eventDate: nullableLongTermDate(body.eventDate, "事件日期", true),
    confirmedAt: nullableLongTermTimestamp(body.confirmedAt, "确认时间", true),
    mergedIntoId: nullablePositiveId(body.mergedIntoId, "合并目标", true),
    ...migrationTrace(body, true),
  };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("没有可更新的 Memo 字段");
  return result;
}

export function parseNewLuciusDiaryEntry(value: unknown) {
  const body = objectValue(value);
  return {
    date: dateOnly(body.date),
    content: text(body.content, "Diary 内容", 100_000)!,
    tags: longTermTags(body.tags, "Diary 标签"),
    ...migrationTrace(body),
  };
}

export function parseLuciusDiaryPatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    date: body.date === undefined ? undefined : dateOnly(body.date),
    content: body.content === undefined ? undefined : text(body.content, "Diary 内容", 100_000),
    tags: longTermTags(body.tags, "Diary 标签", true),
    ...migrationTrace(body, true),
  };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("没有可更新的 Diary 字段");
  return result;
}

function caseDates(firstOccurredDate: string, latestOccurredDate: string) {
  if (latestOccurredDate < firstOccurredDate) throw new ValidationError("最近发生日期不能早于首次发生日期");
}

export function parseNewLuciusCase(value: unknown) {
  const body = objectValue(value);
  if (body.errorType === undefined) throw new ValidationError("错误类型不能为空");
  const firstOccurredDate = dateOnly(body.firstOccurredDate, "首次发生日期");
  const latestOccurredDate = body.latestOccurredDate === undefined ? firstOccurredDate : dateOnly(body.latestOccurredDate, "最近发生日期");
  caseDates(firstOccurredDate, latestOccurredDate);
  return {
    title: text(body.title, "案底名称", 300)!,
    errorType: enumValue(body.errorType, "错误类型", luciusCaseErrorTypes, "other"),
    severity: enumValue(body.severity, "严重程度", luciusCaseSeverities, "moderate"),
    status: enumValue(body.status, "案底状态", luciusCaseStatuses, "serving"),
    triggerScenes: longTermTags(body.triggerScenes, "触发场景"),
    errorQuote: text(body.errorQuote ?? "", "错误原话", 10_000, false) ?? "",
    cause: text(body.cause, "原因", 20_000)!,
    correctBehavior: text(body.correctBehavior, "正确行为", 20_000)!,
    mandatoryRule: text(body.mandatoryRule, "强制规则", 20_000)!,
    nextCheck: nullableLongTermDate(body.nextCheck, "下次检查日期"),
    punishment: text(body.punishment ?? "", "惩罚", 10_000, false) ?? "",
    firstOccurredDate,
    latestOccurredDate,
    occurrenceCount: integerValue(body.occurrenceCount, "累计次数", 1, 1_000_000, 1),
    consecutiveCorrectCount: integerValue(body.consecutiveCorrectCount, "连续正确次数", 0, 1_000_000, 0),
    recurrenceIntervalDays: nullablePositiveId(body.recurrenceIntervalDays, "复发间隔天数"),
    isRecurrence: booleanValue(body.isRecurrence, "是否复发", false),
    resetThreshold: integerValue(body.resetThreshold, "重置阈值", 1, 1_000_000, 3),
    ...migrationTrace(body),
  };
}

export function parseLuciusCasePatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    title: body.title === undefined ? undefined : text(body.title, "案底名称", 300),
    errorType: body.errorType === undefined ? undefined : enumValue(body.errorType, "错误类型", luciusCaseErrorTypes, "other"),
    severity: body.severity === undefined ? undefined : enumValue(body.severity, "严重程度", luciusCaseSeverities, "moderate"),
    status: body.status === undefined ? undefined : enumValue(body.status, "案底状态", luciusCaseStatuses, "serving"),
    triggerScenes: longTermTags(body.triggerScenes, "触发场景", true),
    errorQuote: body.errorQuote === undefined ? undefined : text(body.errorQuote, "错误原话", 10_000, false),
    cause: body.cause === undefined ? undefined : text(body.cause, "原因", 20_000),
    correctBehavior: body.correctBehavior === undefined ? undefined : text(body.correctBehavior, "正确行为", 20_000),
    mandatoryRule: body.mandatoryRule === undefined ? undefined : text(body.mandatoryRule, "强制规则", 20_000),
    nextCheck: nullableLongTermDate(body.nextCheck, "下次检查日期", true),
    punishment: body.punishment === undefined ? undefined : text(body.punishment, "惩罚", 10_000, false),
    firstOccurredDate: body.firstOccurredDate === undefined ? undefined : dateOnly(body.firstOccurredDate, "首次发生日期"),
    latestOccurredDate: body.latestOccurredDate === undefined ? undefined : dateOnly(body.latestOccurredDate, "最近发生日期"),
    occurrenceCount: body.occurrenceCount === undefined ? undefined : integerValue(body.occurrenceCount, "累计次数", 1, 1_000_000),
    consecutiveCorrectCount: body.consecutiveCorrectCount === undefined ? undefined : integerValue(body.consecutiveCorrectCount, "连续正确次数", 0, 1_000_000),
    recurrenceIntervalDays: nullablePositiveId(body.recurrenceIntervalDays, "复发间隔天数", true),
    isRecurrence: body.isRecurrence === undefined ? undefined : booleanValue(body.isRecurrence, "是否复发", false),
    resetThreshold: body.resetThreshold === undefined ? undefined : integerValue(body.resetThreshold, "重置阈值", 1, 1_000_000),
    ...migrationTrace(body, true),
  };
  if (result.firstOccurredDate && result.latestOccurredDate) caseDates(result.firstOccurredDate, result.latestOccurredDate);
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("没有可更新的 Cases 字段");
  return result;
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
  const apiKey = body.apiKey === undefined ? undefined : text(body.apiKey, "API Key", 1000, false);
  const clearApiKey = booleanValue(body.clearApiKey, "移除 API Key", false);
  if (apiKey !== undefined && !apiKey && !clearApiKey) {
    throw new ValidationError("更换 API Key 时请输入新值；如需移除，请使用移除操作");
  }
  if (apiKey && clearApiKey) throw new ValidationError("不能同时更换和移除 API Key");
  return {
    providerPreset: text(body.providerPreset ?? "custom", "Provider 类型", 40)!,
    providerName: text(body.providerName, "Provider 名称", 80)!,
    baseUrl: httpUrl(body.baseUrl),
    model: text(body.model, "模型", 160)!,
    apiKey,
    clearApiKey,
    enabled: booleanValue(body.enabled, "启用状态", true),
    temperature: numberValue(body.temperature, "温度", 0, 2, 0.6),
    systemPrompt: text(body.systemPrompt ?? "", "系统提示词", 5000, false) ?? "",
    responseLength: enumValue(body.responseLength, "回复长度", ["brief", "balanced", "detailed"] as const, "balanced"),
    initiative: enumValue(body.initiative, "主动程度", ["quiet", "balanced", "active"] as const, "quiet"),
    allowSuggestions: booleanValue(body.allowSuggestions, "主动建议", true),
    allowTeasing: booleanValue(body.allowTeasing, "轻吐槽", true),
    includeTasks: false,
    includeMemories: false,
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

export function parseAiProvider(value: unknown) {
  const body = objectValue(value);
  const apiKey = body.apiKey === undefined ? undefined : text(body.apiKey, "API Key", 1000, false);
  const clearApiKey = booleanValue(body.clearApiKey, "移除 API Key", false);
  if (apiKey !== undefined && !apiKey && !clearApiKey) throw new ValidationError("更换 API Key 时请输入新值");
  if (apiKey && clearApiKey) throw new ValidationError("不能同时更换和移除 API Key");
  return {
    name: text(body.name, "Provider 名称", 80)!,
    providerType: text(body.providerType ?? "openai-compatible", "Provider 协议", 40)!,
    baseUrl: httpUrl(body.baseUrl),
    enabled: booleanValue(body.enabled, "Provider 启用状态", true),
    apiKey,
    clearApiKey,
  };
}

export function parseAiModelConfig(value: unknown) {
  const body = objectValue(value);
  const capabilities = body.capabilities === undefined ? {} : objectValue(body.capabilities);
  return {
    modelId: text(body.modelId, "Model ID", 200)!,
    displayName: text(body.displayName ?? body.modelId, "模型名称", 120)!,
    enabled: booleanValue(body.enabled, "模型启用状态", true),
    isDefault: booleanValue(body.isDefault, "默认模型", false),
    capabilities,
  };
}

function optionalPositiveId(value: unknown, label: string) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new ValidationError(`${label}格式不正确`);
  return Number(value);
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
  return { title: text(body.title ?? "New conversation", "会话标题", 120)!, modelConfigId: body.modelConfigId === undefined ? undefined : optionalPositiveId(body.modelConfigId, "模型 ID") };
}

export function parseChatSessionPatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    title: body.title === undefined ? undefined : text(body.title, "会话标题", 120),
    modelConfigId: body.modelConfigId === undefined ? undefined : optionalPositiveId(body.modelConfigId, "模型 ID"),
  };
  if (result.title === undefined && result.modelConfigId === undefined) throw new ValidationError("没有可更新的会话字段");
  return result;
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

export function parseInboxStatus(value: unknown): "inbox" | "processed" | "archived" | "all" {
  return enumValue(value ?? "inbox", "状态", ["inbox", "processed", "archived", "all"] as const, "inbox");
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
  const scene = enumValue(body.scene, "场景", ["home", "delivery", "restaurant", "packaged_food", "other"] as const, "other");
  const rating = body.rating === undefined || body.rating === null || body.rating === "" ? null : enumValue(body.rating, "评价", ["love", "good", "neutral", "dislike"] as const, "neutral");
  if (rating !== null && scene !== "delivery" && scene !== "restaurant") throw new ValidationError("只有外卖或外食记录可以填写评价");
  return {
    occurredAt: timestamp(body.occurredAt ?? new Date().toISOString()),
    mealType: enumValue(body.mealType, "餐次", ["breakfast", "lunch", "dinner", "snack", "late_night"] as const, "snack"),
    title: text(body.title, "饮食标题", 200)!, description: text(body.description ?? "", "食物明细", 4000, false) ?? "",
    portion: text(body.portion ?? "", "分量", 200, false) ?? "",
    scene, rating,
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
    title: body.title ?? "placeholder", description: body.description ?? "", portion: body.portion ?? "", scene: body.scene ?? (body.rating === undefined ? "other" : "delivery"), rating: body.rating,
    estimatedKcal: body.estimatedKcal, kcalMin: body.kcalMin, kcalMax: body.kcalMax, confidence: body.confidence ?? "low",
    notes: body.notes ?? "", imageUrl: body.imageUrl, attachmentId: body.attachmentId,
  });
  const keys = ["occurredAt", "mealType", "title", "description", "portion", "scene", "rating", "estimatedKcal", "kcalMin", "kcalMax", "confidence", "notes", "imageUrl", "attachmentId"] as const;
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

export function parseFoodLibraryItemPatch(value: unknown) {
  const body = objectValue(value);
  const parsed = parseFoodLibraryItem({
    name: body.name === undefined ? "placeholder" : body.name,
    brand: body.brand,
    category: body.category,
    defaultPortion: body.defaultPortion,
    referenceType: body.referenceType,
    referenceEnergyKj: body.referenceEnergyKj,
    referenceKcal: body.referenceKcal,
    servingWeight: body.servingWeight,
    servingKcal: body.servingKcal,
    dataSource: body.dataSource,
    notes: body.notes,
  });
  const keys = [
    "name", "brand", "category", "defaultPortion", "referenceType", "referenceEnergyKj", "referenceKcal",
    "servingWeight", "servingKcal", "dataSource", "notes",
  ] as const;
  const result = Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, parsed[key]]));
  if (!Object.keys(result).length) throw new ValidationError("没有可更新的 Food Library 字段");
  return result;
}

function nullableTimestamp(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return timestamp(value, field);
}

function validateHealthTimeRange(startedAt: string | null, endedAt: string | null) {
  if (startedAt && endedAt && endedAt < startedAt) throw new ValidationError("结束时间不能早于开始时间");
}

function healthDetails(value: unknown, optional = false): HealthRecordDetails {
  if (value === undefined && optional) return {};
  const body = objectValue(value ?? {});
  const entries = Object.entries(body);
  if (entries.length > 50) throw new ValidationError("健康详情最多包含 50 个字段");
  const result: HealthRecordDetails = {};
  const keys = new Set<string>();
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key) throw new ValidationError("健康详情字段名不能为空");
    if (key.length > 80) throw new ValidationError("健康详情字段名不能超过 80 个字符");
    if (keys.has(key)) throw new ValidationError("健康详情字段名不能重复");
    keys.add(key);
    if (rawValue !== null && typeof rawValue !== "string" && typeof rawValue !== "number" && typeof rawValue !== "boolean") {
      throw new ValidationError("健康详情只支持字符串、数字、布尔值或空值");
    }
    if (typeof rawValue === "number" && !Number.isFinite(rawValue)) throw new ValidationError("健康详情数字格式不正确");
    if (typeof rawValue === "string" && rawValue.length > 2000) throw new ValidationError("健康详情文本不能超过 2000 个字符");
    result[key] = rawValue as HealthRecordDetailValue;
  }
  if (JSON.stringify(result).length > 10000) throw new ValidationError("健康详情内容过大");
  return result;
}

const healthRecordTypes = ["symptom", "medication", "visit", "test", "condition", "treatment", "measurement", "note"] as const;
const healthRecordStatuses = ["active", "resolved"] as const;

export function parseNewHealthRecord(value: unknown) {
  const body = objectValue(value);
  const startedAt = nullableTimestamp(body.startedAt, "开始时间") ?? null;
  const endedAt = nullableTimestamp(body.endedAt, "结束时间") ?? null;
  validateHealthTimeRange(startedAt, endedAt);
  if (body.type === undefined) throw new ValidationError("健康记录类型不能为空");
  const type = enumValue(body.type, "健康记录类型", healthRecordTypes, "note") as HealthRecordType;
  const usesStatus = ONGOING_HEALTH_RECORD_TYPES.includes(type as typeof ONGOING_HEALTH_RECORD_TYPES[number]);
  return {
    occurredAt: timestamp(body.occurredAt, "发生日期"),
    occurredHasExplicitTime: booleanValue(body.occurredHasExplicitTime, "发生时间精度", true),
    type,
    title: text(body.title, "健康记录标题", 200)!,
    summary: text(body.summary ?? "", "健康记录摘要", 5000, false) ?? "",
    status: usesStatus ? enumValue(body.status, "健康记录状态", healthRecordStatuses, "active") as HealthRecordStatus : "resolved" as const,
    startedAt,
    startedHasExplicitTime: booleanValue(body.startedHasExplicitTime, "开始时间精度", true),
    endedAt,
    endedHasExplicitTime: booleanValue(body.endedHasExplicitTime, "结束时间精度", true),
    details: healthDetails(body.details),
  };
}

export function parseHealthRecordPatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    occurredAt: body.occurredAt === undefined ? undefined : timestamp(body.occurredAt, "发生时间"),
    occurredHasExplicitTime: body.occurredHasExplicitTime === undefined ? undefined : booleanValue(body.occurredHasExplicitTime, "发生时间精度", true),
    type: body.type === undefined ? undefined : enumValue(body.type, "健康记录类型", healthRecordTypes, "note") as HealthRecordType,
    title: body.title === undefined ? undefined : text(body.title, "健康记录标题", 200),
    summary: body.summary === undefined ? undefined : text(body.summary, "健康记录摘要", 5000, false),
    status: body.status === undefined ? undefined : enumValue(body.status, "健康记录状态", healthRecordStatuses, "active") as HealthRecordStatus,
    startedAt: nullableTimestamp(body.startedAt, "开始时间"),
    startedHasExplicitTime: body.startedHasExplicitTime === undefined ? undefined : booleanValue(body.startedHasExplicitTime, "开始时间精度", true),
    endedAt: nullableTimestamp(body.endedAt, "结束时间"),
    endedHasExplicitTime: body.endedHasExplicitTime === undefined ? undefined : booleanValue(body.endedHasExplicitTime, "结束时间精度", true),
    details: body.details === undefined ? undefined : healthDetails(body.details),
  };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("没有可更新的健康记录字段");
  if (result.startedAt !== undefined && result.endedAt !== undefined) {
    validateHealthTimeRange(result.startedAt, result.endedAt);
  }
  return result;
}

const trainingTypes = ["cardio", "strength", "mixed"] as const;
function trainingBodyParts(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !TRAINING_BODY_PARTS.includes(item as TrainingBodyPart))) throw new ValidationError("训练部位格式不正确");
  const result = [...new Set(value as TrainingBodyPart[])];
  if (!result.length) throw new ValidationError("请至少选择一个训练部位");
  return result;
}

export function parseNewTrainingLog(value: unknown) {
  const body = objectValue(value);
  return {
    occurredAt: timestamp(body.occurredAt, "训练日期"),
    occurredHasExplicitTime: booleanValue(body.occurredHasExplicitTime, "训练时间精度", false),
    trainingType: enumValue(body.trainingType, "训练类型", trainingTypes, "mixed") as TrainingType,
    bodyParts: trainingBodyParts(body.bodyParts),
    teacher: text(body.teacher ?? "", "老师", 120, false) ?? "",
    course: text(body.course ?? "", "课程", 160, false) ?? "",
    durationMinutes: optionalNumber(body.durationMinutes, "训练时长", 1, 1440),
    notes: text(body.notes ?? "", "训练备注", 5000, false) ?? "",
  };
}

export function parseTrainingLogPatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    occurredAt: body.occurredAt === undefined ? undefined : timestamp(body.occurredAt, "训练日期"),
    occurredHasExplicitTime: body.occurredHasExplicitTime === undefined ? undefined : booleanValue(body.occurredHasExplicitTime, "训练时间精度", false),
    trainingType: body.trainingType === undefined ? undefined : enumValue(body.trainingType, "训练类型", trainingTypes, "mixed") as TrainingType,
    bodyParts: body.bodyParts === undefined ? undefined : trainingBodyParts(body.bodyParts),
    teacher: body.teacher === undefined ? undefined : text(body.teacher, "老师", 120, false) ?? "",
    course: body.course === undefined ? undefined : text(body.course, "课程", 160, false) ?? "",
    durationMinutes: body.durationMinutes === undefined ? undefined : optionalNumber(body.durationMinutes, "训练时长", 1, 1440),
    notes: body.notes === undefined ? undefined : text(body.notes, "训练备注", 5000, false) ?? "",
  };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("没有可更新的训练记录字段");
  return result;
}

export function parseNewDrinkLog(value: unknown) {
  const body = objectValue(value);
  const kcalMin = optionalNumber(body.kcalMin, "热量下限");
  const kcalMax = optionalNumber(body.kcalMax, "热量上限");
  if (kcalMin !== null && kcalMax !== null && kcalMin > kcalMax) throw new ValidationError("热量下限不能大于上限");
  return {
    occurredAt: timestamp(body.occurredAt ?? new Date().toISOString()), occurredHasExplicitTime: booleanValue(body.occurredHasExplicitTime, "发生时间精度", true), name: text(body.name, "饮品名称", 200)!,
    brand: text(body.brand ?? "", "品牌", 120, false) ?? "",
    drinkType: enumValue(body.drinkType, "饮品类型", ["coffee", "milk_tea", "tea", "soda", "juice", "water", "alcohol", "other"] as const, "other"),
    volumeMl: optionalNumber(body.volumeMl, "容量", 0, 10000), sugarLevel: enumValue(body.sugarLevel, "糖度", ["", ...SUGAR_LEVELS] as const, ""),
    temperature: body.temperature === undefined || body.temperature === null || body.temperature === "" ? null : enumValue(body.temperature, "冷热 / 冰量", ["normal_ice", "less_ice", "no_ice", "room_temperature", "hot"] as const, "room_temperature"),
    rating: body.rating === undefined || body.rating === null || body.rating === "" ? null : enumValue(body.rating, "评价", ["love", "good", "neutral", "dislike"] as const, "neutral"),
    caffeineMg: optionalNumber(body.caffeineMg, "咖啡因", 0, 5000), estimatedKcal: optionalNumber(body.estimatedKcal, "估算热量"), kcalMin, kcalMax,
    confidence: enumValue(body.confidence, "可信度", ["high", "medium", "low"] as const, "low"),
    foodLibraryId: optionalNumber(body.foodLibraryId, "Food Library ID", 1, Number.MAX_SAFE_INTEGER), notes: text(body.notes ?? "", "备注", 2000, false) ?? "",
  };
}

export function parseDrinkLogPatch(value: unknown) {
  const body = objectValue(value);
  const parsed = parseNewDrinkLog({ occurredAt: body.occurredAt ?? new Date().toISOString(), occurredHasExplicitTime: body.occurredHasExplicitTime ?? true, name: body.name ?? "placeholder", brand: body.brand ?? "", drinkType: body.drinkType ?? "other", volumeMl: body.volumeMl, sugarLevel: body.sugarLevel ?? "", temperature: body.temperature, rating: body.rating, caffeineMg: body.caffeineMg, estimatedKcal: body.estimatedKcal, kcalMin: body.kcalMin, kcalMax: body.kcalMax, confidence: body.confidence ?? "low", foodLibraryId: body.foodLibraryId, notes: body.notes ?? "" });
  const keys = ["occurredAt", "occurredHasExplicitTime", "name", "brand", "drinkType", "volumeMl", "sugarLevel", "temperature", "rating", "caffeineMg", "estimatedKcal", "kcalMin", "kcalMax", "confidence", "foodLibraryId", "notes"] as const;
  const result = Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, parsed[key]]));
  if (!Object.keys(result).length) throw new ValidationError("没有可更新的字段");
  return result;
}

export function parseDrinkLimit(value: unknown) {
  const body = objectValue(value);
  return {
    name: text(body.name, "限制名称", 120)!, targetType: text(body.targetType, "目标类型", 80)!,
    period: enumValue(body.period, "周期", ["daily", "weekly", "monthly"] as const, "weekly"),
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

function positiveInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new ValidationError(`${field}格式不正确`);
  return value;
}

function recordValue(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${field}格式不正确`);
  return value as Record<string, unknown>;
}

export function parseNewTracker(value: unknown) {
  const body = objectValue(value);
  return {
    name: text(body.name, "Tracker 名称", 80)!,
    icon: "◉",
    iconType: "default" as const,
    iconValue: "",
    groupName: text(body.groupName ?? "日常", "分组", 60, false) || "日常",
    timeType: "point" as const,
    quickCaptureEnabled: booleanValue(body.quickCaptureEnabled, "快速记录", true),
    statsConfig: body.statsConfig === undefined ? {} : recordValue(body.statsConfig, "统计配置"),
  };
}

export function parseTrackerPatch(value: unknown) {
  const body = objectValue(value);
  const parsed = parseNewTracker({ name: body.name ?? "placeholder", groupName: body.groupName ?? "日常", quickCaptureEnabled: body.quickCaptureEnabled ?? true, statsConfig: body.statsConfig ?? {} });
  const keys = ["name", "groupName", "quickCaptureEnabled", "statsConfig"] as const;
  const result = Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, parsed[key]]));
  if (!Object.keys(result).length) throw new ValidationError("没有可更新的字段");
  return result;
}

export function parseNewTrackerField(value: unknown, trackerId?: number) {
  const body = objectValue(value);
  const options = body.options === undefined ? [] : Array.isArray(body.options) && body.options.every((item) => typeof item === "string") ? [...new Set(body.options.map((item) => item.trim()).filter(Boolean))].slice(0, 50) : (() => { throw new ValidationError("字段选项格式不正确"); })();
  const type = enumValue(body.type, "字段类型", ["number", "single_select", "multi_select", "text", "boolean", "rating"] as const, "text") as TrackerFieldType;
  if ((type === "single_select" || type === "multi_select") && !options.length) throw new ValidationError("选择字段至少需要一个选项");
  return {
    trackerId: trackerId ?? positiveInteger(body.trackerId, "Tracker ID"), key: crypto.randomUUID(), name: text(body.name, "字段名称", 60)!, type,
    required: booleanValue(body.required, "必填状态", false), defaultValue: body.defaultValue ?? null, options,
    showAfterQuickCapture: booleanValue(body.showAfterQuickCapture, "快速记录后补充", false), includeInStats: booleanValue(body.includeInStats, "参与统计", false),
    sortOrder: numberValue(body.sortOrder, "排序", 0, 10000, 0),
    unit: text(body.unit ?? "", "字段单位", 20, false) ?? "",
    precision: Math.trunc(numberValue(body.precision, "小数位数", 0, 6, 0)),
    config: body.config === undefined ? {} : recordValue(body.config, "字段配置"),
    archivedAt: null,
  };
}

export function parseNewTrackerEntry(value: unknown, trackerId?: number) {
  const body = objectValue(value);
  const occurredAt = timestamp(body.occurredAt ?? new Date().toISOString());
  return { trackerId: trackerId ?? positiveInteger(body.trackerId, "Tracker ID"), occurredAt, endAt: null, values: body.values === undefined ? {} : recordValue(body.values, "记录字段"), note: text(body.note ?? "", "备注", 5000, false) ?? "" };
}

export function parseTrackerEntryPatch(value: unknown) {
  const body = objectValue(value);
  const result = {
    occurredAt: body.occurredAt === undefined ? undefined : timestamp(body.occurredAt),
    endAt: body.endAt === undefined ? undefined : null,
    values: body.values === undefined ? undefined : recordValue(body.values, "记录字段"),
    note: body.note === undefined ? undefined : text(body.note, "备注", 5000, false) ?? "",
  };
  if (Object.values(result).every((item) => item === undefined)) throw new ValidationError("没有可更新的字段");
  return result;
}

export function parseNewTrackerGoal(value: unknown, trackerId?: number) {
  const body = objectValue(value);
  return {
    trackerId: trackerId ?? positiveInteger(body.trackerId, "Tracker ID"),
    operator: enumValue(body.operator, "Goal 类型", ["<=", ">=", "="] as const, "<=") as TrackerGoalOperator,
    targetValue: numberValue(body.targetValue, "目标数量", 0.01, 100000, 1),
    periodType: enumValue(body.periodType, "周期", ["daily", "weekly", "monthly", "yearly", "custom"] as const, "monthly") as TrackerPeriodType,
    customPeriod: text(body.customPeriod ?? "", "自定义周期", 200, false) ?? "", enabled: booleanValue(body.enabled, "启用状态", true),
  };
}

export function parseNewTrackerReminder(value: unknown, trackerId?: number) {
  const body = objectValue(value);
  const reminderType = enumValue(body.reminderType, "提醒类型", ["scheduled", "interval"] as const, "interval") as TrackerReminderType;
  const intervalDays = body.intervalDays === undefined || body.intervalDays === null || body.intervalDays === "" ? null : positiveInteger(body.intervalDays, "间隔天数");
  const scheduleRule = text(body.scheduleRule ?? "", "定期规则", 300, false) ?? "";
  if (reminderType === "interval" && intervalDays === null) throw new ValidationError("间隔提醒需要填写天数");
  if (reminderType === "scheduled" && !scheduleRule) throw new ValidationError("定期提醒需要填写规则");
  return { trackerId: trackerId ?? positiveInteger(body.trackerId, "Tracker ID"), reminderType, scheduleRule, intervalDays, enabled: booleanValue(body.enabled, "启用状态", true) };
}
