import type { Metadata } from "next";

import { listHealthRecords } from "../../lib/services/health";
import { buildHealthDashboard } from "../../lib/health-dashboard";
import { getDailyNutritionSummary, listDailyNutritionHistory } from "../../lib/services/nutrition";
import { getTrainingInputSuggestions, getTrainingLog, listTrainingLogs, getTrainingPlan } from "../../lib/services/training";
import { dateInEvaOrbit, dateRange, shiftDate } from "../../lib/time";
import { getWeightRecord, getWeightSettings, listWeightRecords } from "../../lib/services/weight";
import { listMedicationDoseEvents,listMedicationPresets,listMenstrualFlowRecords,listMenstrualPeriods } from "../../lib/services/period-medication";
import { listScheduledNotifications } from "../../lib/services/reminder";
import { PERIOD_MEDICATION_REMINDER_SOURCE } from "../../lib/reminder-source-registry";
import { HealthView, type HealthViewName } from "./health-view";
import { getDailySleepSummary } from "../../lib/services/sleep";
import { buildDailySleepSummary } from "../../lib/sleep";
import { calculateDailyNutrition } from "../../lib/nutrition";
import { healthPeriodHistoryFrom } from "../../lib/health-period-range";

export const metadata: Metadata = {
  title: "Health",
};

export const dynamic = "force-dynamic";

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ training?: string; weight?: string; view?: string }> }) {
  const today = dateInEvaOrbit();
  const params = await searchParams;
  const requestedTraining = Number(params.training);
  const trainingId = Number.isSafeInteger(requestedTraining) && requestedTraining > 0 ? requestedTraining : null;
  const requestedWeight = Number(params.weight);
  const weightId = Number.isSafeInteger(requestedWeight) && requestedWeight > 0 ? requestedWeight : null;
  const views: HealthViewName[] = ["overview", "sleep", "weight", "training", "energy", "cycle", "records"];
  // Preserve direct Timeline editor links.
  const view: HealthViewName = weightId ? "weight" : trainingId ? "training" : views.includes(params.view as HealthViewName) ? params.view as HealthViewName : "overview";
  const overview = view === "overview";
  const cycleFrom = view === "cycle" ? healthPeriodHistoryFrom(today) : undefined;
  const cycleFromInstant = cycleFrom ? dateRange(cycleFrom).from : undefined;
  // Unused props retain empty values; quick editors load their own inputs when opened.
  const [initialSleep, records, dailyEnergy, energyHistory, training, recentTraining, trainingSuggestions, focusedTraining, weights, weightSettings, focusedWeight, periods, menstrualFlows, medicationPresets, medicationDoses, scheduledNotifications, activePeriods, trainingPlan] = await Promise.all([
    overview || view === "sleep" ? getDailySleepSummary(today) : buildDailySleepSummary(today, [], null),
    overview || view === "records" ? listHealthRecords({ limit: 100 }) : [],
    overview || view === "energy" ? getDailyNutritionSummary(today) : calculateDailyNutrition(today, [], [], { restingEnergyKcal: null, activeEnergyKcal: null, notes: "" }),
    view === "energy" ? listDailyNutritionHistory(7) : [],
    overview || view === "training" ? listTrainingLogs({ date: today, limit: 100 }) : [],
    view === "training" ? listTrainingLogs({ from: dateRange(shiftDate(today, -6)).from, to: dateRange(shiftDate(today, 1)).from, limit: 100 }) : [],
    view === "training" ? getTrainingInputSuggestions() : { teachers: [], courses: [], presets: [] },
    view === "training" && trainingId ? getTrainingLog(trainingId) : null,
    overview || view === "weight" ? listWeightRecords({ limit: overview ? 2 : 1000 }) : [],
    view === "weight" ? getWeightSettings() : { targetWeightKg: null, reminderEnabled: false, reminderTime: "08:00", updatedAt: "" },
    view === "weight" && weightId ? getWeightRecord(weightId) : null,
    overview || view === "cycle" ? listMenstrualPeriods({limit:30, ...(cycleFrom ? { from: cycleFrom } : {})}) : [],
    view === "cycle" ? listMenstrualFlowRecords({limit:30, from: cycleFromInstant}) : [],
    view === "cycle" ? listMedicationPresets({limit:100}) : [],
    view === "cycle" ? listMedicationDoseEvents({limit:30, from: cycleFromInstant}) : [],
    overview || view === "cycle" ? listScheduledNotifications() : [],
    view === "cycle" ? listMenstrualPeriods({activeOnly:true,limit:1}) : [],
    view === "training" ? getTrainingPlan() : null,
  ]);
  const oldActive = activePeriods.find(item => cycleFrom && item.startedOn < cycleFrom);
  const [activeFlows, activeDoses] = oldActive ? await Promise.all([listMenstrualFlowRecords({periodId:oldActive.id,limit:30}), listMedicationDoseEvents({periodId:oldActive.id,limit:30})]) : [[], []];
  const cyclePeriods = [...new Map([...periods, ...activePeriods].map(item => [item.id, item])).values()].sort((a,b) => b.startedOn.localeCompare(a.startedOn));
  const cycleFlows = [...new Map([...menstrualFlows, ...activeFlows].map(item => [item.id, item])).values()].sort((a,b) => b.occurredAt.localeCompare(a.occurredAt));
  const cycleDoses = [...new Map([...medicationDoses, ...activeDoses].map(item => [item.id, item])).values()].sort((a,b) => b.takenAt.localeCompare(a.takenAt));

  return <HealthView key={view} view={view} initialSleep={initialSleep} initial={buildHealthDashboard(records)} initialEnergy={dailyEnergy} initialEnergyHistory={energyHistory} initialTrainingPlan={trainingPlan} initialTraining={training} initialRecentTraining={recentTraining} initialTrainingSuggestions={trainingSuggestions} initialFocusedTraining={focusedTraining ?? undefined} initialWeights={weights} initialWeightSettings={weightSettings} initialFocusedWeight={focusedWeight ?? undefined} initialPeriods={cyclePeriods} initialMenstrualFlows={cycleFlows} initialMedicationPresets={medicationPresets} initialMedicationDoses={cycleDoses} initialMedicationReminders={scheduledNotifications.filter(item=>item.sourceType===PERIOD_MEDICATION_REMINDER_SOURCE)} today={today} />;
}
