import type { EvaOrbitRepository } from "./repositories/types.ts";
import type { ChronicleEntryPatch, ChronicleListInput, NewChronicleEntry } from "./repositories/types.ts";

export function chronicleSearchDates(query?: string) {
  const value = query?.trim();
  if (!value || !/^(?!0000)\d{4}-\d{2}(?:-\d{2})?$/.test(value)) return;

  const monthOnly = value.length === 7;
  const from = monthOnly ? `${value}-01` : value;
  const date = new Date(`${from}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== from) return;
  if (monthOnly) date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return { from, to: date.toISOString().slice(0, 10) };
}

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

/** Format a date-only record without crossing a timezone boundary. */
export function chronicleDateLabel(value: string, english = true) {
  return new Intl.DateTimeFormat(english ? "en-US" : "zh-CN", {month:"short",day:"numeric",year:"numeric"}).format(new Date(`${value}T12:00:00`));
}
