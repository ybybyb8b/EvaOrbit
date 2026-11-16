"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {rawNativeCall,type NativeHostInfo} from "@/lib/native-bridge";
import {supportsNativeEva,supportsNativeCatalog,nativeSubscriptionMethods,nativeGroupMethods,nativeDiscussionMethods} from "@/lib/native-eva";

const NativeEva=createContext<{supported:boolean|null;groupSupported:boolean;discussionSupported:boolean;subscriptionSupported:boolean;catalogSupported:boolean;accountId:string|null}>({supported:false,groupSupported:false,discussionSupported:false,subscriptionSupported:false,catalogSupported:false,accountId:null});
export const useNativeEva=()=>useContext(NativeEva);
export function NativeEvaProvider({accountId,children}:{accountId:string|null;children:ReactNode}) {
  const [capability,setCapability]=useState<{accountId:string|null;supported:boolean;groupSupported:boolean;discussionSupported:boolean;subscriptionSupported:boolean;catalogSupported:boolean}|null>(null);
  useEffect(()=>{
    let alive=true;
    const probe=()=>{if(!window.EvaOrbitNative){setCapability({accountId,supported:false,groupSupported:false,discussionSupported:false,subscriptionSupported:false,catalogSupported:false});return;}
      void rawNativeCall<NativeHostInfo>("host.getInfo").then(info=>{if(alive)setCapability({accountId,supported:supportsNativeEva(info),groupSupported:nativeGroupMethods.every(m=>info.methods?.includes(m)),discussionSupported:nativeDiscussionMethods.every(m=>info.methods?.includes(m)),subscriptionSupported:nativeSubscriptionMethods.every(m=>info.methods?.includes(m)),catalogSupported:supportsNativeCatalog(info)});}).catch(()=>{if(alive)setCapability({accountId,supported:false,groupSupported:false,discussionSupported:false,subscriptionSupported:false,catalogSupported:false});});};
    probe();window.addEventListener("evaorbit:native-ready",probe);
    return()=>{alive=false;window.removeEventListener("evaorbit:native-ready",probe);};
  },[accountId]);
  return <NativeEva.Provider value={{accountId,discussionSupported:Boolean(capability?.accountId===accountId&&capability.discussionSupported),groupSupported:Boolean(capability?.accountId===accountId&&capability.groupSupported),subscriptionSupported:Boolean(capability?.accountId===accountId&&capability.subscriptionSupported),supported:capability?.accountId===accountId?capability.supported:null,catalogSupported:capability?.accountId===accountId&&capability.catalogSupported}}>{children}</NativeEva.Provider>;
}
