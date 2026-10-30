import "server-only";
import { getRepository } from "../repositories";
import type { EvaOrbitRepository } from "../repositories/types";
import { calendarMealType } from "../meal-calendar";
import { associationContextRange, matchTimelineAssociations, parseTimelineAssociation, readAssociationPages } from "../timeline-association";
import { ValidationError } from "../validation";
import type { CalendarInterpretation } from "../calendar-interpretation";
import type { Tracker } from "../types";

export async function getTimelineAssociationOverview() {
  const repository = await getRepository();
  const [settings, trackers] = await Promise.all([repository.getTimelineAssociation(), repository.listTrackers()]);
  return { settings, trackers };
}

export async function saveTimelineAssociation(value: unknown) {
  let settings;
  try { settings = parseTimelineAssociation(value); }
  catch (error) { throw new ValidationError(error instanceof Error ? error.message : "关联规则格式不正确"); }
  const repository = await getRepository();
  for (const id of new Set(settings.rules.filter(rule => rule.enabled).map(rule => rule.trackerId))) {
    if (!await repository.getTracker(id)) throw new ValidationError("关联的 Tracker 已不存在，请重新选择或停用该规则");
  }
  return repository.updateTimelineAssociation(settings);
}

export async function readTimelineAssociations(repository: EvaOrbitRepository, range: { from: string; to: string }, trackers: Tracker[], interpretation: CalendarInterpretation) {
  const settings = await repository.getTimelineAssociation();
  if (!settings.rules.some(rule => rule.enabled)) return [];
  const context = associationContextRange(range);
  const [calendars, entries] = await Promise.all([
    readAssociationPages((afterId, limit) => repository.listCalendarEvents({ ...context, afterId, limit })),
    readAssociationPages((afterId, limit) => repository.listTrackerEntries(undefined, { ...context, afterId, limit })),
  ]);
  // Existing Food interpretation owns meal windows; Tracker rules cannot consume
  // them and change the established Calendar ↔ Food behavior.
  return matchTimelineAssociations(settings, calendars.records.filter(event => !calendarMealType(event, interpretation)), entries.records, trackers, calendars.complete && entries.complete);
}
