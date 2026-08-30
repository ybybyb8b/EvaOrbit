import type { Metadata } from "next";

import { listHealthRecords } from "../../lib/services/health";
import { buildHealthDashboard } from "../../lib/health-dashboard";
import { getDailyNutritionSummary, listDailyNutritionHistory } from "../../lib/services/nutrition";
import { getTrainingInputSuggestions, listTrainingLogs } from "../../lib/services/training";
import { dateInEvaOrbit, shiftDate } from "../../lib/time";
import { HealthView } from "./health-view";

export const metadata: Metadata = {
  title: "Health",
};

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const today = dateInEvaOrbit();
  const reviewDate = shiftDate(today, -1);
  const [records, dailyEnergy, energyHistory, training, trainingSuggestions] = await Promise.all([
    listHealthRecords({ limit: 100 }),
    getDailyNutritionSummary(reviewDate),
    listDailyNutritionHistory(7),
    listTrainingLogs({ date: today, limit: 100 }),
    getTrainingInputSuggestions(),
  ]);

  return <HealthView initial={buildHealthDashboard(records)} initialEnergy={dailyEnergy} initialEnergyHistory={energyHistory} initialTraining={training} initialTrainingSuggestions={trainingSuggestions} today={today} />;
}
