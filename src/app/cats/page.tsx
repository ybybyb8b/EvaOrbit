import type { Metadata } from "next";
import { getCatsDashboard } from "@/lib/services/cats";
import { CatsView } from "./cats-view";

export const metadata: Metadata = { title: "Cats" };
export const dynamic = "force-dynamic";

export default async function CatsPage() { return <CatsView initialDashboard={await getCatsDashboard()}/>; }
