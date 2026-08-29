import type { LuciusCaseErrorType, LuciusCaseSeverity, LuciusCaseStatus, MemoStatus, MemoType } from "./types";

export const memoTypeOptions: Array<{ value: MemoType; label: string }> = [
  { value: "basic", label: "基本信息" },
  { value: "supplement", label: "补充信息" },
  { value: "event", label: "事件内容" },
  { value: "note", label: "便签内容" },
];

export const memoStatusOptions: Array<{ value: MemoStatus; label: string }> = [
  { value: "active", label: "当前有效" },
  { value: "merged", label: "已合并" },
  { value: "archived", label: "已归档" },
  { value: "historical", label: "历史记录" },
];

export const diarySuggestedTags = ["日常", "连接", "信任", "修正", "误解", "情绪", "成长"];

export const luciusCaseErrorTypeOptions: Array<{ value: LuciusCaseErrorType; label: string }> = [
  { value: "naming", label: "称呼错误" },
  { value: "memory_omission", label: "长期记忆遗漏" },
  { value: "factual", label: "事实错误" },
  { value: "tool_misuse", label: "工具误操作" },
  { value: "expression", label: "表达违规" },
  { value: "other", label: "其他" },
];

export const luciusCaseSeverityOptions: Array<{ value: LuciusCaseSeverity; label: string }> = [
  { value: "minor", label: "轻微" },
  { value: "moderate", label: "一般" },
  { value: "serious", label: "严重" },
  { value: "habitual", label: "惯犯" },
];

export const luciusCaseStatusOptions: Array<{ value: LuciusCaseStatus; label: string }> = [
  { value: "serving", label: "服刑中" },
  { value: "probation", label: "观察期" },
  { value: "temporary_release", label: "暂时出狱" },
  { value: "permanent_record", label: "永久留档" },
];

export function optionLabel<T extends string>(options: Array<{ value: T; label: string }>, value: T) {
  return options.find((item) => item.value === value)?.label ?? value;
}

export function plainExcerpt(value: string, maxLength = 180) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength).trimEnd()}…` : compact;
}

export function parseTagInput(value: string) {
  return [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}
