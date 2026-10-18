import type { TrackerLocalState, TrackerStorage } from "../lib/tracker-local-store";
import type { TrackerSyncRequest, TrackerSyncResponse } from "../lib/tracker-local-contract";
import { nativeCall } from "../lib/native-bridge";
import { responseError } from "../lib/response-error";
import { fetchReadonlyTrackers, readonlyTrackerState, type TrackerReadonlySnapshot } from "../lib/tracker-readonly";

export type LocalAccount = { accountId: string; email: string };
export type TrackerPlatform = {
  native: boolean;
  account(): Promise<LocalAccount | null>;
  signIn(email: string, password: string): Promise<LocalAccount>;
  signOut(): Promise<void>;
  storage(account: LocalAccount): TrackerStorage;
  sync(request: TrackerSyncRequest): Promise<TrackerSyncResponse>;
  readOnly(account: LocalAccount): boolean;
  refreshReadonly(account: LocalAccount): Promise<void>;
  inspection(account: LocalAccount): Promise<{ pending: number; frozen: number; sqliteVerified?: boolean; backupFile?: string }>;
};

let database: Promise<IDBDatabase> | undefined;
function localDatabase() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("eo-tracker-local-v1", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("states"); request.result.createObjectStore("session"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开本地数据库，记录尚未保存"));
    request.onblocked = () => reject(new Error("请关闭其他 Tracker 窗口后重试"));
  });
}
async function read<T>(store: string, key: string): Promise<T | null> {
  const db = await localDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readonly");
    const request = transaction.objectStore(store).get(key);
    transaction.oncomplete = () => resolve(request.result ?? null);
    transaction.onabort = transaction.onerror = () => reject(new Error("无法读取本地数据"));
  });
}
async function saveAccount(account: LocalAccount | null) {
  const db = await localDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("session", "readwrite");
    if (account) tx.objectStore("session").put(account, "current"); else tx.objectStore("session").delete("current");
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new Error("无法保存本机会话"));
  });
}
async function saveReadonly(snapshot: TrackerReadonlySnapshot) {
  readonlyTrackerState(snapshot, snapshot.accountId);
  const db = await localDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("states", "readwrite");
    tx.objectStore("states").put(snapshot, "readonly:" + snapshot.accountId);
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error("只读快照保存失败，原有数据已保留"));
  });
}
function denyWrite(): never { throw new Error("当前为真实数据只读验收，写入和旧队列上传已停用"); }
async function requireReadonlyHost() {
  const info = await nativeCall<{ methods?: string[] }>("host.getInfo");
  if (!info.methods?.includes("trackers.readOnlySnapshot") || !info.methods.includes("trackers.acceptanceStatus")) throw new Error("请安装支持只读验收保护的新版开发 Host；未调用旧版同步接口");
}
export function browserTrackerStorage(accountId: string): TrackerStorage {
  return {
    read: () => read<TrackerLocalState>("states", accountId),
    async commit(expectedRevision, next) {
      const db = await localDatabase();
      return new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction("states", "readwrite");
        const store = tx.objectStore("states");
        const request = store.get(accountId);
        let applied = false;
        request.onsuccess = () => {
          if ((request.result?.revision ?? 0) === expectedRevision && next.accountId === accountId) { store.put(next, accountId); applied = true; }
        };
        tx.oncomplete = () => resolve(applied); tx.onabort = tx.onerror = () => reject(new Error("本地保存失败，请检查设备存储空间"));
      });
    },
  };
}

async function api<T>(path: "session" | "sync", method: string, body?: unknown): Promise<T> {
  // Session auth uses the existing API; Tracker GETs have a separate allowlist.
  // No cloud credentials or service-role key are bundled into the React app.
  const response = await fetch(`/eo-api/${path}`, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(await responseError(response, "同步失败，本地记录已保留"));
  return response.status === 204 ? undefined as T : response.json();
}

export function trackerPlatform(): TrackerPlatform {
  const native = Boolean(window.EvaOrbitNative);
  if (native) return {
    native,
    account: () => nativeCall<LocalAccount | null>("trackers.getSession"),
    signIn: (email, password) => nativeCall<LocalAccount>("trackers.signIn", { email, password }),
    signOut: () => nativeCall<void>("trackers.signOut"),
    storage: account => ({
      async read() { await requireReadonlyHost(); const snapshot = await nativeCall<TrackerReadonlySnapshot | null>("trackers.readOnlySnapshot", { accountId: account.accountId, refresh: false }); return snapshot ? readonlyTrackerState(snapshot, account.accountId) : null; },
      commit: async () => denyWrite(),
    }),
    sync: async () => denyWrite(),
    readOnly: () => true,
    async refreshReadonly(account) { await requireReadonlyHost(); const snapshot = await nativeCall<TrackerReadonlySnapshot>("trackers.readOnlySnapshot", { accountId: account.accountId, refresh: true }); readonlyTrackerState(snapshot, account.accountId); },
    async inspection(account) { await requireReadonlyHost(); return nativeCall("trackers.acceptanceStatus", { accountId: account.accountId }); },
  };
  return {
    native,
    account: () => read<LocalAccount>("session", "current"),
    async signIn(email, password) {
      const result = await api<LocalAccount & { authenticated: boolean }>("session", "POST", { email, password });
      if (!result.authenticated || !result.accountId || !result.email) throw new Error("登录响应无效");
      const account = { accountId: result.accountId, email: result.email };
      await saveAccount(account); return account;
    },
    async signOut() { await saveAccount(null); await api("session", "DELETE").catch(() => undefined); },
    storage: account => isPreviewAccount(account) ? browserTrackerStorage(account.accountId) : ({
      async read() { const snapshot = await read<TrackerReadonlySnapshot>("states", "readonly:" + account.accountId); return snapshot ? readonlyTrackerState(snapshot, account.accountId) : null; },
      commit: async () => denyWrite(),
    }),
    sync: async () => denyWrite(),
    readOnly: account => !isPreviewAccount(account),
    async refreshReadonly(account) {
      if (isPreviewAccount(account)) return;
      const snapshot = await fetchReadonlyTrackers(account.accountId, async path => {
        if (path === "session") return api("session", "GET");
        if (!/^trackers(?:\/[1-9][0-9]*)?$/.test(path)) throw new Error("只读请求路径不正确");
        const response = await fetch("/eo-api/" + path, { method: "GET", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(await responseError(response, "暂时无法读取云端记录，上次只读快照已保留"));
        return response.json();
      });
      await saveReadonly(snapshot);
    },
    async inspection(account) { const original = await read<TrackerLocalState>("states", account.accountId); return { pending: original?.outbox.length ?? 0, frozen: original?.outbox.filter(item => item.wire).length ?? 0 }; },
  };
}

export async function startBrowserPreview(): Promise<LocalAccount> {
  const account = { accountId: "00000000-0000-4000-8000-000000000001", email: "本机预览（不上传）" };
  await saveAccount(account); return account;
}
export const isPreviewAccount = (account: LocalAccount) => account.accountId === "00000000-0000-4000-8000-000000000001";
