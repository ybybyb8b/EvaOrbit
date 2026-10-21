import type { NativeSyncMutation, NativeSyncResult } from "./native-sync-contract.ts";

export type MutationClaim = { kind: "claimed" } | { kind: "processing" } | { kind: "completed"; result: NativeSyncResult };
export interface MutationReceiptStore {
  claim(mutation: NativeSyncMutation): Promise<MutationClaim>;
  complete(mutationId: string, result: NativeSyncResult): Promise<void>;
  release(mutationId: string): Promise<void>;
}

/** @deprecated Legacy non-transactional contract. Production uses tracker_sync_v2. */
export async function applyIdempotently(mutation: NativeSyncMutation, store: MutationReceiptStore, apply: () => Promise<NativeSyncResult>): Promise<NativeSyncResult> {
  const claim = await store.claim(mutation);
  if (claim.kind === "completed") return claim.result.status === "applied" ? { ...claim.result, status: "duplicate" } : claim.result;
  if (claim.kind === "processing") return { mutationId: mutation.mutationId, resourceType: mutation.resourceType, localId: mutation.localId, status: "retry", error: "该 mutation 正在处理，请稍后重试" };
  let result: NativeSyncResult;
  try {
    result = await apply();
  } catch (error) {
    await store.release(mutation.mutationId);
    throw error;
  }
  // A receipt failure AFTER the business write must never release the claim.
  // This legacy primitive cannot recover that gap; the transactional RPC can.
  await store.complete(mutation.mutationId, result);
  return result;
}
