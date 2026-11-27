import type { WidgetInstance } from "@/lib/personal-widgets";
export type WidgetCardProps = { widget: WidgetInstance };
export type WidgetConfigProps = { id: string; initial?: WidgetInstance; onSave: (widget: WidgetInstance) => void };
