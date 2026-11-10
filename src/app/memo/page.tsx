import type { Metadata } from "next";
import { getRepository } from "@/lib/repositories";
import { echoFact } from "./echo-records";
import { EchoWebView } from "./echo-view";

export const metadata: Metadata = { title: "Echo" };
export const dynamic = "force-dynamic";

export default async function MemoPage() {
  const repository = await getRepository();
  const { memos, facts, ...overview } = await repository.getEchoOverview();
  const ids = [...new Set(facts.flatMap(fact => [fact.subjectEntityId, ...(fact.objectEntityId ? [fact.objectEntityId] : [])]))];
  const entities = ids.length ? (await repository.pageMemory("entity", { ids, includeMerged: true })).items : [];
  const names = new Map(entities.map(entity => [entity.id, entity.canonicalName]));
  return <EchoWebView memos={memos} facts={facts.map(fact => echoFact(fact, names))} overview={overview} />;
}
