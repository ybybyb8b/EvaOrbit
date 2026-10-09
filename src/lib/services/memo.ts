import "server-only";

import { getRepository } from "../repositories";
import type { MemoListInput, MemoPatch, NewMemo } from "../repositories/types";
import { notifyLuciusActivity } from "./push";

export async function listMemos(input: MemoListInput = {}) { return (await getRepository()).listMemos(input); }
export async function getMemo(id: number) { return (await getRepository()).getMemo(id); }
export async function createMemo(input: NewMemo) { return (await getRepository()).createMemo(input); }
export async function updateMemo(id: number, input: MemoPatch) {
  const repository = await getRepository();
  const previous = input.content === undefined ? null : await repository.getMemo(id);
  const memo = await repository.updateMemo(id, input);
  if (memo && previous && memo.title === "recent_life_context" && memo.status === "active" && memo.tags.includes("lucius") && memo.content !== previous.content) {
    await notifyLuciusActivity(repository, {
      kind: "memo_updated", title: "生活近况已更新", body: "Lucius 更新了 recent_life_context", url: `/memo/${memo.id}`, tag: `memo-updated-${memo.id}`,
    });
  }
  return memo;
}
export async function deleteMemo(id: number) { return (await getRepository()).deleteMemo(id); }
