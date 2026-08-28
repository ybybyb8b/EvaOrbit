import type { Metadata } from "next";

import { listHealthRecords } from "../../lib/services/health";
import { getDailyNutritionSummary, listDailyNutritionHistory } from "../../lib/services/nutrition";
import { dateInEvaOrbit } from "../../lib/time";
import { HealthView } from "./health-view";

export const metadata: Metadata = {
  title: "Health",
};

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const today = dateInEvaOrbit();
  const [current, recent, dailyEnergy, energyHistory] = await Promise.all([
    listHealthRecords({ status: "active", limit: 6 }),
    listHealthRecords({ limit: 8 }),
    getDailyNutritionSummary(today),
    listDailyNutritionHistory(7),
  ]);

  return <HealthView initial={{ current, recent }} initialEnergy={dailyEnergy} initialEnergyHistory={energyHistory} />;
}
