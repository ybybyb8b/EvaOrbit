import "server-only";

import { ConflictError } from "../errors";
import { REMINDER_SOURCE_REGISTRY } from "../reminder-source-registry";
import { getRepository } from "../repositories";
import type { NewTask, TaskFilter } from "../repositories/types";
import { EVAORBIT_TIME_ZONE, zonedDateTimeToUtc } from "../time";

async function reconcileTaskReminder(id: number) {
  const repository = await getRepository();
  const task = await repository.getTask(id);
  if (!task) return null;

  const dueAt = task.dueDate && task.dueTime
    ? zonedDateTimeToUtc(task.dueDate, task.dueTime, EVAORBIT_TIME_ZONE)
    : null;
  const enabled = !task.completed && Boolean(dueAt);
  const existing = task.reminderId
    ? await repository.getReminder(task.reminderId)
    : (await repository.listReminders({ targetType: "task", targetId: task.id }))
        .find((item) => item.sourceType === REMINDER_SOURCE_REGISTRY.task_due.sourceType) ?? null;

  if (existing) {
    await repository.updateReminder(existing.id, {
      title: task.title,
      targetType: "task",
      targetId: task.id,
      sourceType: REMINDER_SOURCE_REGISTRY.task_due.sourceType,
      sourceId: task.id,
      scheduleType: "one_time",
      startsAt: dueAt ?? existing.startsAt,
      nextDueAt: enabled ? dueAt : null,
      dueHasExplicitTime: Boolean(dueAt),
      intervalValue: null,
      intervalUnit: null,
      timesOfDay: [],
      endsAt: null,
      timezone: EVAORBIT_TIME_ZONE,
      note: task.notes,
      leadTimeMinutes: 0,
      repeatWhileOverdue: false,
      status: enabled ? "scheduled" : task.completed ? "completed" : "cancelled",
      isActive: enabled,
      cancelledAt: enabled ? null : new Date().toISOString(),
      snoozedUntil: null,
      lastNotifiedAt: null,
      sentAt: null,
    });
    if (task.reminderId !== existing.id) await repository.updateTask(task.id, { reminderId: existing.id });
  } else if (enabled && dueAt) {
    const reminder = await repository.createReminder({
      title: task.title,
      targetType: "task",
      targetId: task.id,
      sourceType: REMINDER_SOURCE_REGISTRY.task_due.sourceType,
      sourceId: task.id,
      scheduleType: "one_time",
      startsAt: dueAt,
      nextDueAt: dueAt,
      dueHasExplicitTime: true,
      intervalValue: null,
      intervalUnit: null,
      timesOfDay: [],
      endsAt: null,
      timezone: EVAORBIT_TIME_ZONE,
      note: task.notes,
      leadTimeMinutes: 0,
      repeatWhileOverdue: false,
      status: "scheduled",
      isActive: true,
    });
    await repository.updateTask(task.id, { reminderId: reminder.id });
  }

  return repository.getTask(task.id);
}

export async function listTasks(filter: TaskFilter = "all") { return (await getRepository()).listTasks(filter); }
export async function getTask(id: number) { return (await getRepository()).getTask(id); }

export async function createTask(input: NewTask) {
  if (input.dueTime && !input.dueDate) throw new ConflictError("设置截止时间前需要先选择截止日期");
  const task = await (await getRepository()).createTask(input);
  return await reconcileTaskReminder(task.id) ?? task;
}

export async function updateTask(id: number, input: Record<string, unknown>) {
  const repository = await getRepository();
  const current = await repository.getTask(id);
  if (!current) return null;
  const patch = { ...input };
  if (patch.dueDate === null) patch.dueTime = null;
  const nextDueDate = patch.dueDate === undefined ? current.dueDate : patch.dueDate;
  const nextDueTime = patch.dueTime === undefined ? current.dueTime : patch.dueTime;
  if (nextDueTime && !nextDueDate) throw new ConflictError("设置截止时间前需要先选择截止日期");
  const task = await repository.updateTask(id, patch);
  return task ? reconcileTaskReminder(id) : null;
}

export async function deleteTask(id: number) {
  const repository = await getRepository();
  const task = await repository.getTask(id);
  if (!task) return false;
  if (task.reminderId) await repository.deleteReminder(task.reminderId);
  return repository.deleteTask(id);
}
