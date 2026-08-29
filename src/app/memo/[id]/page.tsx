import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMemo } from "@/lib/services/memo";
import { MemoDetailView } from "./memo-detail-view";

export const metadata: Metadata = { title: "Memo detail" };
export const dynamic = "force-dynamic";
export default async function MemoDetailPage({ params }: { params: Promise<{ id: string }> }) { const id = Number((await params).id); if (!Number.isSafeInteger(id) || id <= 0) notFound(); const item = await getMemo(id); if (!item) notFound(); return <MemoDetailView initial={item} />; }
