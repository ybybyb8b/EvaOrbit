import type { MemoStatus, MemoType } from "./types";

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
