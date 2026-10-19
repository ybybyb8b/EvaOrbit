import {buildChronicleSnapshot,validateChronicleSnapshot,type ChronicleReadonlySnapshot} from "../lib/chronicle-readonly";
import {validateSubscriptionsSnapshot,type SubscriptionsReadonlySnapshot} from "../lib/subscriptions-readonly";
import {validateCatsSnapshot,type CatsReadonlySnapshot} from "../lib/cats-readonly";
import type { TrackerLocalState, TrackerStorage } from "../lib/tracker-local-store";
import type { TrackerSyncRequest, TrackerSyncResponse } from "../lib/tracker-local-contract";
import { nativeCall } from "../lib/native-bridge";
import { responseError } from "../lib/response-error";
import { fetchReadonlyTrackers, readonlyTrackerState, type TrackerReadonlySnapshot } from "../lib/tracker-readonly";
import { homeResourceKey, validateHomeResource, type HomeReadonlyResource, type HomeResourceKind } from "../lib/home-readonly";
import { previewHomeResource } from "../lib/home-preview";

import {validateFoodSnapshot,type FoodReadonlySnapshot} from "../lib/food-readonly";
import {foodResourceKey,validateFoodResource,type FoodReadonlyResource,type FoodResourceKind} from "../lib/food-readonly-resource";

export type LocalAccount = { accountId: string; email: string };
export type TrackerPlatform = {
  chronicleSnapshot(account:LocalAccount,refresh?:boolean):Promise<ChronicleReadonlySnapshot|null>;
  subscriptionsSnapshot(account:LocalAccount,refresh?:boolean):Promise<SubscriptionsReadonlySnapshot|null>;
  catsSnapshot(account:LocalAccount,refresh?:boolean):Promise<CatsReadonlySnapshot|null>;
  foodSnapshot(account:LocalAccount,refresh?:boolean):Promise<FoodReadonlySnapshot|null>;
  foodResource(account:LocalAccount,kind:FoodResourceKind,key:string,refresh?:boolean):Promise<FoodReadonlyResource|null>;
  native: boolean;
  account(): Promise<LocalAccount | null>;
  signIn(email: string, password: string): Promise<LocalAccount>;
  signOut(): Promise<void>;
  storage(account: LocalAccount): TrackerStorage;
  sync(request: TrackerSyncRequest): Promise<TrackerSyncResponse>;
  readOnly(account: LocalAccount): boolean;
  refreshReadonly(account: LocalAccount): Promise<void>;
  inspection(account: LocalAccount): Promise<{ pending: number; frozen: number; sqliteVerified?: boolean; backupFile?: string }>;
  homeResource(account: LocalAccount, kind: HomeResourceKind, key: string, refresh?: boolean): Promise<HomeReadonlyResource | null>;
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

async function homeResource(account: LocalAccount, native: boolean, kind: HomeResourceKind, key: string, refresh=false): Promise<HomeReadonlyResource | null> {
  const latest = kind === "day" && key === "latest" && !refresh;
  if (!latest) homeResourceKey({kind,key});
  if (!native && isPreviewAccount(account)) return previewHomeResource(account.accountId,kind,key);
  const cacheKey = `home:${account.accountId}:${kind}:${key}`;
  let value: HomeReadonlyResource | null;
  if (native) {
    const info = await nativeCall<{methods?:string[]}>("host.getInfo");
    if (!info.methods?.includes("home.readOnlyResource")) throw new Error("Install the new development Host to open Home offline. Tracker data is preserved.");
    value = await nativeCall<HomeReadonlyResource | null>("home.readOnlyResource",{accountId:account.accountId,kind,key,refresh});
  } else {
    if ((await read<LocalAccount>("session","current"))?.accountId !== account.accountId) throw new Error("Home account changed");
    if (!refresh) {
      if (latest) {
        const db=await localDatabase(),prefix=`home:${account.accountId}:day:`;
        const keys=await new Promise<IDBValidKey[]>((resolve,reject)=>{const request=db.transaction("states").objectStore("states").getAllKeys(IDBKeyRange.bound(prefix,prefix+"\uffff"));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        value=keys.length?await read<HomeReadonlyResource>("states",String(keys.at(-1))):null;
      } else value=await read<HomeReadonlyResource>("states",cacheKey);
    } else {
      const identity=await api<{authenticated:boolean;accountId:string}>("session","GET");
      if (!identity.authenticated||identity.accountId!==account.accountId) throw new Error("Home account changed");
      const response=await fetch(`/eo-api/home-readonly/${kind}/${key}`,{method:"GET",credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(20000)});
      if(response.status===404)throw new Error("The Home read-only API is not deployed. Cached data is preserved.");
      if(!response.ok)throw new Error(await responseError(response,"Could not load Home. Cached data is preserved."));
      value=validateHomeResource(await response.json(),account.accountId,kind,key);
      const finalIdentity=await api<{authenticated:boolean;accountId:string}>("session","GET");
      if(!finalIdentity.authenticated||finalIdentity.accountId!==account.accountId||(await read<LocalAccount>("session","current"))?.accountId!==account.accountId)throw new Error("Home account changed during refresh");
      await saveHomeResource(cacheKey,value);
    }
  }
  return value?validateHomeResource(value,account.accountId,kind,latest?value.key:key):null;
}
async function saveHomeResource(key:string,value:HomeReadonlyResource){
  if(new TextEncoder().encode(JSON.stringify(value)).length>4*1024*1024)throw new Error("Home snapshot exceeds the cache limit");
  const db=await localDatabase(),prefix=`home:${value.accountId}:`;
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction("states","readwrite"),store=tx.objectStore("states");store.put(value,key);
    const cursor=store.openCursor(IDBKeyRange.bound(prefix,prefix+"\uffff")),entries:Array<{key:IDBValidKey;size:number;time:string}>=[];
    cursor.onsuccess=()=>{const row=cursor.result;if(row){entries.push({key:row.key,size:new TextEncoder().encode(JSON.stringify(row.value)).length,time:row.value.capturedAt});row.continue();}else{let bytes=0,count=0;entries.sort((a,b)=>a.key===key?-1:b.key===key?1:b.time.localeCompare(a.time)).forEach(row=>{bytes+=row.size;count++;if(count>128||bytes>64*1024*1024)store.delete(row.key);});}};
    tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(new Error("Could not save Home snapshot"));
  });
}
async function requireReadonlyHost() {
  const info = await nativeCall<{ methods?: string[] }>("host.getInfo");
  if (!info.methods?.includes("trackers.readOnlySnapshot") || !info.methods.includes("trackers.acceptanceStatus")) throw new Error("请安装支持只读验收保护的新版开发 Host；未调用旧版同步接口");
}

async function foodSnapshot(account:LocalAccount,native:boolean,refresh:boolean):Promise<FoodReadonlySnapshot|null>{
  if(native){
    const info=await nativeCall<{methods?:string[]}>("host.getInfo");
    if(!info.methods?.includes("food.readOnlySnapshot"))throw new Error("Install the updated development Host to open Food & Drink. Existing data is preserved.");
    const value=await nativeCall<FoodReadonlySnapshot|null>("food.readOnlySnapshot",{accountId:account.accountId,refresh});
    return value?validateFoodSnapshot(value,account.accountId):null;
  }
  if((await read<LocalAccount>("session","current"))?.accountId!==account.accountId)throw new Error("Food & Drink account changed");
  const key="food-readonly:"+account.accountId;
  if(!refresh)return read<FoodReadonlySnapshot>("states",key).then(value=>value?validateFoodSnapshot(value,account.accountId):null);
  if(isPreviewAccount(account))return null;
  const identity=await api<{authenticated:boolean;accountId:string}>("session","GET");
  if(!identity.authenticated||identity.accountId!==account.accountId)throw new Error("Food & Drink account changed");
  const response=await fetch("/eo-api/food-readonly",{method:"GET",credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(response.status===404)throw new Error("The Food & Drink read-only API is not deployed. Cached data is preserved.");
  if(!response.ok)throw new Error(await responseError(response,"Could not refresh Food & Drink. Cached data is preserved."));
  const snapshot=validateFoodSnapshot(await response.json(),account.accountId);
  const finalIdentity=await api<{authenticated:boolean;accountId:string}>("session","GET");
  if(!finalIdentity.authenticated||finalIdentity.accountId!==account.accountId)throw new Error("Food & Drink account changed during refresh");
  const db=await localDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(["session","states"],"readwrite"),request=tx.objectStore("session").get("current");
    request.onsuccess=()=>{if(request.result?.accountId!==account.accountId){tx.abort();return;}tx.objectStore("states").put(snapshot,key);};
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error("Food & Drink snapshot was not saved. Existing data is preserved."));
  });
  return snapshot;
}

async function catsSnapshot(account:LocalAccount,native:boolean,refresh:boolean):Promise<CatsReadonlySnapshot|null>{
  if(native){
    const info=await nativeCall<{methods?:string[]}>("host.getInfo");
    if(!info.methods?.includes("cats.readOnlySnapshot"))throw new Error("Install the updated development Host to open Cats. Existing data is preserved.");
    const value=await nativeCall<CatsReadonlySnapshot|null>("cats.readOnlySnapshot",{accountId:account.accountId,refresh});
    return value?validateCatsSnapshot(value,account.accountId):null;
  }
  if((await read<LocalAccount>("session","current"))?.accountId!==account.accountId)throw new Error("Cats account changed");
  const key="cats-readonly:"+account.accountId;
  if(!refresh)return read<CatsReadonlySnapshot>("states",key).then(value=>value?validateCatsSnapshot(value,account.accountId):null);
  if(isPreviewAccount(account))return null;
  const identity=await api<{authenticated:boolean;accountId:string}>("session","GET");
  if(!identity.authenticated||identity.accountId!==account.accountId)throw new Error("Cats account changed");
  const response=await fetch("/eo-api/cats-readonly",{method:"GET",credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(response.status===404)throw new Error("The Cats read-only API is not deployed. Cached data is preserved.");
  if(!response.ok)throw new Error(await responseError(response,"Could not refresh Cats. Cached data is preserved."));
  const snapshot=validateCatsSnapshot(await response.json(),account.accountId);
  const finalIdentity=await api<{authenticated:boolean;accountId:string}>("session","GET");
  if(!finalIdentity.authenticated||finalIdentity.accountId!==account.accountId)throw new Error("Cats account changed during refresh");
  const db=await localDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(["session","states"],"readwrite"),request=tx.objectStore("session").get("current");
    request.onsuccess=()=>{if(request.result?.accountId!==account.accountId){tx.abort();return;}tx.objectStore("states").put(snapshot,key);};
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error("Cats snapshot was not saved. Existing data is preserved."));
  });
  return snapshot;
}

async function subscriptionsSnapshot(account:LocalAccount,native:boolean,refresh:boolean):Promise<SubscriptionsReadonlySnapshot|null>{
  if(native){
    const info=await nativeCall<{methods?:string[]}>("host.getInfo");
    if(!info.methods?.includes("subscriptions.readOnlySnapshot"))throw new Error("Install the updated development Host to open Subscriptions. Existing data is preserved.");
    const value=await nativeCall<SubscriptionsReadonlySnapshot|null>("subscriptions.readOnlySnapshot",{accountId:account.accountId,refresh});
    return value?validateSubscriptionsSnapshot(value,account.accountId):null;
  }
  if((await read<LocalAccount>("session","current"))?.accountId!==account.accountId)throw new Error("Subscriptions account changed");
  const key="subscriptions-readonly:"+account.accountId;
  if(!refresh)return read<SubscriptionsReadonlySnapshot>("states",key).then(value=>value?validateSubscriptionsSnapshot(value,account.accountId):null);
  if(isPreviewAccount(account))return null;
  const identity=await api<{authenticated:boolean;accountId:string}>("session","GET");
  if(!identity.authenticated||identity.accountId!==account.accountId)throw new Error("Subscriptions account changed");
  const response=await fetch("/eo-api/subscriptions-readonly",{method:"GET",credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(response.status===404)throw new Error("The Subscriptions read-only API is not deployed. Cached data is preserved.");
  if(!response.ok)throw new Error(await responseError(response,"Could not refresh Subscriptions. Cached data is preserved."));
  const snapshot=validateSubscriptionsSnapshot(await response.json(),account.accountId);
  const finalIdentity=await api<{authenticated:boolean;accountId:string}>("session","GET");
  if(!finalIdentity.authenticated||finalIdentity.accountId!==account.accountId)throw new Error("Subscriptions account changed during refresh");
  const db=await localDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(["session","states"],"readwrite"),request=tx.objectStore("session").get("current");
    request.onsuccess=()=>{if(request.result?.accountId!==account.accountId){tx.abort();return;}tx.objectStore("states").put(snapshot,key);};
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error("Subscriptions snapshot was not saved. Existing data is preserved."));
  });
  return snapshot;
}

async function chronicleSnapshot(account:LocalAccount,native:boolean,refresh:boolean):Promise<ChronicleReadonlySnapshot|null>{
  if(native){
    const info=await nativeCall<{methods?:string[]}>("host.getInfo");
    if(!info.methods?.includes("chronicle.readOnlySnapshot"))throw new Error("Install the updated development Host to open Chronicle. Existing data is preserved.");
    const value=await nativeCall<ChronicleReadonlySnapshot|null>("chronicle.readOnlySnapshot",{accountId:account.accountId,refresh});
    return value?validateChronicleSnapshot(value,account.accountId):null;
  }
  if((await read<LocalAccount>("session","current"))?.accountId!==account.accountId)throw new Error("Chronicle account changed");
  const key="chronicle-readonly:"+account.accountId;
  if(!refresh)return read<ChronicleReadonlySnapshot>("states",key).then(value=>value?validateChronicleSnapshot(value,account.accountId):null);
  if(isPreviewAccount(account))return null;
  const identity=await api<{authenticated:boolean;accountId:string}>("session","GET");
  if(!identity.authenticated||identity.accountId!==account.accountId)throw new Error("Chronicle account changed");
  const response=await fetch("/eo-api/chronicle",{method:"GET",credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(response.status===404)throw new Error("The Chronicle read-only API is not deployed. Cached data is preserved.");
  if(!response.ok)throw new Error(await responseError(response,"Could not refresh Chronicle. Cached data is preserved."));
  const snapshot=buildChronicleSnapshot(account.accountId,await response.json());
  const finalIdentity=await api<{authenticated:boolean;accountId:string}>("session","GET");
  if(!finalIdentity.authenticated||finalIdentity.accountId!==account.accountId)throw new Error("Chronicle account changed during refresh");
  const db=await localDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(["session","states"],"readwrite"),request=tx.objectStore("session").get("current");
    request.onsuccess=()=>{if(request.result?.accountId!==account.accountId){tx.abort();return;}tx.objectStore("states").put(snapshot,key);};
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error("Chronicle snapshot was not saved. Existing data is preserved."));
  });
  return snapshot;
}

async function foodResource(account:LocalAccount,native:boolean,kind:FoodResourceKind,key:string,refresh=false):Promise<FoodReadonlyResource|null>{
  foodResourceKey(kind,key);
  if(native){
    const info=await nativeCall<{methods?:string[]}>("host.getInfo");
    if(!info.methods?.includes("food.readOnlyResource"))throw new Error("Install the updated development Host to open Places and Library offline. Existing data is preserved.");
    const value=await nativeCall<FoodReadonlyResource|null>("food.readOnlyResource",{accountId:account.accountId,kind,key,refresh});
    return value?validateFoodResource(value,account.accountId,kind,key):null;
  }
  if((await read<LocalAccount>("session","current"))?.accountId!==account.accountId)throw new Error("Food account changed");
  const prefix=`food-resource:${account.accountId}:`,cacheKey=prefix+kind+":"+key;
  if(!refresh){const value=await read<FoodReadonlyResource>("states",cacheKey);return value?validateFoodResource(value,account.accountId,kind,key):null;}
  if(isPreviewAccount(account))return null;
  const identity=await api<{authenticated:boolean;accountId:string}>("session","GET");
  if(!identity.authenticated||identity.accountId!==account.accountId)throw new Error("Food account changed");
  const response=await fetch(`/eo-api/food-readonly/${kind}/${key}`,{method:"GET",credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(response.status===404)throw new Error("The Places and Library read-only API is not deployed. Cached data is preserved.");
  if(!response.ok)throw new Error(await responseError(response,"Could not download Food resources. Cached data is preserved."));
  const value=validateFoodResource(await response.json(),account.accountId,kind,key);
  const finalIdentity=await api<{authenticated:boolean;accountId:string}>("session","GET");
  if(!finalIdentity.authenticated||finalIdentity.accountId!==account.accountId)throw new Error("Food account changed during refresh");
  const db=await localDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(["session","states"],"readwrite"),store=tx.objectStore("states"),identity=tx.objectStore("session").get("current");
    identity.onsuccess=()=>{
      if(identity.result?.accountId!==account.accountId){tx.abort();return;}
      store.put(value,cacheKey);
      const entries:Array<{key:IDBValidKey;time:string}>=[],cursor=store.openCursor(IDBKeyRange.bound(prefix,prefix+"\uffff"));
      cursor.onsuccess=()=>{const row=cursor.result;if(row){if(row.key!==prefix+"catalog:current")entries.push({key:row.key,time:row.value.capturedAt});row.continue();}else entries.sort((a,b)=>b.time.localeCompare(a.time)).slice(63).forEach(row=>store.delete(row.key));};
    };
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error("Food resource was not saved. Existing data is preserved."));
  });
  return value;
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
    foodSnapshot:(account,refresh=false)=>foodSnapshot(account,native,refresh),
    catsSnapshot:(account,refresh=false)=>catsSnapshot(account,native,refresh),
    chronicleSnapshot:(account,refresh=false)=>chronicleSnapshot(account,native,refresh),
    subscriptionsSnapshot:(account,refresh=false)=>subscriptionsSnapshot(account,native,refresh),
    foodResource:(account,kind,key,refresh)=>foodResource(account,native,kind,key,refresh),
    homeResource: (account,kind,key,refresh) => homeResource(account,true,kind,key,refresh),
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
    foodSnapshot:(account,refresh=false)=>foodSnapshot(account,native,refresh),
    catsSnapshot:(account,refresh=false)=>catsSnapshot(account,native,refresh),
    chronicleSnapshot:(account,refresh=false)=>chronicleSnapshot(account,native,refresh),
    subscriptionsSnapshot:(account,refresh=false)=>subscriptionsSnapshot(account,native,refresh),
    foodResource:(account,kind,key,refresh)=>foodResource(account,native,kind,key,refresh),
    homeResource: (account,kind,key,refresh) => homeResource(account,false,kind,key,refresh),
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
      }, { previous: await read<TrackerReadonlySnapshot>("states", "readonly:" + account.accountId), load: async id => {
        const response = await fetch(`/eo-api/trackers/${id}/icon`, { method: "GET", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (response.status === 404 || response.status === 410) return null;
        if (!response.ok) throw new Error("Could not load Tracker icon");
        const blob = await response.blob();
        if (blob.size > 4 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(blob.type)) throw new Error("Invalid Tracker icon");
        return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read Tracker icon")); reader.readAsDataURL(blob); });
      } });
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
