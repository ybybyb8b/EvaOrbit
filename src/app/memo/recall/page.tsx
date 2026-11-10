import type { Metadata } from "next";
import { getMemoryContext } from "@/lib/services/memory-context";
import { echoFact, echoMemo } from "../echo-records";
import { RecallView } from "./recall-view";

export const metadata: Metadata = { title: "Recall" };
export const dynamic = "force-dynamic";

export default async function RecallPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  if (!query) return <RecallView query="" entries={[]} />;
  if (query.length > 20000 || query.includes("\0")) return <RecallView query="" entries={[]} status="invalid" />;

  const context = await getMemoryContext({ query, limit: 12 });
  const names = new Map(context.entities.map(hit => [hit.id, hit.record.canonicalName]));
  const facts = [...context.current_facts, ...context.historical_facts, ...context.unknown_facts];
  const entries = [
    ...context.memos.map(hit => ({ rank: hit.rank, entry: echoMemo(hit.record) })),
    ...facts.map(hit => ({ rank: hit.rank, entry: echoFact(hit.record, names) })),
  ].sort((a, b) => a.rank - b.rank).map(hit => hit.entry);
  return <RecallView query={query} entries={entries} status={context.coverage.status} />;
}
