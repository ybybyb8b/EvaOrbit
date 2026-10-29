import type { HomeCompletedItem } from "./home-day.ts";
import type { Reminder, ReminderOccurrence, TimelineEvent } from "./types.ts";
import { homeReminderTitle } from "./home-task-items.ts";
import { dateInEvaOrbit } from "./time.ts";

type CompletedReminder = { occurrence: ReminderOccurrence; reminder: Reminder; subjectLabel: string };

/** Only persisted completion facts; snoozes, skips and future recurrence projections are not accomplishments. */
export function homeCompletions(date: string, records: CompletedReminder[], events: TimelineEvent[], petNames: Map<number, string> = new Map()): HomeCompletedItem[] {
  const rows = new Map<string, HomeCompletedItem>();
  const representedEvents = new Set<number>();
  const representedPayments = new Set<string>();
  for (const { occurrence, reminder, subjectLabel } of records) {
    if (occurrence.action !== "completed" || dateInEvaOrbit(new Date(occurrence.actedAt)) !== date) continue;
    // Ordinary tasks carry their own reversible completion state and timestamp.
    if (reminder.targetType === "task") continue;
    const identity = reminder.sourceType && reminder.sourceId != null ? `source:${reminder.sourceType}:${reminder.sourceId}` : `reminder:${reminder.id}`;
    const key = `${identity}:${occurrence.scheduledFor}`;
    if (occurrence.createdEventId != null) representedEvents.add(occurrence.createdEventId);
    if (rows.has(key)) continue;
    if (reminder.targetType === "subscription" && reminder.targetId != null) {
      representedPayments.add(`${reminder.targetId}:${dateInEvaOrbit(new Date(occurrence.scheduledFor))}`);
    }
    const href = reminder.targetType === "cat" && reminder.targetId ? `/cats/${reminder.targetId}`
      : reminder.targetType === "cat_household" || reminder.targetType === "cat_food" ? "/cats"
      : reminder.targetType === "subscription" && reminder.targetId ? `/subscriptions/${reminder.targetId}`
      : reminder.targetType === "tracker" && reminder.targetId ? `/trackers/${reminder.targetId}`
      : reminder.targetType === "health" ? "/health" : "/notifications";
    rows.set(key, { key, title: homeReminderTitle({ ...reminder, subjectLabel }), href, completedAt: occurrence.actedAt, hasExplicitTime: true });
  }
  for (const event of events) {
    if (dateInEvaOrbit(new Date(event.occurredAt)) !== date) continue;
    const catCare = event.sourceType === "cat" && event.metadata.kind === "event" && ["cat.care", "cat.cleaning"].includes(event.eventType);
    const payment = event.eventType === "subscription.paid";
    const dose = event.eventType === "health.medication_dose";
    if (!catCare && !payment && !dose) continue;
    if (catCare && representedEvents.has(Number(event.sourceId))) continue;
    if (payment && representedPayments.has(`${event.metadata.subscriptionId}:${event.metadata.scheduledFor}`)) continue;
    // A medication reminder completion and its real dose record describe the same action.
    if (dose && records.some(({reminder,occurrence}) => reminder.sourceType === "period_medication" && reminder.sourceId === event.metadata.medicationPresetId && occurrence.action === "completed" && occurrence.actedAt === event.occurredAt)) continue;
    const petName = catCare && event.relatedPets.length === 1 ? petNames.get(Number(event.relatedPets[0])) : undefined;
    const title = petName ? homeReminderTitle({targetType:"cat",subjectLabel:petName,title:event.title}) : event.title;
    rows.set(event.id, {key:event.id,title,href:event.href,completedAt:event.occurredAt,hasExplicitTime:event.hasExplicitTime});
  }
  return [...rows.values()].sort((a,b)=>a.completedAt.localeCompare(b.completedAt)||a.key.localeCompare(b.key));
}
