import type { HomeDayOverview } from "./home-day";
import type { DueReminder } from "./types";

export type HomeTaskItem = { key: string; task?: HomeDayOverview["tasks"][number]; reminders: DueReminder[] };

export function homeReminderTitle(item: Pick<DueReminder,"targetType"|"subjectLabel"|"title">) {
  const name=item.subjectLabel.trim(),title=item.title.trim();
  if(!["cat","cat_household"].includes(item.targetType)||!name||/^(cat|cats)$/i.test(name))return title;
  if(title===name||title.split(/\s*[·:：]\s*/,1)[0]===name)return title;
  return `${name} · ${title}`;
}

/** Identity, never title matching: distinct tasks can share the same wording. */
export function homeTaskItems(tasks: HomeDayOverview["tasks"], reminders: DueReminder[]): HomeTaskItem[] {
  const rows = new Map<string, HomeTaskItem>();
  for (const reminder of reminders) {
    // A cat/person is a subject, not a task: two routines for one cat stay separate.
    const key = reminder.targetType === "task" && reminder.targetId != null ? `task:${reminder.targetId}`
      : reminder.sourceType && reminder.sourceId != null ? `source:${reminder.sourceType}:${reminder.sourceId}` : `reminder:${reminder.id}`;
    const row = rows.get(key) ?? { key, reminders: [] };
    if (!row.reminders.some(item => item.id === reminder.id)) row.reminders.push(reminder);
    rows.set(key, row);
  }
  for (const task of tasks) {
    const key = `task:${task.id}`;
    const row = rows.get(key) ?? { key, reminders: [] };
    row.task = task;
    rows.set(key, row);
  }
  return [...rows.values()];
}
