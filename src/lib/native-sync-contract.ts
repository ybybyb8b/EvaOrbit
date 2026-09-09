import { ValidationError } from "./validation.ts";

export const NATIVE_SYNC_PROTOCOL_VERSION = 1;
export const nativeSyncResourceTypes = ["tracker", "tracker_field", "tracker_goal", "tracker_reminder", "tracker_entry", "tracker_icon"] as const;
export const nativeSyncOperations = ["create", "update", "delete"] as const;

export type NativeSyncResourceType = typeof nativeSyncResourceTypes[number];
export type NativeSyncOperation = typeof nativeSyncOperations[number];
export type NativeSyncMutation = {
  mutationId: string;
  resourceType: NativeSyncResourceType;
  operation: NativeSyncOperation;
  localId: string;
  serverId?: number;
  baseUpdatedAt?: string;
  payload: Record<string, unknown>;
};
export type NativeSyncRequest = { protocolVersion: 1; mutations: NativeSyncMutation[] };
export type NativeSyncResult = {
  mutationId: string;
  resourceType: NativeSyncResourceType;
  localId: string;
  status: "applied" | "duplicate" | "conflict" | "rejected" | "retry";
  serverId?: number;
  serverUpdatedAt?: string;
  conflictKind?: "stale_base" | "remote_deleted";
  remote?: Record<string, unknown>;
  error?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${label}格式不正确`);
  return value as Record<string, unknown>;
}

export function parseNativeSyncRequest(value: unknown): NativeSyncRequest {
  const body = object(value, "同步请求");
  if (body.protocolVersion !== NATIVE_SYNC_PROTOCOL_VERSION) throw new ValidationError("不支持的同步协议版本");
  if (!Array.isArray(body.mutations) || body.mutations.length > 100) throw new ValidationError("同步 mutation 列表格式不正确");
  const seen = new Set<string>();
  const mutations = body.mutations.map((raw) => {
    const item = object(raw, "同步 mutation");
    if (typeof item.mutationId !== "string" || !uuidPattern.test(item.mutationId) || seen.has(item.mutationId)) throw new ValidationError("mutationId 格式不正确或重复");
    seen.add(item.mutationId);
    if (!nativeSyncResourceTypes.includes(item.resourceType as NativeSyncResourceType)) throw new ValidationError("同步资源类型不受支持");
    if (!nativeSyncOperations.includes(item.operation as NativeSyncOperation)) throw new ValidationError("同步操作不受支持");
    if (typeof item.localId !== "string" || !item.localId || item.localId.length > 100) throw new ValidationError("本地 ID 格式不正确");
    if (item.serverId !== undefined && (!Number.isSafeInteger(item.serverId) || Number(item.serverId) <= 0)) throw new ValidationError("服务端 ID 格式不正确");
    if (item.baseUpdatedAt !== undefined && (typeof item.baseUpdatedAt !== "string" || Number.isNaN(Date.parse(item.baseUpdatedAt)))) throw new ValidationError("base_updated_at 格式不正确");
    if (item.operation !== "create" && (item.serverId === undefined || item.baseUpdatedAt === undefined)) throw new ValidationError("更新或删除必须提供 serverId 和 baseUpdatedAt");
    const payload = item.operation === "delete" && item.payload === undefined ? {} : object(item.payload, "mutation payload");
    return {
      mutationId: item.mutationId,
      resourceType: item.resourceType,
      operation: item.operation,
      localId: item.localId,
      ...(item.serverId === undefined ? {} : { serverId: item.serverId }),
      ...(item.baseUpdatedAt === undefined ? {} : { baseUpdatedAt: item.baseUpdatedAt }),
      payload,
    } as NativeSyncMutation;
  });
  return { protocolVersion: NATIVE_SYNC_PROTOCOL_VERSION, mutations };
}

export function conflictFor(baseUpdatedAt: string | undefined, remote: { updatedAt: string } | null) {
  if (!remote) return "remote_deleted" as const;
  return baseUpdatedAt === remote.updatedAt ? null : "stale_base" as const;
}
