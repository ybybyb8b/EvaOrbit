// Private, account-scoped Home snapshots. No service-worker/API response caching.
type Snapshot<T> = { data: T; savedAt: number; revision: string };
const memory = new Map<string, Snapshot<unknown>>();
const revisionKey = "eo:home-revision";
export const homeCacheChanged = "eo:home-cache-changed";
let fallbackRevision = "0";
let storageUnavailable = false;

function revision() {
  if (storageUnavailable) return fallbackRevision;
  try { return localStorage.getItem(revisionKey) ?? fallbackRevision; } catch { storageUnavailable = true; return fallbackRevision; }
}

async function database() {
  if (storageUnavailable) throw new Error("Persistent cache requires a shared invalidation marker");
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("eo-home-v1", 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots");
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error("Home cache is blocked")); };
  });
}

async function stored<T>(key: string): Promise<Snapshot<T> | undefined> {
  try {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("snapshots").objectStore("snapshots").get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  } catch { return undefined; } // Private browsing/storage denial must not break Home.
}

export async function getClientSnapshot<T>(scope: string, url: string): Promise<Snapshot<T> | undefined> {
  return (memory.get(JSON.stringify([scope, url])) ?? await stored<T>(JSON.stringify([scope, url]))) as Snapshot<T> | undefined;
}

export async function saveHomeSnapshot<T>(scope: string, url: string, data: T, expectedRevision = revision()) {
  if (expectedRevision !== revision()) return;
  return putClientSnapshot(scope, url, { data, savedAt: Date.now(), revision: expectedRevision }, () => expectedRevision === revision());
}

export async function putClientSnapshot<T>(scope: string, url: string, snapshot: Snapshot<T>, current = () => true) {
  if (!current()) return;
  if (JSON.stringify(snapshot.data).length > 1_000_000) return;
  const key = JSON.stringify([scope, url]);
  memory.delete(key); memory.set(key, snapshot);
  if (memory.size > 250) memory.delete(memory.keys().next().value!);
  try {
    const db = await database();
    try {
      if (!current()) return;
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("snapshots", "readwrite"), store = transaction.objectStore("snapshots");
        store.put(snapshot, key);
        // Bound storage by age, including snapshots from previous accounts.
        const cursor = store.openCursor();
        const retained: Array<{ key: IDBValidKey; savedAt: number }> = [];
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) {
            retained.sort((a, b) => b.savedAt - a.savedAt).slice(250).forEach(entry => store.delete(entry.key));
            return;
          }
          if (Date.now() - item.value.savedAt > 7 * 86400000) item.delete();
          else retained.push({ key: item.key, savedAt: item.value.savedAt });
          item.continue();
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  } catch { /* Memory remains usable when persistent storage is unavailable. */ }
}

export async function clearPrivateSnapshots() {
  memory.clear();
  try {
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("snapshots", "readwrite");
        transaction.objectStore("snapshots").clear();
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  } catch { /* Storage may be unavailable. */ }
}

export function invalidateHomeCache() {
  fallbackRevision = `${Date.now()}-${Math.random()}`;
  try { localStorage.setItem(revisionKey, fallbackRevision); } catch { storageUnavailable = true; }
  window.dispatchEvent(new Event(homeCacheChanged));
}

export async function readHomeSnapshot<T>(scope: string, url: string, signal: AbortSignal, onCached: (data: T) => void, force = false): Promise<T> {
  const expectedRevision = revision(), key = JSON.stringify([scope, url]);
  const snapshot = (memory.get(key) ?? await stored<T>(key)) as Snapshot<T> | undefined;
  signal.throwIfAborted();
  if (expectedRevision !== revision()) throw new DOMException("Home data changed", "AbortError");
  const usable = snapshot && snapshot.revision === expectedRevision && snapshot.savedAt > Date.now() - 7 * 86400000 && snapshot.data && typeof snapshot.data === "object";
  if (usable) {
    memory.set(key, snapshot);
    onCached(snapshot.data);
    if (!force && snapshot.savedAt > Date.now() - 60000) return snapshot.data;
  }
  try {
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Could not load Home");
    const data = await response.json() as T;
    signal.throwIfAborted();
    if (expectedRevision !== revision()) throw new DOMException("Home data changed", "AbortError");
    await saveHomeSnapshot(scope, url, data, expectedRevision);
    signal.throwIfAborted();
    if (expectedRevision !== revision()) throw new DOMException("Home data changed", "AbortError");
    return data;
  } catch (error) {
    if (usable && !signal.aborted && expectedRevision === revision()) return snapshot.data;
    throw error;
  }
}
