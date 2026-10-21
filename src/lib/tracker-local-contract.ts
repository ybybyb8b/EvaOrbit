import { ValidationError } from "./validation.ts";

export const TRACKER_SYNC_VERSION = 2;
export const TRACKER_SYNC_BATCH = 50;
export const trackerResources = ["tracker", "tracker_field", "tracker_entry"] as const;
export type TrackerResource = typeof trackerResources[number];
export type TrackerMutation = {
  mutationId: string;
  resourceType: TrackerResource;
  operation: "create" | "update" | "delete";
  localId: string;
  serverId?: number;
  baseVersion?: number;
  parentVersion?: number;
  payload: Record<string, unknown>;
};
export type TrackerRemote = { resourceType: TrackerResource; serverId: number; version: number; payload: Record<string, unknown> };
export type TrackerResult = {
  mutationId: string;
  status: "applied" | "duplicate" | "conflict" | "rejected" | "retry";
  serverId?: number;
  version?: number;
  error?: string;
};
export type TrackerSyncRequest = { protocolVersion: 2; accountId: string; mutations: TrackerMutation[] };
export type TrackerSyncResponse = {
  protocolVersion: 2;
  accountId: string;
  results: TrackerResult[];
  snapshot: { complete: true; revision: number; records: TrackerRemote[] };
};

export function parseTrackerSyncRequest(value: unknown): TrackerSyncRequest {
  const body = value as Partial<TrackerSyncRequest> | null;
  if (!body || body.protocolVersion !== 2) throw new ValidationError("同步协议已升级，请更新本地 Tracker 客户端；旧协议写入已停用");
  if (typeof body.accountId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.accountId)) throw new ValidationError("同步账户格式不正确");
  if (!Array.isArray(body.mutations) || body.mutations.length > TRACKER_SYNC_BATCH) throw new ValidationError("同步批次最多 50 条");
  const seen = new Set<string>();
  for (const item of body.mutations) {
    if (!item || typeof item.mutationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.mutationId) || seen.has(item.mutationId)) throw new ValidationError("mutationId 格式不正确或重复");
    seen.add(item.mutationId);
    if (!trackerResources.includes(item.resourceType) || !["create", "update", "delete"].includes(item.operation)) throw new ValidationError("PoC 仅支持 Tracker、属性与记录");
    if (typeof item.localId !== "string" || !item.localId || item.localId.length > 100) throw new ValidationError("本地 ID 格式不正确");
    if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) throw new ValidationError("同步内容格式不正确");
    if (item.serverId !== undefined && (!Number.isSafeInteger(item.serverId) || item.serverId <= 0)) throw new ValidationError("服务端 ID 格式不正确");
    if (item.operation !== "create" && (!item.serverId || !Number.isSafeInteger(item.baseVersion) || item.baseVersion! <= 0)) throw new ValidationError("更新与删除需要服务端版本");
    if (item.resourceType !== "tracker" && item.operation !== "delete" && (!Number.isSafeInteger(item.parentVersion) || item.parentVersion! <= 0)) throw new ValidationError("记录与属性需要 Tracker 结构版本");
    if (item.resourceType !== "tracker" && item.operation !== "delete" && (!Number.isSafeInteger(item.payload.trackerId) || Number(item.payload.trackerId) <= 0)) throw new ValidationError("所属 Tracker ID 格式不正确");
  }
  return body as TrackerSyncRequest;
}
