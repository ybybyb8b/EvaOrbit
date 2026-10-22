import {createContext,useContext,useEffect,useLayoutEffect,useMemo,useState,type ReactNode} from "react";
import {installNativeRequest,rawNativeCall,type NativeHostInfo,type HealthKitStatus,NativeBridgeError} from "@/lib/native-bridge";
import {installNativeApiRequest} from "@/lib/native-api";
import {startEventKitAutoSync,syncConfiguredEventKit,eventKitConfigChanged} from "@/lib/eventkit-auto-sync";
import {reconcileNativeNotifications} from "@/lib/native-bridge";
import {flushPendingMenstrualFlowToHealthKit} from "@/lib/healthkit-menstrual-flow";
import {onlineBusinessChanged} from "./online-business";
import {notifySessionExpired} from "./session-events";
import type {LocalAccount} from "./platform";

const Enabled=createContext(false);
export function useLocalNativeEnabled(){return useContext(Enabled);}

export function LocalNativeIntegrations({account,native,children}:{account:LocalAccount|null;native:boolean;children:ReactNode}){
 const [enabled,setEnabled]=useState<{accountId:string;value:boolean}|null>(null);
 const session=useMemo(()=>{
  if(!native||!account)return null;
  let alive=true;const cache:{info?:Promise<NativeHostInfo>}={};
  const check=()=>{if(!alive)throw new Error("Account changed. Reopen native settings.");};
  async function invoke<T>(method:string,args:Record<string,unknown>){
   check();
   try{const result=await rawNativeCall<T>("native.invoke",{accountId:account!.accountId,method,arguments:args});check();return result;}
   catch(error){if(alive&&error instanceof NativeBridgeError&&error.code==="session_expired")notifySessionExpired(account!.accountId);throw error;}
  }
  async function hostInfo(){
   if(!cache.info)cache.info=(async()=>{const base=await rawNativeCall<NativeHostInfo>("host.getInfo");if(!base.methods?.includes("native.invoke"))return base;
    try{const result=await invoke<NativeHostInfo>("host.getInfo",{});if(alive)setEnabled({accountId:account!.accountId,value:true});return result;}
    catch{if(alive)setEnabled({accountId:account!.accountId,value:false});return base;}
   })();
   return cache.info;
  }
  return {activate:()=>{alive=true;},dispose:()=>{alive=false;},invalidate:()=>{cache.info=undefined;},
   request:async<T,>(method:string,args:Record<string,unknown>):Promise<T>=>{check();if(method==="host.getInfo")return await hostInfo() as T;
    if((/^(healthkit|eventkit|notification)\./.test(method)&&!method.endsWith(".getStatus")&&method!=="notification.openSettings")||method==="host.notifyDataChanged")return invoke<T>(method,args);
    const result=await rawNativeCall<T>(method,args);check();return result;
   },
   api:async(path:string,init:RequestInit={})=>{
    check();if(!navigator.onLine)throw new Error("Connect to use Apple integrations. No system operation was queued.");
    const method=(init.method??"GET").toUpperCase();let bodyBase64:string|undefined;
    if(init.body!==undefined&&init.body!==null){if(typeof init.body!=="string")throw new Error("Native integration expects JSON");const bytes=new TextEncoder().encode(init.body);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);bodyBase64=btoa(binary);}
    const abort=()=>{if(init.signal?.aborted)throw new DOMException("Aborted","AbortError");};abort();
    const result=await rawNativeCall<{status:number;body:unknown}>("native.api",{accountId:account!.accountId,path,method,...(bodyBase64?{bodyBase64}:{})}).catch(error=>{if(alive&&error instanceof NativeBridgeError&&error.code==="session_expired")notifySessionExpired(account!.accountId);throw error;});check();abort();
    if(result.status===401)notifySessionExpired(account!.accountId);
    return new Response(result.status===204?null:JSON.stringify(result.body),{status:result.status,headers:{"Content-Type":"application/json"}});
   }};
 },[account,native]);
 useLayoutEffect(()=>{if(!session)return;session.activate();const removeNative=installNativeRequest(session.request),removeAPI=installNativeApiRequest(session.api);return()=>{session.dispose();removeNative();removeAPI();};},[session]);
 const active=Boolean(account&&enabled?.accountId===account.accountId&&enabled.value);
 useEffect(()=>{if(!session)return;const update=()=>{session.invalidate();void session.request<NativeHostInfo>("host.getInfo",{}).catch(()=>{});};update();window.addEventListener("evaorbit:native-active",update);window.addEventListener("online",update);return()=>{window.removeEventListener("evaorbit:native-active",update);window.removeEventListener("online",update);};},[session]);
 return <Enabled.Provider value={active}>{active&&<NativeLifecycle/>}{children}</Enabled.Provider>;
}

function NativeLifecycle(){
 useEffect(()=>{
  const stop=startEventKitAutoSync(async()=>{
   await syncConfiguredEventKit();
   const health=await rawNativeCall<HealthKitStatus>("healthkit.getStatus");
   if(health.credentialConfigured&&health.authorizationRequested)await flushPendingMenstrualFlowToHealthKit();
   await reconcileNativeNotifications();
  });
  const saved=(event:Event)=>{if((event as CustomEvent).detail?.path)window.dispatchEvent(new Event(eventKitConfigChanged));};
  window.addEventListener(onlineBusinessChanged,saved);
  return()=>{stop();window.removeEventListener(onlineBusinessChanged,saved);};
 },[]);
 return null;
}
