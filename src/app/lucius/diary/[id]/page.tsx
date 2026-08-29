import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLuciusDiaryEntry } from "@/lib/services/lucius";
import { DiaryDetailView } from "./diary-detail-view";

export const metadata: Metadata = { title: "Diary entry" };
export const dynamic = "force-dynamic";
export default async function DiaryDetailPage({ params }: { params: Promise<{ id: string }> }) { const id = Number((await params).id); if (!Number.isSafeInteger(id) || id <= 0) notFound(); const item = await getLuciusDiaryEntry(id); if (!item) notFound(); return <DiaryDetailView initial={item} />; }
