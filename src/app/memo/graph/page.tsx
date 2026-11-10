import type { Metadata } from "next";
import { getMemoryGraphSnapshot } from "@/lib/services/memory-graph";
import { memoryUuid } from "@/lib/memory-graph-validation";
import { MemoryGraphView } from "./memory-graph-view";

export const metadata:Metadata={title:"Memory Graph"};
export const dynamic="force-dynamic";

export default async function MemoryGraphPage({ searchParams }: { searchParams: Promise<{ fact?: string | string[] }> }) {
  const { fact } = await searchParams;
  let factId: string | undefined;
  if (fact !== undefined) {
    try { factId = memoryUuid(fact); } catch { /* Ignore malformed deep links. */ }
  }
  return <MemoryGraphView key={factId ?? "graph"} initial={await getMemoryGraphSnapshot("pending")} initialFactId={factId} />;
}
