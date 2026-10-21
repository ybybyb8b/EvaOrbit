import {Activity,Cat,Cup,ForkKnife,Inbox} from "reicon-react";
import {HEALTH_QUICK_LOGS, type HealthQuickLogKind} from "@/app/health/health-quick-log";
import type {QuickLogOption} from "./quick-log-picker";

export type QuickEntryKind="food"|"drink"|"tracker"|"cats"|"inbox"|HealthQuickLogKind;
export const QUICK_LOG_OPTIONS:QuickLogOption<QuickEntryKind>[]=[
  {kind:"food",icon:ForkKnife,en:"Food",zh:"饮食"},
  {kind:"drink",icon:Cup,en:"Drink",zh:"饮品"},
  ...HEALTH_QUICK_LOGS,
  {kind:"tracker",icon:Activity,en:"Tracker",zh:"观测"},
  {kind:"cats",icon:Cat,en:"Cats",zh:"猫咪"},
  {kind:"inbox",icon:Inbox,en:"Inbox",zh:"散落"},
];
