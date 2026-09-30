import type { Metadata } from "next";
import { getCatsDashboard } from "@/lib/services/cats";
import { listCatFood } from "@/lib/services/cat-food";
import { CatsView } from "./cats-view";

export const metadata: Metadata = { title: "Cats" };
export const dynamic = "force-dynamic";

export default async function CatsPage() {
  const [dashboard, food] = await Promise.all([getCatsDashboard(), listCatFood()]);
  return <CatsView initialDashboard={dashboard} foodSummary={{ items: food.length, packages: food.reduce((total, item) => total + item.stockPackages, 0), lowStock: food.filter((item) => item.stockState !== "available").length }} />;
}
