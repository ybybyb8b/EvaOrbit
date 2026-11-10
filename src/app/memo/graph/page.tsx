import type { Metadata } from "next";
import { getRepository } from "@/lib/repositories";
import { memoryUuid } from "@/lib/memory-graph-validation";
import { MemoryGraphWebView } from "./memory-graph-view";

export const metadata:Metadata={title:"Memory Graph"};
export const dynamic="force-dynamic";

export default async function MemoryGraphPage({ searchParams }: { searchParams: Promise<{ fact?: string | string[] }> }) {
  const { fact } = await searchParams;
  let factId: string | undefined;
  if (fact !== undefined) {
    try { factId = memoryUuid(fact); } catch { /* Ignore malformed deep links. */ }
  }
  const repository = await getRepository();
  const [entities, facts, candidates, sourceCount] = await Promise.all([
    repository.pageMemory("entity", { includeMerged: true }),
    repository.pageMemory("fact"),
    repository.pageMemory("candidate", { status: "pending" }),
    repository.countMemorySources(),
  ]);
  return <MemoryGraphWebView key={factId ?? "graph"} initial={{ entities, facts, candidates, sourceCount }} initialFactId={factId} />;
}
