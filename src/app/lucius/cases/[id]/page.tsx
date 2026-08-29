import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLuciusCase } from "@/lib/services/lucius";
import { CaseDetailView } from "./case-detail-view";

export const metadata: Metadata = { title: "Lucius Case" };
export const dynamic = "force-dynamic";
export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) { const id = Number((await params).id); if (!Number.isSafeInteger(id) || id <= 0) notFound(); const item = await getLuciusCase(id); if (!item) notFound(); return <CaseDetailView initial={item} />; }
