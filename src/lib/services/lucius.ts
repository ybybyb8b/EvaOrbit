import "server-only";

import { getRepository } from "../repositories";
import { dateInEvaOrbit } from "../time";
import { dateOnly } from "../validation";
import type { LuciusCaseListInput, LuciusCasePatch, LuciusDiaryListInput, LuciusDiaryPatch, LuciusStatePatch, NewLuciusCase, NewLuciusDiaryEntry } from "../repositories/types";

export async function listLuciusDiaryEntries(input: LuciusDiaryListInput = {}) { return (await getRepository()).listLuciusDiaryEntries(input); }
export async function getLuciusDiaryEntry(id: number) { return (await getRepository()).getLuciusDiaryEntry(id); }
export async function createLuciusDiaryEntry(input: NewLuciusDiaryEntry) { return (await getRepository()).createLuciusDiaryEntry(input); }
export async function updateLuciusDiaryEntry(id: number, input: LuciusDiaryPatch) { return (await getRepository()).updateLuciusDiaryEntry(id, input); }
export async function deleteLuciusDiaryEntry(id: number) { return (await getRepository()).deleteLuciusDiaryEntry(id); }

export async function listLuciusCases(input: LuciusCaseListInput = {}) { return (await getRepository()).listLuciusCases(input); }
export async function getLuciusCase(id: number) { return (await getRepository()).getLuciusCase(id); }
export async function createLuciusCase(input: NewLuciusCase) { return (await getRepository()).createLuciusCase(input); }
export async function updateLuciusCase(id: number, input: LuciusCasePatch) { return (await getRepository()).updateLuciusCase(id, input); }
export async function deleteLuciusCase(id: number) { return (await getRepository()).deleteLuciusCase(id); }
export async function recordLuciusCaseRecurrence(id: number, occurredDate = dateInEvaOrbit()) { return (await getRepository()).recordLuciusCaseRecurrence(id, dateOnly(occurredDate, "复发日期")); }
export async function getLuciusState() { return (await getRepository()).getLuciusState(); }
export async function updateLuciusState(input: LuciusStatePatch) { return (await getRepository()).updateLuciusState(input); }
