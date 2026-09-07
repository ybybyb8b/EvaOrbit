import type { InboxItem, InboxStatus } from "./types";

const DATABASE_NAME = "evaorbit-local-first";
const DATABASE_VERSION = 1;
const INBOX_STORE = "inbox";
const MUTATION_STORE = "pendingMutations";
const MAPPING_STORE = "idMappings";
const META_STORE = "meta";

export type InboxMutationOperation = "create" | "update" | "delete" | "action";
export type InboxMutationState = "pending" | "failed" | "conflict";
export interface PendingInboxMutation {
  id: string;
  resource: "inbox";
  operation: InboxMutationOperation;
  payload: Record<string, unknown>;
  localId: number;
  serverId: number | null;
  baseUpdatedAt: string | null;
  createdAt: string;
  attempts: number;
  nextRetryAt: string;
  state: InboxMutationState;
  lastError: string | null;
}

export type LocalFirstSyncMode = "checking" | "online" | "offline" | "syncing" | "failed" | "conflict";
export interface LocalFirstSyncState {
  mode: LocalFirstSyncMode;
  pending: number;
  error: string | null;
}

let syncState: LocalFirstSyncState = { mode: "checking", pending: 0, error: null };
const listeners = new Set<() => void>();
let activeSync: Promise<void> | null = null;

export function getLocalFirstSyncState() { return syncState; }
export function subscribeLocalFirstSync(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
function publish(patch: Partial<LocalFirstSyncState>) {
  syncState = { ...syncState, ...patch };
  listeners.forEach((listener) => listener());
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INBOX_STORE)) database.createObjectStore(INBOX_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(MUTATION_STORE)) database.createObjectStore(MUTATION_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(MAPPING_STORE)) database.createObjectStore(MAPPING_STORE, { keyPath: "localId" });
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error);
  });
}

function mutationId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

function newMutation(input: Pick<PendingInboxMutation, "operation" | "payload" | "localId" | "serverId" | "baseUpdatedAt">): PendingInboxMutation {
  const now = new Date().toISOString();
  return { id: mutationId(), resource: "inbox", createdAt: now, attempts: 0, nextRetryAt: now, state: "pending", lastError: null, ...input };
}

export function retryDelayMs(attempts: number) {
  return Math.min(1_000 * (2 ** Math.max(0, attempts - 1)), 60_000);
}

export async function listLocalInbox(status: InboxStatus | "all" = "inbox") {
  const database = await openDatabase();
  const transaction = database.transaction(INBOX_STORE, "readonly");
  const items = await requestResult(transaction.objectStore(INBOX_STORE).getAll() as IDBRequest<InboxItem[]>);
  database.close();
  return items
    .filter((item) => status === "all" || item.status === status)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id - left.id);
}

async function updatePendingCount(database?: IDBDatabase) {
  const ownDatabase = database ?? await openDatabase();
  const transaction = ownDatabase.transaction(MUTATION_STORE, "readonly");
  const mutations = await requestResult(transaction.objectStore(MUTATION_STORE).getAll() as IDBRequest<PendingInboxMutation[]>);
  if (!database) ownDatabase.close();
  publish({ pending: mutations.length });
  return { count: mutations.length, hasConflict: mutations.some((mutation) => mutation.state === "conflict") };
}

export async function createLocalInbox(content: string) {
  if (!content.trim()) throw new Error("Inbox content cannot be empty");
  const database = await openDatabase();
  const transaction = database.transaction([INBOX_STORE, MUTATION_STORE, META_STORE], "readwrite");
  const done = transactionDone(transaction);
  const metaStore = transaction.objectStore(META_STORE);
  const current = await requestResult(metaStore.get("nextInboxLocalId") as IDBRequest<{ key: string; value: number } | undefined>);
  const id = current?.value ?? -1;
  const now = new Date().toISOString();
  const item: InboxItem = { id, content: content.trim(), status: "inbox", source: "manual", processedAt: null, convertedType: null, convertedId: null, createdAt: now, updatedAt: now };
  transaction.objectStore(INBOX_STORE).put(item);
  transaction.objectStore(MUTATION_STORE).put(newMutation({ operation: "create", payload: { content: item.content, source: item.source }, localId: id, serverId: null, baseUpdatedAt: null }));
  metaStore.put({ key: "nextInboxLocalId", value: id - 1 });
  await done;
  database.close();
  await updatePendingCount();
  return item;
}

export async function updateLocalInbox(id: number, patch: Partial<Pick<InboxItem, "content" | "status">>) {
  const database = await openDatabase();
  const transaction = database.transaction([INBOX_STORE, MUTATION_STORE], "readwrite");
  const done = transactionDone(transaction);
  const inboxStore = transaction.objectStore(INBOX_STORE);
  const current = await requestResult(inboxStore.get(id) as IDBRequest<InboxItem | undefined>);
  if (!current) { transaction.abort(); database.close(); throw new Error("Inbox item is not available locally"); }
  const now = new Date().toISOString();
  const next: InboxItem = { ...current, ...patch, content: patch.content?.trim() ?? current.content, updatedAt: now };
  if (patch.status === "processed") next.processedAt = now;
  if (patch.status === "inbox") next.processedAt = null;
  inboxStore.put(next);
  transaction.objectStore(MUTATION_STORE).put(newMutation({ operation: "update", payload: patch, localId: id, serverId: id > 0 ? id : null, baseUpdatedAt: id > 0 ? current.updatedAt : null }));
  await done;
  database.close();
  await updatePendingCount();
  return next;
}

export async function deleteLocalInbox(id: number) {
  const database = await openDatabase();
  const transaction = database.transaction([INBOX_STORE, MUTATION_STORE], "readwrite");
  const done = transactionDone(transaction);
  const inboxStore = transaction.objectStore(INBOX_STORE);
  const current = await requestResult(inboxStore.get(id) as IDBRequest<InboxItem | undefined>);
  if (!current) { transaction.abort(); database.close(); return; }
  inboxStore.delete(id);
  transaction.objectStore(MUTATION_STORE).put(newMutation({ operation: "delete", payload: {}, localId: id, serverId: id > 0 ? id : null, baseUpdatedAt: id > 0 ? current.updatedAt : null }));
  await done;
  database.close();
  await updatePendingCount();
}

async function probeEvaOrbit() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch("/api/sync/status", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function replaceRemoteInbox(remoteItems: InboxItem[]) {
  const database = await openDatabase();
  const transaction = database.transaction([INBOX_STORE, MUTATION_STORE], "readwrite");
  const done = transactionDone(transaction);
  const inboxStore = transaction.objectStore(INBOX_STORE);
  const mutationStore = transaction.objectStore(MUTATION_STORE);
  const [localItems, mutations] = await Promise.all([
    requestResult(inboxStore.getAll() as IDBRequest<InboxItem[]>),
    requestResult(mutationStore.getAll() as IDBRequest<PendingInboxMutation[]>),
  ]);
  const protectedIds = new Set<number>();
  mutations.forEach((mutation) => { protectedIds.add(mutation.localId); if (mutation.serverId) protectedIds.add(mutation.serverId); });
  inboxStore.clear();
  for (const item of remoteItems) {
    const local = localItems.find((candidate) => candidate.id === item.id);
    if (!protectedIds.has(item.id)) inboxStore.put(item);
    else if (local) inboxStore.put(local);
  }
  for (const item of localItems) if (item.id < 0) inboxStore.put(item);
  await done;
  database.close();
}

async function refreshRemoteInbox() {
  const response = await fetch("/api/inbox?status=all", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(`Inbox refresh failed (${response.status})`);
  await replaceRemoteInbox(await response.json() as InboxItem[]);
}

class SyncResponseError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function responseError(response: Response) {
  let message = `Sync failed (${response.status})`;
  try { const body = await response.json() as { error?: string }; if (body.error) message = body.error; } catch { /* response has no JSON body */ }
  return new SyncResponseError(response.status, message);
}

async function nextMutation(force: boolean) {
  const database = await openDatabase();
  const transaction = database.transaction(MUTATION_STORE, "readonly");
  const mutations = await requestResult(transaction.objectStore(MUTATION_STORE).getAll() as IDBRequest<PendingInboxMutation[]>);
  database.close();
  const now = new Date().toISOString();
  return mutations
    .filter((mutation) => mutation.state !== "conflict" && (force || mutation.nextRetryAt <= now))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null;
}

async function resolveServerId(database: IDBDatabase, mutation: PendingInboxMutation) {
  if (mutation.serverId) return mutation.serverId;
  if (mutation.localId > 0) return mutation.localId;
  const transaction = database.transaction(MAPPING_STORE, "readonly");
  const mapping = await requestResult(transaction.objectStore(MAPPING_STORE).get(mutation.localId) as IDBRequest<{ localId: number; serverId: number } | undefined>);
  return mapping?.serverId ?? null;
}

async function executeMutation(mutation: PendingInboxMutation) {
  if (mutation.operation === "create") {
    const response = await fetch("/api/inbox", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-EvaOrbit-Mutation-Id": mutation.id }, body: JSON.stringify(mutation.payload) });
    if (!response.ok) throw await responseError(response);
    return await response.json() as InboxItem;
  }
  if (mutation.operation === "action") throw new Error("Inbox action mutations are not implemented in this phase");
  const database = await openDatabase();
  const serverId = await resolveServerId(database, mutation);
  database.close();
  if (!serverId) throw new Error("Inbox mutation is waiting for its server ID");
  const headers: Record<string, string> = { "X-EvaOrbit-Mutation-Id": mutation.id };
  if (mutation.operation === "update") headers["Content-Type"] = "application/json";
  if (mutation.operation === "update" && mutation.baseUpdatedAt) headers["X-EvaOrbit-Base-Updated-At"] = mutation.baseUpdatedAt;
  const response = await fetch(`/api/inbox/${serverId}`, { method: mutation.operation === "update" ? "PATCH" : "DELETE", credentials: "same-origin", headers, body: mutation.operation === "update" ? JSON.stringify(mutation.payload) : undefined });
  if (mutation.operation === "delete" && response.status === 404) return null;
  if (!response.ok) throw await responseError(response);
  return mutation.operation === "update" ? await response.json() as InboxItem : null;
}

async function completeMutation(mutation: PendingInboxMutation, serverItem: InboxItem | null) {
  const database = await openDatabase();
  const stores = [INBOX_STORE, MUTATION_STORE, MAPPING_STORE];
  const transaction = database.transaction(stores, "readwrite");
  const done = transactionDone(transaction);
  const inboxStore = transaction.objectStore(INBOX_STORE);
  const mutationStore = transaction.objectStore(MUTATION_STORE);
  const allMutations = await requestResult(mutationStore.getAll() as IDBRequest<PendingInboxMutation[]>);
  const later = allMutations.filter((candidate) => candidate.id !== mutation.id && candidate.localId === mutation.localId);
  if (mutation.operation === "create" && serverItem) {
    const optimistic = await requestResult(inboxStore.get(mutation.localId) as IDBRequest<InboxItem | undefined>);
    inboxStore.delete(mutation.localId);
    if (!later.some((candidate) => candidate.operation === "delete")) inboxStore.put(optimistic ? { ...serverItem, ...optimistic, id: serverItem.id, createdAt: serverItem.createdAt } : serverItem);
    transaction.objectStore(MAPPING_STORE).put({ localId: mutation.localId, serverId: serverItem.id });
    later.forEach((candidate) => mutationStore.put({ ...candidate, localId: serverItem.id, serverId: serverItem.id, baseUpdatedAt: serverItem.updatedAt }));
  } else if (mutation.operation === "update" && serverItem) {
    const optimistic = await requestResult(inboxStore.get(serverItem.id) as IDBRequest<InboxItem | undefined>);
    if (!later.some((candidate) => candidate.operation === "delete")) inboxStore.put(later.length && optimistic ? { ...serverItem, ...optimistic, id: serverItem.id, createdAt: serverItem.createdAt } : serverItem);
    later.forEach((candidate) => mutationStore.put({ ...candidate, serverId: serverItem.id, baseUpdatedAt: serverItem.updatedAt }));
  } else if (mutation.operation === "delete") {
    inboxStore.delete(mutation.localId);
    if (mutation.serverId) inboxStore.delete(mutation.serverId);
  }
  mutationStore.delete(mutation.id);
  await done;
  database.close();
}

async function failMutation(mutation: PendingInboxMutation, error: unknown) {
  const database = await openDatabase();
  const transaction = database.transaction(MUTATION_STORE, "readwrite");
  const done = transactionDone(transaction);
  const attempts = mutation.attempts + 1;
  const conflict = error instanceof SyncResponseError && error.status === 409;
  transaction.objectStore(MUTATION_STORE).put({ ...mutation, attempts, state: conflict ? "conflict" : "failed", lastError: error instanceof Error ? error.message : String(error), nextRetryAt: new Date(Date.now() + retryDelayMs(attempts)).toISOString() });
  await done;
  database.close();
  return conflict;
}

async function runSync(force: boolean) {
  publish({ mode: "checking", error: null });
  if (!await probeEvaOrbit()) { publish({ mode: "offline", error: null }); await updatePendingCount(); return; }
  publish({ mode: "syncing", error: null });
  while (true) {
    const mutation = await nextMutation(force);
    if (!mutation) break;
    try {
      await completeMutation(mutation, await executeMutation(mutation));
    } catch (error) {
      const conflict = await failMutation(mutation, error);
      publish({ mode: conflict ? "conflict" : "failed", error: error instanceof Error ? error.message : String(error) });
      await updatePendingCount();
      return;
    }
  }
  try {
    await refreshRemoteInbox();
    const pending = await updatePendingCount();
    publish({ mode: pending.hasConflict ? "conflict" : "online", error: pending.hasConflict ? "A local Inbox change conflicts with the server version." : null });
  } catch (error) {
    publish({ mode: "failed", error: error instanceof Error ? error.message : String(error) });
  }
}

export function syncLocalInbox(force = false) {
  if (activeSync) return activeSync;
  activeSync = runSync(force).finally(() => { activeSync = null; });
  return activeSync;
}
