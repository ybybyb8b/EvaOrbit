import type { Metadata } from "next";

import { listHealthRecords } from "../../lib/services/health";
import { buildHealthDashboard } from "../../lib/health-dashboard";
import { getDailyNutritionSummary, listDailyNutritionHistory } from "../../lib/services/nutrition";
import { getTrainingInputSuggestions, listTrainingLogs } from "../../lib/services/training";
import { dateInEvaOrbit } from "../../lib/time";
import { HealthView } from "./health-view";

export const metadata: Metadata = {
  title: "Health",
};

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const today = dateInEvaOrbit();
  const trainingMonth = today.slice(0, 7);
  const [records, dailyEnergy, energyHistory, trainingMonthLogs, trainingSuggestions] = await Promise.all([
    listHealthRecords({ limit: 100 }),
    getDailyNutritionSummary(today),
    listDailyNutritionHistory(7),
    listTrainingLogs({ month: trainingMonth, limit: 100 }),
    getTrainingInputSuggestions(),
  ]);
  const training = trainingMonthLogs.filter((log) => dateInEvaOrbit(new Date(log.occurredAt)) === today);

  return <HealthView initial={buildHealthDashboard(records)} initialEnergy={dailyEnergy} initialEnergyHistory={energyHistory} initialTraining={training} initialTrainingMonth={trainingMonth} initialTrainingMonthLogs={trainingMonthLogs} initialTrainingSuggestions={trainingSuggestions} today={today} />;
}
