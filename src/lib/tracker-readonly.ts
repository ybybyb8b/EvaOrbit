import { emptyTrackerState, type TrackerLocalState } from "./tracker-local-store.ts";
import type { Tracker, TrackerField, TrackerEntry } from "./types.ts";

export type TrackerReadonlyDetail = { tracker: Tracker; fields: TrackerField[]; entries: TrackerEntry[]; stats: { total: number } };
export type TrackerReadonlySnapshot = { format: "eo-trackers-readonly-v1"; accountId: string; capturedAt: string; details: TrackerReadonlyDetail[] };

/** A read-only projection has no mutation versions and can never seed an upload queue. */
export function readonlyTrackerState(snapshot: TrackerReadonlySnapshot, accountId: string): TrackerLocalState {
  if (snapshot?.format !== "eo-trackers-readonly-v1" || snapshot.accountId !== accountId || !Array.isArray(snapshot.details) || !Number.isFinite(Date.parse(snapshot.capturedAt))) throw new Error("只读快照或账户不匹配，原有数据已保留");
  const state = emptyTrackerState(accountId), ids = new Set<string>();
  state.revision = 1; // Separate read-only cache exists, including a genuinely empty account.
  function add(resourceType: "tracker" | "tracker_field" | "tracker_entry", payload: Record<string, unknown>) {
    const id = payload.id;
    if (!Number.isSafeInteger(id) || Number(id) < 1 || ids.has(resourceType + ":" + id)) throw new Error("只读快照包含无效或重复记录");
    ids.add(resourceType + ":" + id);
    state.records.push({ id: "readonly:" + resourceType + ":" + id, serverId: Number(id), resourceType, payload });
  }
  for (const detail of snapshot.details) {
    if (!detail?.tracker || typeof detail.tracker.name !== "string" || !Array.isArray(detail.fields) || !Array.isArray(detail.entries) || detail.stats?.total !== detail.entries.length) throw new Error("云端返回的 Tracker 数据不完整，保留上次快照");
    add("tracker", { ...detail.tracker });
    for (const field of detail.fields) {
      if (field.trackerId !== detail.tracker.id || typeof field.key !== "string" || typeof field.name !== "string" || !Array.isArray(field.options) || !["number","single_select","multi_select","text","boolean","rating","time_range"].includes(field.type)) throw new Error("历史属性结构不兼容，保留上次快照");
      add("tracker_field", { ...field });
    }
    for (const entry of detail.entries) {
      if (entry.trackerId !== detail.tracker.id || !Number.isFinite(Date.parse(entry.occurredAt)) || !entry.values || typeof entry.values !== "object" || Array.isArray(entry.values) || typeof entry.note !== "string") throw new Error("历史记录结构不兼容，保留上次快照");
      add("tracker_entry", { ...entry });
    }
  }
  return state;
}

export async function fetchReadonlyTrackers(accountId: string, get: (path: string) => Promise<unknown>): Promise<TrackerReadonlySnapshot> {
  const identity = await get("session") as { accountId?: string; authenticated?: boolean };
  if (!identity?.authenticated || identity.accountId !== accountId) throw new Error("登录账户已变化，请重新连接账户");
  const summaries = await get("trackers") as Tracker[];
  if (!Array.isArray(summaries) || new Set(summaries.map(row => row.id)).size !== summaries.length) throw new Error("Tracker 列表不完整");
  const details: TrackerReadonlyDetail[] = [];
  for (const tracker of summaries) {
    if (!Number.isSafeInteger(tracker.id) || tracker.id < 1) throw new Error("Tracker ID 不正确");
    const detail = await get("trackers/" + tracker.id) as TrackerReadonlyDetail;
    if (detail?.tracker?.id !== tracker.id) throw new Error("Tracker 内容不匹配");
    details.push(detail);
  }
  const finalIdentity = await get("session") as { accountId?: string; authenticated?: boolean };
  if (!finalIdentity?.authenticated || finalIdentity.accountId !== accountId) throw new Error("读取期间账户已变化，未替换本地快照");
  const snapshot: TrackerReadonlySnapshot = { format: "eo-trackers-readonly-v1", accountId, capturedAt: new Date().toISOString(), details };
  readonlyTrackerState(snapshot, accountId);
  return snapshot;
}
