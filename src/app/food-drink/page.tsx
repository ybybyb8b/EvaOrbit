import type { Metadata } from "next";
import { FoodDrinkHome } from "./food-drink-home";

export const metadata: Metadata = { title: "Food & Drink" };
export default async function FoodDrinkPage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const { record } = await searchParams;
  return <FoodDrinkHome initialRecord={record === "food" || record === "drink" ? record : undefined} />;
}
