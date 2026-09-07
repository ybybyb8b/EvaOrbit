import type { Metadata } from "next";

import { listHealthRecords } from "../../lib/services/health";
import { buildHealthDashboard } from "../../lib/health-dashboard";
import { getDailyNutritionSummary, listDailyNutritionHistory } from "../../lib/services/nutrition";
import { getTrainingInputSuggestions, getTrainingLog, listTrainingLogs } from "../../lib/services/training";
import { dateInEvaOrbit } from "../../lib/time";
import { HealthView } from "./health-view";

export const metadata: Metadata = {
  title: "Health",
};

export const dynamic = "force-dynamic";

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ training?: string }> }) {
  const today = dateInEvaOrbit();
  const requestedTraining = Number((await searchParams).training);
  const trainingId = Number.isSafeInteger(requestedTraining) && requestedTraining > 0 ? requestedTraining : null;
  const [records, dailyEnergy, energyHistory, training, recentTraining, trainingSuggestions, focusedTraining] = await Promise.all([
    listHealthRecords({ limit: 100 }),
    getDailyNutritionSummary(today),
    listDailyNutritionHistory(7),
    listTrainingLogs({ date: today, limit: 100 }),
    listTrainingLogs({ limit: 10 }),
    getTrainingInputSuggestions(),
    trainingId ? getTrainingLog(trainingId) : Promise.resolve(null),
  ]);

  return <HealthView initial={buildHealthDashboard(records)} initialEnergy={dailyEnergy} initialEnergyHistory={energyHistory} initialTraining={training} initialRecentTraining={recentTraining} initialTrainingSuggestions={trainingSuggestions} initialFocusedTraining={focusedTraining ?? undefined} today={today} />;
}
