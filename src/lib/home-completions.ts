import type { HomeCompletedItem } from "./home-day.ts";
import type { Reminder, ReminderOccurrence, TimelineEvent } from "./types.ts";
import { homeReminderTitle } from "./home-task-items.ts";
import { dateInEvaOrbit } from "./time.ts";
import { canCorrectReminderCompletion } from "./reminder-source-registry.ts";

type CompletedReminder = { occurrence: ReminderOccurrence; reminder: Reminder; subjectLabel: string };

/** Only persisted completion facts; snoozes, skips and future recurrence projections are not accomplishments. */
export function homeCompletions(date: string, records: CompletedReminder[], events: TimelineEvent[], petNames: Map<number, string> = new Map(), undoableEvents = new Set<number>()): HomeCompletedItem[] {
  const rows = new Map<string, HomeCompletedItem>();
  const representedEvents = new Set<number>();
  const representedPayments = new Set<string>();
  for (const { occurrence, reminder, subjectLabel } of records) {
    if (occurrence.action !== "completed" || (occurrence.completedOn ?? dateInEvaOrbit(new Date(occurrence.actedAt))) !== date) continue;
    // Ordinary tasks carry their own reversible completion state.
    if (reminder.targetType === "task") continue;
    if (reminder.sourceType === "period_medication" && events.some(event => event.eventType === "health.medication_dose"
      && event.metadata.medicationPresetId === reminder.sourceId && Date.parse(event.occurredAt) === Date.parse(occurrence.actedAt))) continue;
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
    const eventId = occurrence.createdEventId;
    const event = eventId === null ? undefined : events.find(item => item.id === `cat:event:${eventId}`);
    const routineId = reminder.sourceType === "cat_routine" ? reminder.sourceId ?? undefined : undefined;
    const correction = eventId !== null && event
      ? { kind:"cat" as const,eventId,routineId,canUndo:undoableEvents.has(eventId) }
      : eventId === null && canCorrectReminderCompletion(reminder)
        ? { kind:"reminder" as const,reminderId:reminder.id,occurrenceId:occurrence.id } : undefined;
    rows.set(key, { key,title:homeReminderTitle({ ...reminder,subjectLabel }),href,completedAt:event?.occurredAt??occurrence.actedAt,
      hasExplicitTime:event?.hasExplicitTime??false,correction,...(reminder.targetType==="tracker"?{handled:true}:{}) });
  }
  for (const event of events) {
    if (dateInEvaOrbit(new Date(event.occurredAt)) !== date) continue;
    const catCare = event.sourceType === "cat" && event.metadata.kind === "event" && ["cat.care", "cat.cleaning"].includes(event.eventType);
    const payment = event.eventType === "subscription.paid";
    const dose = event.eventType === "health.medication_dose";
    if (!catCare && !payment && !dose) continue;
    if (catCare && representedEvents.has(Number(event.sourceId))) continue;
    if (payment && representedPayments.has(`${event.metadata.subscriptionId}:${event.metadata.scheduledFor}`)) continue;
    const petName = catCare && event.relatedPets.length === 1 ? petNames.get(Number(event.relatedPets[0])) : undefined;
    const title = petName ? homeReminderTitle({targetType:"cat",subjectLabel:petName,title:event.title}) : event.title;
    const generated = catCare && ["cat_routine","reminder"].includes(String(event.metadata.sourceType));
    const eventId = Number(event.sourceId);
    const correction = generated ? {kind:"cat" as const,eventId,
      routineId:event.metadata.sourceType==="cat_routine"?Number(event.metadata.sourceId):undefined,canUndo:undoableEvents.has(eventId)} : undefined;
    rows.set(event.id, {key:event.id,title,href:event.href,completedAt:event.occurredAt,hasExplicitTime:event.hasExplicitTime,correction});
  }
  return [...rows.values()].sort((a,b)=>a.completedAt.localeCompare(b.completedAt)||a.key.localeCompare(b.key));
}
