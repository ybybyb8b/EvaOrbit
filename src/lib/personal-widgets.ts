import { defaultStackIds, parseStackIds, type StackTracker } from "./home-tracker-stack.ts";

export type WidgetInstance =
  | { id: string; type: "tracker"; trackerId: string; showDetails: boolean }
  | { id: string; type: "days"; dateId: number; display: "next" | "elapsed" }
  | { id: string; type: "cat-care"; petId: number; includeHousehold: boolean }
  | { id: string; type: "training"; period: "week" | "month" };
export type WidgetType = WidgetInstance["type"];
export type WidgetStackConfig = { version: 1; widgets: WidgetInstance[]; activeId: string | null };
export const emptyWidgetStack = (): WidgetStackConfig => ({ version: 1, widgets: [], activeId: null });

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
export function validWidget(value: unknown): value is WidgetInstance {
  if (!object(value) || typeof value.id !== "string" || !value.id || value.id.length > 200) return false;
  switch (value.type) {
    case "tracker": return typeof value.trackerId === "string" && !!value.trackerId && value.trackerId.length <= 200 && typeof value.showDetails === "boolean";
    case "days": return Number.isSafeInteger(value.dateId) && Number(value.dateId) > 0 && ["next", "elapsed"].includes(String(value.display));
    case "cat-care": return Number.isSafeInteger(value.petId) && Number(value.petId) > 0 && typeof value.includeHousehold === "boolean";
    case "training": return ["week", "month"].includes(String(value.period));
    default: return false;
  }
}
export function parseWidgetStack(raw: string | null): WidgetStackConfig | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!object(value) || value.version !== 1 || !Array.isArray(value.widgets) || value.widgets.length > 100 || !value.widgets.every(validWidget)) return null;
    const widgets = value.widgets as WidgetInstance[];
    if (new Set(widgets.map(widget => widget.id)).size !== widgets.length) return null;
    return { version: 1, widgets, activeId: widgets.some(widget => widget.id === value.activeId) ? value.activeId as string : widgets[0]?.id ?? null };
  } catch { return null; }
}
export function initialWidgetStack(trackers: StackTracker[], legacy: string | null): WidgetStackConfig {
  const ids = parseStackIds(legacy) ?? defaultStackIds(trackers);
  const widgets: WidgetInstance[] = ids.map(trackerId => ({ id: `tracker-${trackerId}`, type: "tracker", trackerId, showDetails: true }));
  return { ...emptyWidgetStack(), widgets, activeId: widgets[0]?.id ?? null };
}
export function reorderWidgets(config: WidgetStackConfig, id: string, target: number): WidgetStackConfig {
  const widgets = [...config.widgets], index = widgets.findIndex(widget => widget.id === id);
  if (index < 0 || target < 0 || target >= widgets.length) return config;
  widgets.splice(target, 0, widgets.splice(index, 1)[0]);
  return { ...config, widgets };
}
export function removeWidget(config: WidgetStackConfig, id: string): WidgetStackConfig {
  const index = config.widgets.findIndex(widget => widget.id === id), widgets = config.widgets.filter(widget => widget.id !== id);
  return { ...config, widgets, activeId: config.activeId === id ? widgets[Math.min(index, widgets.length - 1)]?.id ?? null : config.activeId };
}
