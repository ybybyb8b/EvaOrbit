import type { RelationPersonSummary } from "./types";

export type RelationPeopleSort = "last_met" | "latest_event" | "closeness" | "name";
export type RelationshipStatusFilter = "all" | "active" | "ended";
const localeName = (left: RelationPersonSummary, right: RelationPersonSummary) => left.name.localeCompare(right.name, ["zh-CN", "en"], { sensitivity: "base", numeric: true });
const nullableNewest = (left: string | null, right: string | null) => left === null ? (right === null ? 0 : 1) : right === null ? -1 : right.localeCompare(left);

export function sortRelationPeople(people: RelationPersonSummary[], sort: RelationPeopleSort) {
  return [...people].sort((left, right) => {
    if (sort === "name") return localeName(left, right) || left.id - right.id;
    if (sort === "closeness") {
      const status = Number(left.relationshipStatus === "ended") - Number(right.relationshipStatus === "ended");
      if (status) return status;
      const rank = (right.closenessRank ?? -1) - (left.closenessRank ?? -1);
      return rank || localeName(left, right) || left.id - right.id;
    }
    const leftAt = sort === "last_met" ? left.lastMetAt : left.latestEvent?.occurredAt ?? null;
    const rightAt = sort === "last_met" ? right.lastMetAt : right.latestEvent?.occurredAt ?? null;
    return nullableNewest(leftAt, rightAt) || localeName(left, right) || left.id - right.id;
  });
}

export function filterRelationPeople(people: RelationPersonSummary[], query: string, status: RelationshipStatusFilter) {
  const needle = query.trim().toLocaleLowerCase();
  return people.filter((person) => {
    const matchesQuery = !needle || `${person.name} ${person.nickname ?? ""} ${person.relationLabel ?? ""}`.toLocaleLowerCase().includes(needle);
    return matchesQuery && (needle.length > 0 || status === "all" || person.relationshipStatus === status);
  });
}
