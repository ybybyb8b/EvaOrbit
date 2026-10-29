import { createHash } from "node:crypto";
import { dateInEvaOrbit, dateRange, EVAORBIT_TIME_ZONE, shiftDate } from "./time.ts";
import { ValidationError } from "./validation.ts";
import { buildFoodDrinkInsights } from "./food-drink-insights.ts";
import { buildTrackerInsights } from "./tracker-insights.ts";
import { calculateDailyNutrition } from "./nutrition.ts";
import { checkInsightMeals, INSIGHT_FINGERPRINT_VERSION } from "./insight-review.ts";
import type { EvaOrbitRepository } from "./repositories/types.ts";

export const insightReadMethods = ["listFoodLogs", "listDrinkLogs", "listTrainingLogs", "listHealthRecords", "listWeightRecords", "listMenstrualFlowRecords", "listTrackerEntries", "listTrackers", "listTrackerFields", "listTasks", "getNutritionSettings"] as const;
export type InsightReader = Pick<EvaOrbitRepository, typeof insightReadMethods[number]>;
export type InsightPeriod = ReturnType<typeof insightPeriod>;
export type InsightHistoricalReportRef = { id: string; periodStart: string; currentVersion: number };

/** Phase 1 deliberately accepts only ended natural days; larger periods have no misleading fallback. */
export function insightPeriod(id: unknown, now = new Date()) {
  const today = dateInEvaOrbit(now);
  const date = id === "yesterday" ? shiftDate(today, -1) : typeof id === "string" && /^day\/\d{4}-\d{2}-\d{2}$/.test(id) ? id.slice(4) : "";
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!date || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date >= today)
    throw new ValidationError("insight_context ID must be yesterday or day/YYYY-MM-DD for an ended day; month/quarter/year are not supported in Phase 1");
  return { type: "daily" as const, id: `day/${date}`, date, timeZone: EVAORBIT_TIME_ZONE, ...dateRange(date), baseline: { from: dateRange(shiftDate(date, -30)).from, to: dateRange(date).from, days: 30 } };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function ordered<T extends { id: number }>(rows: T[]) { return [...rows].sort((a, b) => a.id - b.id); }
const sources = ["food", "drink", "training", "health", "weight", "periodFlow", "tracker"] as const;
type Source = typeof sources[number];
type DailyRows = {
  food: Awaited<ReturnType<InsightReader["listFoodLogs"]>>;
  drink: Awaited<ReturnType<InsightReader["listDrinkLogs"]>>;
  training: Awaited<ReturnType<InsightReader["listTrainingLogs"]>>;
  health: Awaited<ReturnType<InsightReader["listHealthRecords"]>>;
  weight: Awaited<ReturnType<InsightReader["listWeightRecords"]>>;
  periodFlow: Awaited<ReturnType<InsightReader["listMenstrualFlowRecords"]>>;
  tracker: Awaited<ReturnType<InsightReader["listTrackerEntries"]>>;
};
const resources: Record<Source, string | null> = { food: "food_log", drink: "drink_log", training: "training_log", health: "health_record", weight: null, periodFlow: null, tracker: "tracker" };
const tables: Record<Source, string> = { food: "food_logs", drink: "drink_logs", training: "training_logs", health: "health_records", weight: "weight_records", periodFlow: "menstrual_flow_records", tracker: "tracker_entries" };
const hrefs: Record<Source, string> = { food: "/food", drink: "/drinks/history", training: "/health?view=training", health: "/health", weight: "/health", periodFlow: "/health", tracker: "/trackers" };

/** Only the supplied audited reads are used. No business services with reconciliation effects. */
export async function buildInsightContext(reader: InsightReader, period: InsightPeriod, capturedAt: string, relatedReports: InsightHistoricalReportRef[] = []) {
  // ponytail: daily bounded queries avoid changing shared list contracts; capped days suppress conclusions.
  const days: Array<{ date: string; rows: DailyRows; capped: Source[] }> = [];
  for (let offset = -30; offset <= 0; offset++) {
    const date = shiftDate(period.date, offset), range = dateRange(date);
    const [food, drink, training, health, weight, periodFlow, tracker] = await Promise.all([
      reader.listFoodLogs({ ...range, limit: 500 }), reader.listDrinkLogs({ ...range, limit: 500 }),
      reader.listTrainingLogs({ ...range, limit: 100 }), reader.listHealthRecords({ ...range, limit: 100 }),
      reader.listWeightRecords({ ...range, limit: 500 }), reader.listMenstrualFlowRecords({ ...range, limit: 500 }),
      reader.listTrackerEntries(undefined, range),
    ]);
    const rows = { food: ordered(food), drink: ordered(drink), training: ordered(training), health: ordered(health), weight: ordered(weight), periodFlow: ordered(periodFlow), tracker: ordered(tracker) };
    const caps = { food: 500, drink: 500, training: 100, health: 100, weight: 500, periodFlow: 500, tracker: 1000 };
    days.push({ date, rows, capped: sources.filter(key => rows[key].length >= caps[key]) });
  }
  const [tasksRaw, trackersRaw, energy] = await Promise.all([reader.listTasks("all"), reader.listTrackers(), reader.getNutritionSettings(period.date)]);
  const tasks = ordered(tasksRaw), trackers = ordered(trackersRaw);
  const target = days.at(-1)!, baseline = days.slice(0, -1);
  const recording = checkInsightMeals(period.date, target.rows.food, target.capped.includes("food"));
  const unknownCalories = [...target.rows.food, ...target.rows.drink].filter(row => row.estimatedKcal === null && row.kcalMin === null && row.kcalMax === null).length;
  const nutrition = calculateDailyNutrition(period.date, target.rows.food, target.rows.drink, energy);
  // Recorded intake is partial by definition; it cannot establish an actual caloric deficit.
  nutrition.energyBalance = nutrition.energyBalanceMin = nutrition.energyBalanceMax = null;
  if (energy.restingEnergyKcal === null || energy.activeEnergyKcal === null) nutrition.totalExpenditureKcal = null;
  const coverage = Object.fromEntries(sources.map(source => [source, {
    status: days.some(day => day.capped.includes(source)) ? "possibly_truncated" : "within_query_limits",
    sampleCount: days.reduce((sum, day) => sum + day.rows[source].length, 0),
    daysWithRecords: days.filter(day => day.rows[source].length > 0).length,
    cappedDates: days.filter(day => day.capped.includes(source)).map(day => day.date),
    recordingCompleteness: "unknown", // Empty records never prove no real-world activity.
  }]));
  const metrics = Object.fromEntries(sources.map(source => {
    const complete = !days.some(day => day.capped.includes(source));
    const counts = baseline.map(day => day.rows[source].length), current = target.rows[source].length;
    const mean7 = counts.slice(-7).reduce((a, b) => a + b, 0) / 7, mean30 = counts.reduce((a, b) => a + b, 0) / 30;
    return [source, { observedCount: current, complete, baseline7DailyMean: complete ? mean7 : null, baseline30DailyMean: complete ? mean30 : null,
      deltaFrom7DailyMean: complete ? current - mean7 : null, baselineDaysWithRecords: counts.filter(n => n > 0).length,
      baseline7HasRepeatedObservations: complete && counts.slice(-7).filter(n => n > 0).length >= 3 && counts.slice(-7).reduce((a, b) => a + b, 0) >= 5,
      dailyCounts: days.map(day => ({ date: day.date, observedCount: day.rows[source].length, complete: !day.capped.includes(source) })) }];
  }));
  const allFood = days.flatMap(day => day.rows.food), allDrink = days.flatMap(day => day.rows.drink);
  const foodComplete = !days.some(day => day.capped.includes("food") || day.capped.includes("drink"));
  const evidence = sources.flatMap(source => target.rows[source].map(row => ({ source, table: tables[source], resource: resources[source], id: row.id,
    resourceId: "trackerId" in row ? row.trackerId : resources[source] ? row.id : null,
    occurredAt: row.occurredAt, href: source === "tracker" ? `/trackers/${(row as { trackerId: number }).trackerId}` : hrefs[source],
    ...("occurredHasExplicitTime" in row ? { hasExplicitTime: row.occurredHasExplicitTime } : {}),
    ...("source" in row ? { provenance: row.source } : {}),
    ...("title" in row ? { title: row.title } : {}),
    ...("name" in row ? { name: row.name } : {}),
    ...("mealType" in row ? { mealType: row.mealType } : {}),
    ...("summary" in row ? { summary: row.summary } : {}),
    ...("trainingType" in row ? { trainingType: row.trainingType, durationMinutes: row.durationMinutes } : {}),
    ...("weightKg" in row ? { weightKg: row.weightKg } : {}),
    ...("flow" in row ? { flow: row.flow } : {}),
  })));
  const trackerEntries = days.flatMap(day => day.rows.tracker);
  const trackerIds = [...new Set(trackerEntries.map(row => row.trackerId))].sort((a, b) => a - b);
  const fieldSnapshots = [];
  const trackerStatistics = [];
  for (const id of trackerIds.slice(0, 20)) {
    const fields = ordered(await reader.listTrackerFields(id));
    fieldSnapshots.push({ id, fields });
    const summarize = (entries: typeof trackerEntries) => {
      const newestFirst = [...entries].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id);
      const { activeDays, numericFields, choiceFields } = buildTrackerInsights(newestFirst, fields, new Date(period.from), 1);
      return { activeDays, numericFields: numericFields.slice(0, 20), choiceFields: choiceFields.slice(0, 20).map(field => ({ ...field, values: field.values.slice(0, 20), valuesTruncated: field.values.length > 20 })), fieldsTruncated: numericFields.length > 20 || choiceFields.length > 20 };
    };
    trackerStatistics.push({ id, name: trackers.find(row => row.id === id)?.name ?? null,
      complete: fields.length < 1000 && trackers.length < 1000 && !days.some(day => day.capped.includes("tracker")),
      daily: summarize(target.rows.tracker.filter(row => row.trackerId === id)),
      baseline30: summarize(baseline.flatMap(day => day.rows.tracker).filter(row => row.trackerId === id)),
    });
  }
  const due = tasks.filter(task => task.dueDate === period.date);
  const completed = tasks.filter(task => task.completed && task.completedAt && Date.parse(task.completedAt) >= Date.parse(period.from) && Date.parse(task.completedAt) < Date.parse(period.to));
  const taskEvidence = [...new Map([...due, ...completed].map(task => [task.id, { source: "task", resource: "task", id: task.id, href: "/tasks", title: task.title, dueDate: task.dueDate, completed: task.completed, completedAt: task.completedAt }])).values()];
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const baselineReferences = baseline.flatMap(day => sources.flatMap(source => day.rows[source].map(row => ({ source, table: tables[source], resource: resources[source], resourceId: "trackerId" in row ? row.trackerId : resources[source] ? row.id : null, id: row.id, occurredAt: row.occurredAt }))));
  // Reports are outputs, never source data: another report must not invalidate this day's analysis.
  const input = { fingerprintVersion: INSIGHT_FINGERPRINT_VERSION, period, days, tasks, trackers, energy, fieldSnapshots };
  return {
    analysisGuidance: ["先检查 recording.complete；缺午餐或晚餐时仅提示补录。", "summary 用自然中文分段回顾当天已记录的生活，不罗列技术字段。", "规则候选只供筛选和核对，不要逐条拼接。没有显著变化时 findings 可以为空；只选最多三条有实际信息价值的发现。", "不得把没有记录解释为没有活动或没有吃饭；已记录热量只是估算，不推断真实摄入或热量缺口。"],
    schemaVersion: 2, fingerprintVersion: INSIGHT_FINGERPRINT_VERSION, period, capturedAt, relatedReports, recording,
    overview: { foodCount: target.rows.food.length, drinkCount: target.rows.drink.length,
      recordedIntakeKcal: target.rows.food.length + target.rows.drink.length > unknownCalories ? nutrition.estimatedIntakeKcal : null, unknownCalories,
      trainingCount: target.rows.training.length, trainingMinutes: target.rows.training.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0),
      trackerCount: target.rows.tracker.length, completedTasks: completed.length,
      events: [...target.rows.food.map(row => ({ label: row.title, kind: row.mealType })), ...target.rows.drink.map(row => ({ label: row.name, kind: "drink" })), ...target.rows.training.map(row => ({ label: row.trainingType, kind: "training" }))].slice(0, 20) },
    snapshotFingerprint: createHash("sha256").update(canonical(input)).digest("hex"),
    consistency: "Independent read queries; concurrent edits may require recapture. Fingerprint excludes capture time and report references; covers loaded source inputs, not omitted or capped data.",
    coverage, metrics, trackerStatistics,
    metadataCoverage: { tasksPossiblyTruncated: tasks.length >= 1000, trackersPossiblyTruncated: trackers.length >= 1000, trackerFieldsPossiblyTruncated: fieldSnapshots.filter(item => item.fields.length >= 1000).map(item => item.id) },
    domainMetrics: {
      training: { recordedMinutes: target.rows.training.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0), missingDurationCount: target.rows.training.filter(row => row.durationMinutes === null).length },
      weight: { dailyMeanKg: mean(target.rows.weight.map(row => row.weightKg)), baseline7MeanKg: mean(baseline.slice(-7).flatMap(day => day.rows.weight.map(row => row.weightKg))), semantics: "Observation means; manual/Apple Health records may overlap. Not a deduplicated daily body-weight trend." },
      health: Object.fromEntries([...new Set(target.rows.health.map(row => row.type))].sort().map(type => [type, target.rows.health.filter(row => row.type === type).length])),
    },
    tasks: { dueCount: due.length, completedCount: completed.length, complete: tasks.length < 1000, missingCompletionTime: tasks.filter(task => task.completed && !task.completedAt).length, semantics: "dueDate is date-only; completion uses completedAt; current status does not reconstruct historical status" },
    nutrition: { summary: foodComplete ? nutrition : null,
      scope: "Recorded Food/Drink estimates and manual energy only; unknown calories may contribute zero. Not an actual intake measurement or effective nutrition_daily energy summary.",
      healthKitEnergy: "unavailable_in_repository_context", manualEnergy: energy },
    findings: foodComplete ? buildFoodDrinkInsights(allFood, allDrink, period.date, true).filter(finding => finding.id.startsWith("change-") || finding.id.startsWith("preference-") && finding.body.includes("此前")).map(finding => ({ ...finding, method: "rule", kind: "interpretation", evidenceWindow: { from: dateRange(shiftDate(period.date, -29)).from, to: period.to }, evidenceSources: ["food_log", "drink_log"] })) : [],
    evidence: [...evidence, ...taskEvidence].slice(0, 100),
    evidenceCoverage: { total: evidence.length + taskEvidence.length, returned: Math.min(100, evidence.length + taskEvidence.length), truncated: evidence.length + taskEvidence.length > 100, scope: "target day only; findings reference the full Food/Drink window by source and range" },
    baselineReferences: baselineReferences.slice(0, 30),
    baselineReferenceCoverage: { total: baselineReferences.length, returned: Math.min(30, baselineReferences.length), truncated: baselineReferences.length > 30 },
    limitations: [
      "Counts describe recorded activity; recording coverage and ingestion delay are unknown. No causal or cross-domain claims are generated.",
      "HealthKit weight and menstrual flow retain repository provenance; HealthKit energy and sleep are not summarized in Phase 1.",
      "Period flow counts are observations, not cycle duration. Period intervals, Chronicle subjective life days, other life events and existing insight reports are not loaded.",
      "Tracker field statistics retain existing type semantics; at most 20 active-in-window trackers are summarized, no time-of-day claims from date-only anchors.",
      "Task/Tracker metadata may be capped at 1000 rows. Per-day query ceilings are conservative; reaching a ceiling means possible truncation even on SQLite.",
    ],
    omitted: { trackerStatistics: Math.max(0, trackerIds.length - 20), existingReports: relatedReports.length === 50 ? "possibly_truncated_at_50" : "within_query_limits", chronicle: "not_mapped_subjective_life_day", sleep: "not_summarized", healthKitEnergy: "not_repository_scoped" },
  };
}

export type InsightContext = Awaited<ReturnType<typeof buildInsightContext>>;
