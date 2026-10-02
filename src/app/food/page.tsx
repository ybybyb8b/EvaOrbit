import type { Metadata } from "next";
import { FoodView } from "./food-view";
export const metadata: Metadata = { title: "Food" };
export default async function FoodPage({ searchParams }: { searchParams: Promise<{ date?: string; mealType?: string }> }) {
  const { date, mealType } = await searchParams;
  const initialDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ? date : undefined;
  return <FoodView key={`${initialDate ?? "today"}:${mealType ?? "all"}`} initialDate={initialDate} initialMealType={typeof mealType === "string" ? mealType : undefined} />;
}
