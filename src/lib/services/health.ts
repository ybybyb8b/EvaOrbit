import "server-only";

import { ValidationError } from "../validation";
import { getRepository } from "../repositories";
import type { HealthRecordListInput, NewHealthRecord } from "../repositories/types";

export async function listHealthRecords(input: HealthRecordListInput = {}) {
  return (await getRepository()).listHealthRecords(input);
}

export async function getHealthRecord(id: number) {
  return (await getRepository()).getHealthRecord(id);
}

export async function createHealthRecord(input: NewHealthRecord) {
  return (await getRepository()).createHealthRecord(input);
}

export async function updateHealthRecord(id: number, input: Record<string, unknown>) {
  const repository = await getRepository();
  const existing = await repository.getHealthRecord(id);
  if (!existing) return null;
  const startedAt = input.startedAt === undefined ? existing.startedAt : input.startedAt as string | null;
  const endedAt = input.endedAt === undefined ? existing.endedAt : input.endedAt as string | null;
  if (startedAt && endedAt && endedAt < startedAt) {
    throw new ValidationError("结束时间不能早于开始时间");
  }
  return repository.updateHealthRecord(id, input);
}

export async function deleteHealthRecord(id: number) {
  return (await getRepository()).deleteHealthRecord(id);
}
