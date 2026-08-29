import type { EvaOrbitRepository } from "./repositories/types.ts";
import type { ChronicleEntryPatch, ChronicleListInput, NewChronicleEntry } from "./repositories/types.ts";

export function chronicleExcerpt(contentMd: string, maxLength = 180) {
  const text = contentMd
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/(^|\s)[#>*_~`-]+(?=\s|$)/g, " ")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

export async function listChronicleWithRepository(repository: EvaOrbitRepository, input: ChronicleListInput = {}) {
  return repository.listChronicleEntries(input);
}

export async function getChronicleWithRepository(repository: EvaOrbitRepository, id: number) {
  return repository.getChronicleEntry(id);
}

export async function createChronicleWithRepository(repository: EvaOrbitRepository, input: NewChronicleEntry) {
  return repository.createChronicleEntry(input);
}

export async function updateChronicleWithRepository(repository: EvaOrbitRepository, id: number, input: ChronicleEntryPatch) {
  return repository.updateChronicleEntry(id, input);
}

export async function deleteChronicleWithRepository(repository: EvaOrbitRepository, id: number) {
  return repository.deleteChronicleEntry(id);
}
