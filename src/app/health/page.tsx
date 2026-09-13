import type { Metadata } from "next";

import { listHealthRecords } from "../../lib/services/health";
import { buildHealthDashboard } from "../../lib/health-dashboard";
import { getDailyNutritionSummary, listDailyNutritionHistory } from "../../lib/services/nutrition";
import { getTrainingInputSuggestions, getTrainingLog, listTrainingLogs } from "../../lib/services/training";
import { dateInEvaOrbit, dateRange, shiftDate } from "../../lib/time";
import { getWeightRecord, getWeightSettings, listWeightRecords } from "../../lib/services/weight";
import { listMedicationDoseEvents,listMedicationPresets,listMenstrualFlowRecords,listMenstrualPeriods } from "../../lib/services/period-medication";
import { listScheduledNotifications } from "../../lib/services/reminder";
import { PERIOD_MEDICATION_REMINDER_SOURCE } from "../../lib/reminder-source-registry";
import { HealthView } from "./health-view";

export const metadata: Metadata = {
  title: "Health",
};

export const dynamic = "force-dynamic";

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ training?: string; weight?: string }> }) {
  const today = dateInEvaOrbit();
  const params = await searchParams;
  const requestedTraining = Number(params.training);
  const trainingId = Number.isSafeInteger(requestedTraining) && requestedTraining > 0 ? requestedTraining : null;
  const requestedWeight = Number(params.weight);
  const weightId = Number.isSafeInteger(requestedWeight) && requestedWeight > 0 ? requestedWeight : null;
  const [records, dailyEnergy, energyHistory, training, recentTraining, trainingSuggestions, focusedTraining, weights, weightSettings, focusedWeight, periods, menstrualFlows, medicationPresets, medicationDoses, scheduledNotifications] = await Promise.all([
    listHealthRecords({ limit: 100 }),
    getDailyNutritionSummary(today),
    listDailyNutritionHistory(7),
    listTrainingLogs({ date: today, limit: 100 }),
    listTrainingLogs({ from: dateRange(shiftDate(today, -6)).from, to: dateRange(shiftDate(today, 1)).from, limit: 100 }),
    getTrainingInputSuggestions(),
    trainingId ? getTrainingLog(trainingId) : Promise.resolve(null),
    listWeightRecords({ limit: 1000 }),
    getWeightSettings(),
    weightId ? getWeightRecord(weightId) : Promise.resolve(null),
    listMenstrualPeriods({limit:30}),
    listMenstrualFlowRecords({limit:30}),
    listMedicationPresets({limit:100}),
    listMedicationDoseEvents({limit:30}),
    listScheduledNotifications(),
  ]);

  return <HealthView initial={buildHealthDashboard(records)} initialEnergy={dailyEnergy} initialEnergyHistory={energyHistory} initialTraining={training} initialRecentTraining={recentTraining} initialTrainingSuggestions={trainingSuggestions} initialFocusedTraining={focusedTraining ?? undefined} initialWeights={weights} initialWeightSettings={weightSettings} initialFocusedWeight={focusedWeight ?? undefined} initialPeriods={periods} initialMenstrualFlows={menstrualFlows} initialMedicationPresets={medicationPresets} initialMedicationDoses={medicationDoses} initialMedicationReminders={scheduledNotifications.filter(item=>item.sourceType===PERIOD_MEDICATION_REMINDER_SOURCE)} today={today} />;
}
