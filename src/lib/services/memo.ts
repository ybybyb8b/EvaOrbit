import "server-only";

import { getRepository } from "../repositories";
import type { MemoListInput, MemoPatch, NewMemo } from "../repositories/types";

export async function listMemos(input: MemoListInput = {}) { return (await getRepository()).listMemos(input); }
export async function getMemo(id: number) { return (await getRepository()).getMemo(id); }
export async function createMemo(input: NewMemo) { return (await getRepository()).createMemo(input); }
export async function updateMemo(id: number, input: MemoPatch) { return (await getRepository()).updateMemo(id, input); }
export async function deleteMemo(id: number) { return (await getRepository()).deleteMemo(id); }
