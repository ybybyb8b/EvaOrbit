import type { CatsDashboard } from "./cats-readonly";
import type { TrainingLog } from "./types";
import { dateInEvaOrbit, shiftDate } from "./time.ts";

export function catWidgetCare(dashboard: CatsDashboard, petId: number, includeHousehold: boolean) {
  const matches = (id: number | null) => id === petId || includeHousehold && id === null;
  const routines = dashboard.routines.filter(item => matches(item.petId));
  const pending = [
    ...routines.filter(item => item.enabled).map(routine => ({ id: `routine-${routine.id}`, title: routine.title, due: routine.nextDueAt, routine, reminder: null })),
    ...dashboard.oneTimeTasks.filter(item => item.isActive && item.nextDueAt && (item.targetType === "cat" && item.targetId === petId || includeHousehold && item.targetType === "cat_household")).map(reminder => ({ id: `reminder-${reminder.id}`, title: reminder.title, due: reminder.nextDueAt!, routine: null, reminder })),
  ].sort((a, b) => a.due.localeCompare(b.due));
  const completed = [
    ...routines.flatMap(item => item.lastCompletedOn || item.lastCompletedAt ? [{title:item.title,occurredAt:item.lastCompletedOn ?? item.lastCompletedAt!,hasExplicitTime:!item.lastCompletedOn}] : []),
    ...dashboard.timeline.filter(item => matches(item.petId) && item.kind === "event" && ["cat_routine","reminder"].includes(String(item.metadata.sourceType))).map(item => ({title:item.title,occurredAt:item.occurredAt,hasExplicitTime:item.occurredHasExplicitTime})),
  ];
  const latest = completed.sort((a,b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  return { next: pending[0] ?? null, pendingCount: pending.length, latest };
}
export function trainingWidgetRange(period: "week" | "month", today = dateInEvaOrbit()) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return { from: period === "month" ? `${today.slice(0, 7)}-01` : shiftDate(today, -((weekday + 6) % 7)), to: shiftDate(today, 1) };
}
export function trainingWidgetSummary(logs: TrainingLog[], period: "week" | "month", today = dateInEvaOrbit()) {
  const range = trainingWidgetRange(period, today);
  const existing = logs.filter(log => !log.workoutDeleted).sort((a,b) => b.occurredAt.localeCompare(a.occurredAt));
  const records = existing.filter(log => { const date = dateInEvaOrbit(new Date(log.occurredAt)); return date >= range.from && date < range.to; });
  return { count: records.length, minutes: records.reduce((total, log) => total + (log.durationMinutes ?? 0), 0), latest: existing[0] ?? null };
}
