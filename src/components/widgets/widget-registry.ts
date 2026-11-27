import type { ComponentType } from "react";
import type { WidgetInstance, WidgetType } from "@/lib/personal-widgets";
import type { ImportantDate } from "@/lib/important-dates";
import type { CatsDashboard } from "@/lib/cats-readonly";
import type { WidgetCardProps, WidgetConfigProps } from "./widget-types";
import type { useWidgetEnvironment } from "./widget-context";
import { TrackerWidget, TrackerWidgetConfig } from "./tracker-widget";
import { DaysWidget, DaysWidgetConfig } from "./days-widget";
import { CatCareWidget, CatCareWidgetConfig } from "./cat-care-widget";
import { TrainingWidget, TrainingWidgetConfig } from "./training-widget";

type Definition = { type: WidgetType; en: string; zh: string; description: {en:string;zh:string}; Card: ComponentType<WidgetCardProps>; Configure: ComponentType<WidgetConfigProps>; name: (widget: WidgetInstance, environment: ReturnType<typeof useWidgetEnvironment>) => Promise<string | undefined> };
export const widgetRegistry: Definition[] = [
  { type:"tracker", en:"Tracker", zh:"观测", description:{en:"A moment, a habit, a small daily ritual.",zh:"记录具体观测，延续日常习惯。"}, Card:TrackerWidget, Configure:TrackerWidgetConfig, name:async (widget,environment) => widget.type === "tracker" ? (await environment.trackerList()).find(item => item.id === widget.trackerId)?.name : undefined },
  { type:"days", en:"Days", zh:"如期", description:{en:"A date to look forward to, or remember.",zh:"期待一个日子，或纪念已经走过的时光。"}, Card:DaysWidget, Configure:DaysWidgetConfig, name:async (widget,environment) => widget.type === "days" ? (await environment.json<ImportantDate[]>("/api/important-dates")).find(item => item.id === widget.dateId)?.title : undefined },
  { type:"cat-care", en:"Cat Care", zh:"猫咪护理", description:{en:"Next care and the last little act of love.",zh:"下一项护理与最近完成的照料。"}, Card:CatCareWidget, Configure:CatCareWidgetConfig, name:async (widget,environment) => widget.type === "cat-care" ? (await environment.json<CatsDashboard>("/api/cats")).pets.find(item => item.pet.id === widget.petId)?.pet.name : undefined },
  { type:"training", en:"Training Summary", zh:"训练摘要", description:{en:"Your recent sessions, at a glance.",zh:"看看近期训练，继续下一次练习。"}, Card:TrainingWidget, Configure:TrainingWidgetConfig, name:async () => undefined },
];
export function widgetDefinition(type: WidgetType) { return widgetRegistry.find(item => item.type === type)!; }
