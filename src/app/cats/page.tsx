import type { Metadata } from "next";
import { getCatsDashboard } from "@/lib/services/cats";
import { getDueReminders } from "@/lib/services/reminder";
import { CatsView } from "./cats-view";

export const metadata: Metadata = { title: "Cats" };
export const dynamic = "force-dynamic";

export default async function CatsPage() { const [dashboard,due]=await Promise.all([getCatsDashboard(),getDueReminders()]);return <CatsView initialDashboard={dashboard} initialDue={due.filter(item=>item.targetType==="cat"||item.targetType==="cat_household")}/>; }
