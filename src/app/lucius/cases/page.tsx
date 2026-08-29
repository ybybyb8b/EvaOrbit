import type { Metadata } from "next";
import { listLuciusCases } from "@/lib/services/lucius";
import { CasesView } from "./cases-view";

export const metadata: Metadata = { title: "Lucius Cases" };
export const dynamic = "force-dynamic";
export default async function CasesPage() { return <CasesView initial={await listLuciusCases({ currentOnly: true, limit: 100 })} />; }
