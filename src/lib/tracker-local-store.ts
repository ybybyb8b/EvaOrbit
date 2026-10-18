import { TRACKER_SYNC_BATCH, trackerResources, type TrackerMutation, type TrackerRemote, type TrackerResource, type TrackerResult, type TrackerSyncRequest, type TrackerSyncResponse } from "./tracker-local-contract.ts";

export type LocalTrackerRecord = {
  id: string; resourceType: TrackerResource; serverId?: number; version?: number;
  payload: Record<string, unknown>; status?: "conflict" | "rejected"; error?: string;
  remote?: TrackerRemote | null;
};
export type TrackerOutboxItem = {
  mutationId: string; localId: string; resourceType: TrackerResource;
  operation: TrackerMutation["operation"]; payload: Record<string, unknown>;
  wire?: TrackerMutation;
};
export type TrackerLocalState = { schemaVersion: 1; accountId: string; revision: number; remoteRevision?: number; records: LocalTrackerRecord[]; outbox: TrackerOutboxItem[] };
export type TrackerStorage = {
  read(): Promise<TrackerLocalState | null>;
  commit(expectedRevision: number, next: TrackerLocalState): Promise<boolean>;
};
export type TrackerTransport = (request: TrackerSyncRequest) => Promise<TrackerSyncResponse>;
export const emptyTrackerState = (accountId: string): TrackerLocalState => ({ schemaVersion: 1, accountId, revision: 0, records: [], outbox: [] });

// randomUUID is restricted to secure contexts; bundled WK custom schemes still
// expose cryptographic getRandomValues. Do not fall back to Math.random.
export function newTrackerLocalId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validateTrackerState(state: TrackerLocalState, accountId: string) {
  if (state.schemaVersion !== 1 || state.accountId !== accountId || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.records) || !Array.isArray(state.outbox)) throw new Error("本地数据库版本或账户不匹配，数据已保留，请勿清除 App");
}

function remoteKey(type: TrackerResource, id: number) { return `${type}:${id}`; }
function parentFor(state: TrackerLocalState, payload: Record<string, unknown>) {
  return state.records.find(row => row.resourceType === "tracker" && (typeof payload.trackerLocalId === "string" ? row.id === payload.trackerLocalId : typeof payload.trackerId === "number" && row.serverId === payload.trackerId));
}

export function prepareTrackerBatch(state: TrackerLocalState): TrackerMutation[] {
  const sent: TrackerMutation[] = [], records = new Set<string>(), parents = new Set<string>();
  let kind: TrackerResource | undefined;
  for (const resource of trackerResources) {
    for (const item of state.outbox.filter(item => item.resourceType === resource)) {
      const record = state.records.find(row => row.id === item.localId);
      if (!record || record.status || records.has(record.id) || sent.length >= TRACKER_SYNC_BATCH || kind && kind !== resource) continue;
      if (item.wire) {
        const parent = parentFor(state, item.payload);
        if (resource === "tracker_field" && parent && parents.has(parent.id)) continue;
        if (parent) parents.add(parent.id);
        sent.push(item.wire); records.add(record.id); kind = resource; continue;
      }
      const payload = { ...item.payload };
      let parentVersion: number | undefined;
      if (resource !== "tracker") {
        const parent = parentFor(state, payload);
        if (!parent?.serverId || parent.status || state.outbox.some(other => other.localId === parent.id)) continue;
        const children = state.outbox.filter(other => parentFor(state, other.payload)?.id === parent.id);
        if (resource === "tracker_entry" && children.some(other => other.resourceType === "tracker_field")) continue;
        if (resource === "tracker_field" && parents.has(parent.id)) continue;
        parents.add(parent.id);
        parentVersion = parent.version;
        payload.trackerId = parent.serverId;
        delete payload.trackerLocalId;
      }
      if (item.operation !== "create" && (!record.serverId || !record.version)) continue;
      const wire: TrackerMutation = { mutationId: item.mutationId, localId: item.localId, resourceType: resource, operation: item.operation, payload,
        ...(item.operation === "create" ? {} : { serverId: record.serverId, baseVersion: record.version }),
        ...(resource === "tracker" || item.operation === "delete" ? {} : { parentVersion }) };
      // Freeze before the network call. A lost response always retries byte-equivalent content.
      item.wire = wire;
      sent.push(wire); records.add(record.id); kind = resource;
    }
  }
  return sent;
}

export function mergeTrackerResponse(state: TrackerLocalState, response: TrackerSyncResponse, sent: TrackerMutation[]) {
  if (response.protocolVersion !== 2 || response.accountId !== state.accountId || response.snapshot?.complete !== true || !Array.isArray(response.snapshot.records) || !Array.isArray(response.results)) throw new Error("同步响应不完整，本地数据未更改");
  if (!Number.isSafeInteger(response.snapshot.revision) || response.snapshot.revision <= 0) throw new Error("同步快照版本无效");
  const expected = new Set(sent.map(item => item.mutationId));
  const seenResults = new Set<string>(), remoteIds = new Set<string>();
  for (const result of response.results) {
    if (!expected.has(result.mutationId) || seenResults.has(result.mutationId) || !["applied", "duplicate", "conflict", "rejected", "retry"].includes(result.status)) throw new Error("同步回执不完整，本地数据未更改");
    seenResults.add(result.mutationId);
    const request = sent.find(item => item.mutationId === result.mutationId)!;
    if (["applied", "duplicate"].includes(result.status) && request.operation !== "delete" && (!Number.isSafeInteger(result.serverId) || result.serverId! <= 0 || !Number.isSafeInteger(result.version) || result.version! <= 0)) throw new Error("同步版本无效");
  }
  if (seenResults.size !== expected.size) throw new Error("同步回执缺失，本地数据未更改");
  for (const remote of response.snapshot.records) {
    const key = remoteKey(remote.resourceType, remote.serverId);
    if (!trackerResources.includes(remote.resourceType) || !Number.isSafeInteger(remote.serverId) || remote.serverId <= 0 || !Number.isSafeInteger(remote.version) || remote.version <= 0 || !remote.payload || typeof remote.payload !== "object" || remoteIds.has(key)) throw new Error("远端快照无效，本地数据未更改");
    remoteIds.add(key);
  }
  for (const result of response.results) {
    const item = state.outbox.find(item => item.mutationId === result.mutationId);
    if (!item) continue;
    const row = state.records.find(row => row.id === item.localId);
    if (!row) throw new Error("本地队列缺少对应记录");
    if (result.status === "applied" || result.status === "duplicate") {
      row.serverId = result.serverId; row.version = Math.max(row.version ?? 0, result.version ?? 0);
      state.outbox = state.outbox.filter(other => other.mutationId !== item.mutationId);
      if (item.operation === "delete") state.records = state.records.filter(other => other.id !== row.id);
    } else if (result.status === "conflict" || result.status === "rejected") {
      row.status = result.status; row.error = result.error ?? "请检查本地记录后重试";
    }
  }
  // Another window can commit a newer snapshot while this request is in flight.
  // Still acknowledge receipts, but never roll the replica back to an older view.
  if (response.snapshot.revision <= (state.remoteRevision ?? 0)) return;
  state.remoteRevision = response.snapshot.revision;
  for (const remote of response.snapshot.records) {
    let row = state.records.find(row => row.resourceType === remote.resourceType && row.serverId === remote.serverId);
    if (!row) {
      row = { id: `remote:${remoteKey(remote.resourceType, remote.serverId)}`, resourceType: remote.resourceType, payload: {} };
      state.records.push(row);
    }
    if (row.status || state.outbox.some(item => item.localId === row.id)) {
      row.remote = remote;
      if (row.version !== undefined && row.version !== remote.version) { row.status = "conflict"; row.error = "远端记录已更新，本地内容已保留"; }
    } else Object.assign(row, { serverId: remote.serverId, version: remote.version, payload: remote.payload, remote: undefined });
  }
  state.records = state.records.filter(row => {
    if (!row.serverId || remoteIds.has(remoteKey(row.resourceType, row.serverId))) return true;
    if (row.status || state.outbox.some(item => item.localId === row.id)) {
      row.status = "conflict"; row.remote = null; row.error = "远端记录已删除，本地内容已保留"; return true;
    }
    return false;
  });
  for (const row of state.records) {
    if (row.resourceType !== "tracker" && !parentFor(state, row.payload)) {
      row.status = "conflict"; row.error = "所属 Tracker 已删除，本地内容已保留，可导出后整理";
    }
  }
}

export class LocalTrackerStore {
  private state: TrackerLocalState;
  private work: Promise<unknown> = Promise.resolve();
  private syncWork: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  readonly accountId: string;
  private storage: TrackerStorage;
  constructor(accountId: string, storage: TrackerStorage) { this.accountId = accountId; this.storage = storage; this.state = emptyTrackerState(accountId); }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  async initialize() {
    const saved = await this.storage.read();
    if (saved) { validateTrackerState(saved, this.accountId); this.state = saved; }
    this.listeners.forEach(listener => listener());
  }
  private change<T>(action: (next: TrackerLocalState) => T): Promise<T> {
    const task = this.work.then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const next = structuredClone(this.state);
        const result = action(next);
        next.revision++;
        if (await this.storage.commit(this.state.revision, next)) {
          this.state = next; this.listeners.forEach(listener => listener()); return result;
        }
        const current = await this.storage.read();
        if (!current) throw new Error("本地数据库读取失败");
        validateTrackerState(current, this.accountId); this.state = current;
      }
      throw new Error("另一个窗口正在更新记录，请重试");
    });
    this.work = task.catch(() => undefined);
    return task;
  }
  async save(resourceType: TrackerResource, id: string | undefined, payload: Record<string, unknown>) {
    const localId = id ?? newTrackerLocalId();
    await this.change(next => {
      const row = next.records.find(row => row.id === localId);
      if (row?.status) throw new Error("请先处理这条记录的同步问题");
      if (next.outbox.some(item => item.localId === localId && item.operation === "delete")) throw new Error("记录正在删除");
      if (row) row.payload = { ...row.payload, ...payload };
      else next.records.push({ id: localId, resourceType, payload });
      next.outbox.push({ mutationId: newTrackerLocalId(), localId, resourceType, operation: row ? "update" : "create", payload });
    });
    return localId;
  }
  async createTracker(payload: Record<string, unknown>, field?: Record<string, unknown> | Record<string, unknown>[]) {
    const id = newTrackerLocalId();
    await this.change(next => {
      next.records.push({ id, resourceType: "tracker", payload });
      next.outbox.push({ mutationId: newTrackerLocalId(), localId: id, resourceType: "tracker", operation: "create", payload });
      for (const definition of Array.isArray(field) ? field : field ? [field] : []) {
        const fieldId = newTrackerLocalId(), fieldPayload = { ...definition, trackerId: undefined, trackerLocalId: id };
        next.records.push({ id: fieldId, resourceType: "tracker_field", payload: fieldPayload });
        next.outbox.push({ mutationId: newTrackerLocalId(), localId: fieldId, resourceType: "tracker_field", operation: "create", payload: fieldPayload });
      }
    });
    return id;
  }
  async remove(id: string) {
    await this.change(next => {
      const row = next.records.find(row => row.id === id);
      if (!row || row.resourceType !== "tracker_entry" || row.status) throw new Error("请先处理记录的同步问题");
      if (next.outbox.some(item => item.localId === id && item.operation === "delete")) return;
      if (!row.serverId && !next.outbox.some(item => item.localId === id && item.wire)) {
        next.records = next.records.filter(row => row.id !== id); next.outbox = next.outbox.filter(item => item.localId !== id); return;
      }
      next.outbox.push({ mutationId: newTrackerLocalId(), localId: id, resourceType: row.resourceType, operation: "delete", payload: row.payload });
    });
  }
  async resolve(id: string, choice: "remote" | "local", replacement?: Record<string, unknown>) {
    await this.change(next => {
      const row = next.records.find(row => row.id === id);
      if (!row?.status) throw new Error("记录没有待处理的同步问题");
      if (choice === "local" && row.resourceType !== "tracker") {
        const parent = parentFor(next, row.payload);
        if (!parent || parent.status) throw new Error("所属 Tracker 不可用，请先处理 Tracker，或导出本地内容");
      }
      const deleting = !replacement && next.outbox.some(item => item.localId === id && item.operation === "delete");
      if (replacement) row.payload = { ...row.payload, ...replacement };
      next.outbox = next.outbox.filter(item => item.localId !== id);
      if (choice === "local" && deleting && row.remote === null) { next.records = next.records.filter(item => item.id !== id); return; }
      if (choice === "remote") {
        if (row.remote) Object.assign(row, { payload: row.remote.payload, serverId: row.remote.serverId, version: row.remote.version, status: undefined, error: undefined, remote: undefined });
        else next.records = next.records.filter(item => item.id !== id);
      } else {
        row.serverId = row.remote?.serverId; row.version = row.remote?.version;
        row.status = undefined; row.error = undefined; row.remote = undefined;
        next.outbox.push({ mutationId: newTrackerLocalId(), localId: id, resourceType: row.resourceType, operation: deleting ? "delete" : row.serverId ? "update" : "create", payload: row.payload });
      }
    });
  }
  synchronize(transport: TrackerTransport) {
    if (this.syncWork) return this.syncWork;
    this.syncWork = this.performSync(transport).finally(() => { this.syncWork = null; });
    return this.syncWork;
  }
  private async performSync(transport: TrackerTransport) {
    // ponytail: bounded foreground work; another foreground/timer event resumes
    // unusually large queues. Every request and receipt remains durable.
    for (let pass = 0; pass < 100; pass++) {
      const sent = await this.change(next => prepareTrackerBatch(next));
      const response = await transport({ protocolVersion: 2, accountId: this.accountId, mutations: sent });
      await this.change(next => mergeTrackerResponse(next, response, sent));
      if (!sent.length || response.results.every((result: TrackerResult) => result.status === "retry")) return;
    }
  }
}
