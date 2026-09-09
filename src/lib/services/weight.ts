import "server-only";

import { getRepository } from "../repositories";
import type { NewWeightRecord, WeightRecordListInput, WeightRecordPatch } from "../repositories/types";
import type { WeightSettings } from "../types";

export async function listWeightRecords(input: WeightRecordListInput = {}) { return (await getRepository()).listWeightRecords(input); }
export async function getWeightRecord(id: number) { return (await getRepository()).getWeightRecord(id); }
export async function createWeightRecord(input: NewWeightRecord) { return (await getRepository()).createWeightRecord(input); }
export async function updateWeightRecord(id: number, input: WeightRecordPatch) { return (await getRepository()).updateWeightRecord(id, input); }
export async function deleteWeightRecord(id: number) { return (await getRepository()).deleteWeightRecord(id); }
export async function getWeightSettings() { return (await getRepository()).getWeightSettings(); }
export async function updateWeightSettings(input: Pick<WeightSettings, "targetWeightKg" | "reminderEnabled" | "reminderTime">) { return (await getRepository()).updateWeightSettings(input); }
