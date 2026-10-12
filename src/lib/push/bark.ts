import type { EvaPushPayload } from "./types.ts";

export type BarkSettings = { enabled: boolean; ciphertext: string; iv: string; authTag: string };
export type BarkStatus = { configured: boolean; enabled: boolean };

export function barkDeviceKey(value: unknown) {
  if(typeof value!=="string"||value.length>2048)throw new Error("请粘贴 Bark 的推送地址");
  let url: URL;
  try { url=new URL(value.trim()); } catch { throw new Error("Bark 地址格式不正确"); }
  const key=url.pathname.split("/")[1];
  if(url.origin!=="https://api.day.app"||url.username||url.password||!key||!/^[A-Za-z0-9_-]{8,200}$/.test(key))throw new Error("目前支持 https://api.day.app/ 开头的官方 Bark 地址");
  return key;
}

export function barkPayload(key: string, payload: EvaPushPayload) {
  if(!payload.url.startsWith("/")||payload.url.startsWith("//"))throw new Error("Notification link must be an EO path");
  const url = new URL(payload.url,"https://eva-orbit.vercel.app");
  if (url.origin !== "https://eva-orbit.vercel.app") throw new Error("Notification link must stay within EO");
  return { device_key:key,title:payload.title,body:payload.body,url:url.href,group:"EvaOrbit" };
}

export async function sendBark(key: string, payload: EvaPushPayload, request: typeof fetch = fetch) {
  try {
    const response=await request("https://api.day.app/push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(barkPayload(key,payload)),signal:AbortSignal.timeout(10_000),redirect:"error"});
    if(!response.ok)return false;
    const result=await response.json() as {code?:number};
    return result.code===200;
  } catch { return false; }
}
