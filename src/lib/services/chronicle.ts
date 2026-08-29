import "server-only";

import { createChronicleWithRepository, deleteChronicleWithRepository, getChronicleWithRepository, listChronicleWithRepository, updateChronicleWithRepository } from "../chronicle";
import { getRepository } from "../repositories";
import type { ChronicleEntryPatch, ChronicleListInput, NewChronicleEntry } from "../repositories/types";

export async function listChronicle(input: ChronicleListInput = {}) {
  return listChronicleWithRepository(await getRepository(), input);
}

export async function getChronicleEntry(id: number) {
  return getChronicleWithRepository(await getRepository(), id);
}

export async function createChronicleEntry(input: NewChronicleEntry) {
  return createChronicleWithRepository(await getRepository(), input);
}

export async function updateChronicleEntry(id: number, input: ChronicleEntryPatch) {
  return updateChronicleWithRepository(await getRepository(), id, input);
}

export async function deleteChronicleEntry(id: number) {
  return deleteChronicleWithRepository(await getRepository(), id);
}
