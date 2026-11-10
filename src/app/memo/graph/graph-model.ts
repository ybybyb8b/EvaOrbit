import type { IconName } from "@/components/icons";
import type { MemoryEntity, MemoryFact } from "@/lib/types";

export const typeIcons: Record<string, IconName> = {
  person: "people", place: "foodPlaces", concept: "memory", event: "calendar",
  project: "projects", organization: "projects", preference: "health",
};
const typeNames: Record<string, [string, string]> = {
  person: ["People", "人物"], place: ["Places", "地点"], concept: ["Ideas", "概念"],
  event: ["Events", "事件"], project: ["Projects", "项目"], organization: ["Organizations", "组织"],
  preference: ["Preferences", "偏好"],
};

export function typeName(type: string, english: boolean) {
  return typeNames[type]?.[english ? 0 : 1] ?? type.replaceAll("_", " ");
}

export function literal(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value) ?? "";
}

export function graphTime(value: string) {
  return Date.parse(/[zZ]$|[+-]\d{2}:\d{2}$/.test(value) ? value : value.replace(" ", "T") + "Z");
}

export function graphDate(value: string, english: boolean) {
  return new Intl.DateTimeFormat(english ? "en" : "zh-CN", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Shanghai",
  }).format(graphTime(value));
}

export function relatedIds(fact: MemoryFact) {
  return new Set([fact.subjectEntityId, fact.objectEntityId, fact.perspectiveEntityId].filter((id): id is string => Boolean(id)));
}

export function graphActivity(entities: MemoryEntity[], facts: MemoryFact[]) {
  const activity = new Map(entities.map(entity => [entity.id, {
    entity, time: entity.updatedAt, relatedFacts: 0, created: entity.createdAt === entity.updatedAt,
  }]));
  for (const fact of facts) {
    for (const id of relatedIds(fact)) {
      const row = activity.get(id);
      if (!row) continue;
      row.relatedFacts++;
      if (graphTime(fact.updatedAt) > graphTime(row.time)) {
        row.time = fact.updatedAt;
        row.created = false;
      }
    }
  }
  return [...activity.values()].sort((a, b) => graphTime(b.time) - graphTime(a.time) || a.entity.id.localeCompare(b.entity.id));
}

export function graphProjection(entities: MemoryEntity[], facts: MemoryFact[], focused: string | null, ego: boolean, selectedFact: string | null) {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const edges = facts.filter(fact => fact.objectEntityId && byId.has(fact.subjectEntityId) && byId.has(fact.objectEntityId));
  const neighbors = new Map(entities.map(entity => [entity.id, new Set<string>()]));
  for (const { subjectEntityId, objectEntityId } of edges) {
    if (!objectEntityId || subjectEntityId === objectEntityId) continue;
    neighbors.get(subjectEntityId)?.add(objectEntityId);
    neighbors.get(objectEntityId)?.add(subjectEntityId);
  }
  const ranked = [...entities].sort((a, b) => neighbors.get(b.id)!.size - neighbors.get(a.id)!.size
    || graphTime(b.updatedAt) - graphTime(a.updatedAt) || a.id.localeCompare(b.id));
  const center = (focused && byId.get(focused)) || ranked[0];
  if (!center) return { nodes: [], edges: [] };
  const adjacent = neighbors.get(center.id)!;
  const selected = edges.find(fact => fact.id === selectedFact);
  const visible = new Set([center.id]);
  if (selected) {
    visible.add(selected.subjectEntityId);
    visible.add(selected.objectEntityId!);
  }
  for (const entity of ranked) {
    if (visible.size >= 8) break;
    if (adjacent.has(entity.id)) visible.add(entity.id);
  }
  if (!ego) {
    for (const entity of ranked) {
      if (visible.size >= 8) break;
      visible.add(entity.id);
    }
  }
  const drawn: MemoryFact[] = [];
  const pairs = new Set<string>();
  for (const fact of selected ? [selected, ...edges.filter(item => item.id !== selected.id)] : edges) {
    if (!visible.has(fact.subjectEntityId) || !visible.has(fact.objectEntityId!)) continue;
    const pair = JSON.stringify([fact.subjectEntityId, fact.objectEntityId, fact.predicate]);
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    drawn.push(fact);
    if (drawn.length === 18) break;
  }
  return { nodes: [...visible].map(id => byId.get(id)!), edges: drawn };
}
