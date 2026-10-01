import "server-only";

import { getRepository } from "../repositories";
import type { DailyJournalEntryPatch, DailyJournalListInput, NewDailyJournalEntry } from "../repositories/types";

export async function listDailyJournalEntries(input: DailyJournalListInput = {}) {
  return (await getRepository()).listDailyJournalEntries(input);
}

export async function createDailyJournalEntry(input: NewDailyJournalEntry) {
  return (await getRepository()).createDailyJournalEntry(input);
}

export async function updateDailyJournalEntry(id: number, input: DailyJournalEntryPatch) {
  return (await getRepository()).updateDailyJournalEntry(id, input);
}

export async function deleteDailyJournalEntry(id: number) {
  return (await getRepository()).deleteDailyJournalEntry(id);
}
