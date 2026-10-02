export type CalendarCategory = { id: string; name: string; kind: "sleep" | "activity" };
export type CalendarRule = { id: string; prefix: string; categoryId: string; enabled: boolean; includeInSummary: boolean };
export type CalendarInterpretation = { revision: number; categories: CalendarCategory[]; rules: CalendarRule[] };

export function defaultCalendarInterpretation(): CalendarInterpretation {
  return {
    revision: 0,
    categories: [{ id: "sleep", name: "睡眠", kind: "sleep" }, { id: "phone", name: "手机使用", kind: "activity" }, { id: "screen", name: "电视电影", kind: "activity" }, { id: "gaming", name: "游戏", kind: "activity" }],
    rules: [["sleep", "😴"], ["phone", "🍠"], ["screen", "📺"], ["gaming", "🎮"]].map(([categoryId, prefix]) => ({ id: categoryId, prefix, categoryId, enabled: true, includeInSummary: categoryId !== "sleep" })),
  };
}

export function calendarCategoryLabel(category: CalendarCategory, english: boolean) {
  const defaults = defaultCalendarInterpretation().categories.find(item => item.id === category.id);
  const englishNames: Record<string, string> = { sleep: "Sleep", phone: "phone use", screen: "TV and movies", gaming: "gaming" };
  return english && defaults?.name === category.name ? englishNames[category.id] : category.name;
}

export function normalizedCalendarPrefix(value: string) { return value.normalize("NFC").replace(/[\uFE0E\uFE0F]/g, "").trim(); }
export function matchingCalendarRule(title: string, settings: CalendarInterpretation, includeDisabled = false) {
  const normalized = normalizedCalendarPrefix(title);
  const match = (rule: CalendarRule) => normalized.startsWith(normalizedCalendarPrefix(rule.prefix));
  return settings.rules.find(rule => rule.enabled && match(rule)) ?? (includeDisabled ? settings.rules.find(match) : null) ?? null;
}

export function parseCalendarInterpretation(value: unknown): CalendarInterpretation {
  const object = (input: unknown): Record<string, unknown> => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("日历解读格式不正确");
    return input as Record<string, unknown>;
  };
  const text = (input: unknown, max: number) => {
    if (typeof input !== "string" || !input.trim() || input.trim().length > max || /[\u0000-\u001f]/.test(input)) throw new Error("名称或前缀格式不正确");
    return input.trim();
  };
  const body = object(value);
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || Number(body.revision) >= Number.MAX_SAFE_INTEGER) throw new Error("规则版本不正确");
  if (!Array.isArray(body.categories) || body.categories.length > 100 || !Array.isArray(body.rules) || body.rules.length > 200) throw new Error("分类或规则数量不正确");
  const categories: CalendarCategory[] = body.categories.map(item => {
    const category = object(item), id = text(category.id, 80), name = text(category.name, 60);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || !["sleep", "activity"].includes(String(category.kind)) || (category.kind === "sleep" && id !== "sleep")) throw new Error("分类格式不正确");
    return { id, name, kind: category.kind as CalendarCategory["kind"] };
  });
  if (new Set(categories.map(item => item.id)).size !== categories.length || new Set(categories.map(item => item.name.normalize("NFC").toLowerCase())).size !== categories.length) throw new Error("分类重复");
  const rules: CalendarRule[] = body.rules.map(item => {
    const rule = object(item), id = text(rule.id, 80), prefix = text(rule.prefix, 80), categoryId = text(rule.categoryId, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || !normalizedCalendarPrefix(prefix) || !categories.some(category => category.id === categoryId) || typeof rule.enabled !== "boolean" || typeof rule.includeInSummary !== "boolean") throw new Error("规则格式不正确");
    return { id, prefix, categoryId, enabled: rule.enabled, includeInSummary: rule.includeInSummary };
  });
  if (new Set(rules.map(item => item.id)).size !== rules.length) throw new Error("规则重复");
  const active = rules.filter(rule => rule.enabled);
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const left = normalizedCalendarPrefix(active[i].prefix), right = normalizedCalendarPrefix(active[j].prefix);
    if (left.startsWith(right) || right.startsWith(left)) throw new Error(`前缀冲突：${active[i].prefix} / ${active[j].prefix}`);
  }
  return { revision: Number(body.revision), categories, rules };
}

export function suggestedCalendarPrefix(title: string) {
  const first = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(title.trimStart()))[0]?.segment ?? "";
  return /\p{Extended_Pictographic}/u.test(first) ? first : title.trim().split(/\s+/)[0]?.slice(0, 80) ?? "";
}
