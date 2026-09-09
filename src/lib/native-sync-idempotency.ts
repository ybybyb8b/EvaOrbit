import type { NativeSyncMutation, NativeSyncResult } from "./native-sync-contract.ts";

export type MutationClaim = { kind: "claimed" } | { kind: "processing" } | { kind: "completed"; result: NativeSyncResult };
export interface MutationReceiptStore {
  claim(mutation: NativeSyncMutation): Promise<MutationClaim>;
  complete(mutationId: string, result: NativeSyncResult): Promise<void>;
  release(mutationId: string): Promise<void>;
}

export async function applyIdempotently(mutation: NativeSyncMutation, store: MutationReceiptStore, apply: () => Promise<NativeSyncResult>): Promise<NativeSyncResult> {
  const claim = await store.claim(mutation);
  if (claim.kind === "completed") return claim.result.status === "applied" ? { ...claim.result, status: "duplicate" } : claim.result;
  if (claim.kind === "processing") return { mutationId: mutation.mutationId, resourceType: mutation.resourceType, localId: mutation.localId, status: "retry", error: "该 mutation 正在处理，请稍后重试" };
  try {
    const result = await apply();
    await store.complete(mutation.mutationId, result);
    return result;
  } catch (error) {
    await store.release(mutation.mutationId);
    throw error;
  }
}
