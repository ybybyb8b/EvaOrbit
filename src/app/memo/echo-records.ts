import { plainExcerpt } from "@/lib/long-term-memory";
import type { Memo, MemoryFact } from "@/lib/types";

export type EchoEntry = { kind: "memo" | "fact"; href: string; title: string; excerpt: string; updatedAt: string };

export function echoMemo(memo: Memo): EchoEntry {
  return { kind: "memo", href: `/memo/${memo.id}`, title: memo.title, excerpt: plainExcerpt(memo.content), updatedAt: memo.updatedAt };
}

export function echoFact(fact: MemoryFact, names: ReadonlyMap<string, string>): EchoEntry {
  const subject = names.get(fact.subjectEntityId);
  const value = fact.objectEntityId ? names.get(fact.objectEntityId) : fact.objectValue;
  return {
    kind: "fact", href: `/memo/graph?fact=${encodeURIComponent(fact.id)}#memory-sources`,
    title: [subject, fact.predicate].filter(Boolean).join(" · "),
    excerpt: plainExcerpt(typeof value === "string" ? value : value == null ? "" : JSON.stringify(value)),
    updatedAt: fact.updatedAt,
  };
}

export function echoTimestamp(value: string) {
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : value.replace(" ", "T") + "Z");
}

export function recentEchoEntries(memos: EchoEntry[], facts: EchoEntry[]) {
  const byRecency = (a: EchoEntry, b: EchoEntry) => +echoTimestamp(b.updatedAt) - +echoTimestamp(a.updatedAt);
  const latestMemos = [...memos].sort(byRecency);
  const latestFacts = [...facts].sort(byRecency);
  if (latestMemos.length && latestFacts.length) return [latestMemos[0], latestFacts[0]].sort(byRecency);
  return [...latestMemos, ...latestFacts].slice(0, 2);
}
