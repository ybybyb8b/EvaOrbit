import type { FoodLog } from "./types";
import type { InsightSnapshot } from "./insight-reports";

export const INSIGHT_FINGERPRINT_VERSION = 2;
export type InsightReviewStatus = "waiting_records" | "waiting_analysis" | "completed" | "data_updated" | "deleted";
export function checkInsightMeals(date: string, foods: Pick<FoodLog, "mealType">[], truncated = false) {
  const lunch = foods.some(row => row.mealType === "lunch"), dinner = foods.some(row => row.mealType === "dinner");
  const missing = (["lunch", "dinner"] as const).filter(meal => meal === "lunch" ? !lunch : !dinner);
  const label = missing.map(meal => meal === "lunch" ? "午餐" : "晚餐").join("和");
  const [, month, day] = date.split("-").map(Number);
  return { lunch, dinner, missing, complete: !missing.length && !truncated,
    message: missing.length ? `${month} 月 ${day} 日的${label}尚未记录，是否忘记补录？` : truncated ? "当日记录未完整读取，请确认后再分析。" : "午餐、晚餐均已记录。" };
}
export type InsightMealCheck = ReturnType<typeof checkInsightMeals>;
export interface InsightOverview {
  foodCount: number; drinkCount: number; recordedIntakeKcal: number | null; unknownCalories: number;
  trainingCount: number; trainingMinutes: number; trackerCount: number; completedTasks: number;
  events: Array<{ label: string; kind: string }>;
}
export function insightReviewStatus(meals: InsightMealCheck, fingerprint: string, snapshot?: InsightSnapshot | null): InsightReviewStatus {
  if (!meals.complete) return "waiting_records";
  if (!snapshot || snapshot.method !== "ai") return "waiting_analysis";
  return snapshot.input.fingerprintVersion === INSIGHT_FINGERPRINT_VERSION && snapshot.input.fingerprint === fingerprint ? "completed" : "data_updated";
}
/** Old combined snapshots remain readable, but rule candidates never duplicate the AI narrative. */
export function readableInsightFindings(snapshot: InsightSnapshot) {
  const seen = new Set<string>();
  return snapshot.findings.filter(finding => {
    if (snapshot.method !== "ai" || finding.method !== "ai" || finding.importance === "low") return false;
    const key = finding.title.replace(/[\s\p{P}]/gu, "").toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => Number(b.importance === "high") - Number(a.importance === "high")).slice(0, 3);
}
