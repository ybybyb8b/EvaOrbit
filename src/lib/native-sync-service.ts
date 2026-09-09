import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getRepository } from "./repositories";
import { createSupabaseServerClient } from "./supabase/server";
import { createTracker, createTrackerEntry, createTrackerField, createTrackerGoal, createTrackerReminder, deleteTracker, deleteTrackerEntry, deleteTrackerField, deleteTrackerGoal, deleteTrackerReminder, getTrackerDetail, listTrackerSummaries, updateTracker, updateTrackerEntry, updateTrackerReminder } from "./services/tracker";
import { resetTrackerIcon, saveTrackerIcon } from "./services/tracker-icon";
import { parseNewTracker, parseNewTrackerEntry, parseNewTrackerField, parseNewTrackerGoal, parseNewTrackerReminder, parseTrackerEntryPatch, parseTrackerPatch, parseTrackerReminderPatch, ValidationError } from "./validation";
import { applyIdempotently, type MutationClaim, type MutationReceiptStore } from "./native-sync-idempotency";
import { conflictFor, type NativeSyncMutation, type NativeSyncRequest, type NativeSyncResult } from "./native-sync-contract";

type NativeSyncSnapshot = {
  trackers: Record<string, unknown>[];
  trackerFields: Record<string, unknown>[];
  trackerGoals: Record<string, unknown>[];
  trackerReminders: Record<string, unknown>[];
  trackerEntries: Record<string, unknown>[];
};

function baseResult(mutation: NativeSyncMutation): Pick<NativeSyncResult, "mutationId" | "resourceType" | "localId"> {
  return { mutationId: mutation.mutationId, resourceType: mutation.resourceType, localId: mutation.localId };
}

function record(value: object): Record<string, unknown> {
  return { ...value };
}

async function applyMutation(mutation: NativeSyncMutation): Promise<NativeSyncResult> {
  const repository = await getRepository();
  let current: { id: number; updatedAt: string } | null = null;
  if (mutation.serverId) {
    if (mutation.resourceType === "tracker" || mutation.resourceType === "tracker_icon") current = await repository.getTracker(mutation.serverId);
    else if (mutation.resourceType === "tracker_entry") current = await repository.getTrackerEntry(mutation.serverId);
    else if (mutation.resourceType === "tracker_reminder") current = await repository.getTrackerReminder(mutation.serverId);
    else {
      for (const tracker of await repository.listTrackers()) {
        const values = mutation.resourceType === "tracker_field" ? await repository.listTrackerFields(tracker.id) : await repository.listTrackerGoals(tracker.id);
        const found = values.find((value) => value.id === mutation.serverId);
        if (found) { current = found; break; }
      }
    }
  }

  if (mutation.operation !== "create") {
    const conflictKind = conflictFor(mutation.baseUpdatedAt, current);
    if (conflictKind) return { ...baseResult(mutation), status: "conflict", serverId: mutation.serverId, conflictKind, ...(current ? { remote: record(current) } : {}) };
  }

  if (mutation.resourceType === "tracker") {
    if (mutation.operation === "create") {
      const created = await createTracker(parseNewTracker(mutation.payload));
      return { ...baseResult(mutation), status: "applied", serverId: created.id, serverUpdatedAt: created.updatedAt };
    }
    if (mutation.operation === "update") {
      const updated = await updateTracker(mutation.serverId!, parseTrackerPatch(mutation.payload));
      return updated ? { ...baseResult(mutation), status: "applied", serverId: updated.id, serverUpdatedAt: updated.updatedAt } : { ...baseResult(mutation), status: "conflict", serverId: mutation.serverId, conflictKind: "remote_deleted" };
    }
    await deleteTracker(mutation.serverId!);
    return { ...baseResult(mutation), status: "applied", serverId: mutation.serverId };
  }

  if (mutation.resourceType === "tracker_entry" && mutation.operation === "create") {
    const created = await createTrackerEntry(parseNewTrackerEntry(mutation.payload));
    return { ...baseResult(mutation), status: "applied", serverId: created.id, serverUpdatedAt: created.updatedAt };
  }
  if (mutation.resourceType === "tracker_entry" && mutation.operation === "update") {
    const updated = await updateTrackerEntry(mutation.serverId!, parseTrackerEntryPatch(mutation.payload));
    return updated ? { ...baseResult(mutation), status: "applied", serverId: updated.id, serverUpdatedAt: updated.updatedAt } : { ...baseResult(mutation), status: "conflict", serverId: mutation.serverId, conflictKind: "remote_deleted" };
  }
  if (mutation.resourceType === "tracker_entry") {
    await deleteTrackerEntry(mutation.serverId!);
    return { ...baseResult(mutation), status: "applied", serverId: mutation.serverId };
  }

  if (mutation.resourceType === "tracker_field") {
    if (mutation.operation === "create") {
      const created = await createTrackerField(parseNewTrackerField(mutation.payload));
      return { ...baseResult(mutation), status: "applied", serverId: created.id, serverUpdatedAt: created.updatedAt };
    }
    if (mutation.operation === "update") throw new ValidationError("Tracker 字段不支持直接修改");
    await deleteTrackerField(mutation.serverId!);
    return { ...baseResult(mutation), status: "applied", serverId: mutation.serverId };
  }

  if (mutation.resourceType === "tracker_goal") {
    if (mutation.operation === "create") {
      const created = await createTrackerGoal(parseNewTrackerGoal(mutation.payload));
      return { ...baseResult(mutation), status: "applied", serverId: created.id, serverUpdatedAt: created.updatedAt };
    }
    if (mutation.operation === "update") throw new ValidationError("Tracker Goal 不支持直接修改");
    await deleteTrackerGoal(mutation.serverId!);
    return { ...baseResult(mutation), status: "applied", serverId: mutation.serverId };
  }

  if (mutation.resourceType === "tracker_reminder") {
    if (mutation.operation === "create") {
      const created = await createTrackerReminder(parseNewTrackerReminder(mutation.payload));
      return { ...baseResult(mutation), status: "applied", serverId: created.id, serverUpdatedAt: created.updatedAt };
    }
    if (mutation.operation === "update") {
      const updated = await updateTrackerReminder(mutation.serverId!, parseTrackerReminderPatch(mutation.payload));
      return updated ? { ...baseResult(mutation), status: "applied", serverId: updated.id, serverUpdatedAt: updated.updatedAt } : { ...baseResult(mutation), status: "conflict", serverId: mutation.serverId, conflictKind: "remote_deleted" };
    }
    await deleteTrackerReminder(mutation.serverId!);
    return { ...baseResult(mutation), status: "applied", serverId: mutation.serverId };
  }

  if (mutation.operation === "delete") {
    const tracker = await resetTrackerIcon(mutation.serverId!);
    return tracker ? { ...baseResult(mutation), status: "applied", serverId: tracker.id, serverUpdatedAt: tracker.updatedAt } : { ...baseResult(mutation), status: "conflict", serverId: mutation.serverId, conflictKind: "remote_deleted" };
  }
  if (mutation.operation !== "update") throw new ValidationError("Tracker 图片操作不受支持");
  const data = mutation.payload.dataBase64;
  const mime = mutation.payload.mime;
  if (typeof data !== "string" || data.length > 1_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new ValidationError("Tracker 图片数据格式不正确");
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") throw new ValidationError("Tracker 图片类型不受支持");
  const bytes = Buffer.from(data, "base64");
  const tracker = await saveTrackerIcon(mutation.serverId!, new File([bytes], "tracker-image", { type: mime }));
  return tracker ? { ...baseResult(mutation), status: "applied", serverId: tracker.id, serverUpdatedAt: tracker.updatedAt } : { ...baseResult(mutation), status: "conflict", serverId: mutation.serverId, conflictKind: "remote_deleted" };
}

async function snapshot(): Promise<NativeSyncSnapshot> {
  const summaries = await listTrackerSummaries();
  const details = await Promise.all(summaries.map((tracker) => getTrackerDetail(tracker.id)));
  return {
    trackers: details.flatMap((detail) => detail ? [record(detail.tracker)] : []),
    trackerFields: details.flatMap((detail) => detail ? detail.fields.map(record) : []),
    trackerGoals: details.flatMap((detail) => detail ? detail.goals.map(record) : []),
    trackerReminders: details.flatMap((detail) => detail ? detail.reminders.map(record) : []),
    trackerEntries: details.flatMap((detail) => detail ? detail.entries.map(record) : []),
  };
}

async function receiptStore(userId: string): Promise<MutationReceiptStore> {
  const client = await createSupabaseServerClient();
  return {
    async claim(mutation): Promise<MutationClaim> {
      const { error } = await client.from("native_sync_mutations").insert({ user_id: userId, mutation_id: mutation.mutationId, request_json: mutation });
      if (!error) return { kind: "claimed" };
      if (error.code !== "23505") throw error;
      const { data, error: readError } = await client.from("native_sync_mutations").select("status,request_json,result_json").eq("user_id", userId).eq("mutation_id", mutation.mutationId).single();
      if (readError) throw readError;
      if (!isDeepStrictEqual(data.request_json, mutation)) return { kind: "completed", result: { ...baseResult(mutation), status: "rejected", error: "mutationId 已用于不同请求" } };
      return data.status === "completed" ? { kind: "completed", result: data.result_json as NativeSyncResult } : { kind: "processing" };
    },
    async complete(mutationId, result) {
      const { error } = await client.from("native_sync_mutations").update({ status: "completed", result_json: result }).eq("user_id", userId).eq("mutation_id", mutationId);
      if (error) throw error;
    },
    async release(mutationId) {
      const { error } = await client.from("native_sync_mutations").delete().eq("user_id", userId).eq("mutation_id", mutationId).eq("status", "processing");
      if (error) throw error;
    },
  };
}

export async function synchronizeNativeTrackers(userId: string, request: NativeSyncRequest) {
  const store = await receiptStore(userId);
  const results: NativeSyncResult[] = [];
  for (const mutation of request.mutations) {
    results.push(await applyIdempotently(mutation, store, async () => {
      try {
        return await applyMutation(mutation);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        return { ...baseResult(mutation), status: "rejected", error: error.message };
      }
    }));
  }
  return { protocolVersion: 1 as const, results, snapshot: await snapshot(), serverTime: new Date().toISOString() };
}
