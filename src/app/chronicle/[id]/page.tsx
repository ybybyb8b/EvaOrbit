import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChronicleEntry } from "@/lib/services/chronicle";
import { ChronicleDetailView } from "./chronicle-detail-view";

export const metadata: Metadata = { title: "Chronicle Entry" };
export const dynamic = "force-dynamic";

export default async function ChronicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const entry = await getChronicleEntry(id);
  if (!entry) notFound();
  return <ChronicleDetailView initial={entry} />;
}
