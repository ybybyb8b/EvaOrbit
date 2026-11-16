"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {rawNativeCall,type NativeHostInfo} from "@/lib/native-bridge";
import {supportsNativeEva,supportsNativeCatalog} from "@/lib/native-eva";

const NativeEva=createContext<{supported:boolean|null;catalogSupported:boolean;accountId:string|null}>({supported:false,catalogSupported:false,accountId:null});
export const useNativeEva=()=>useContext(NativeEva);
export function NativeEvaProvider({accountId,children}:{accountId:string|null;children:ReactNode}) {
  const [capability,setCapability]=useState<{accountId:string|null;supported:boolean;catalogSupported:boolean}|null>(null);
  useEffect(()=>{
    let alive=true;
    const probe=()=>{if(!window.EvaOrbitNative){setCapability({accountId,supported:false,catalogSupported:false});return;}
      void rawNativeCall<NativeHostInfo>("host.getInfo").then(info=>{if(alive)setCapability({accountId,supported:supportsNativeEva(info),catalogSupported:supportsNativeCatalog(info)});}).catch(()=>{if(alive)setCapability({accountId,supported:false,catalogSupported:false});});};
    probe();window.addEventListener("evaorbit:native-ready",probe);
    return()=>{alive=false;window.removeEventListener("evaorbit:native-ready",probe);};
  },[accountId]);
  return <NativeEva.Provider value={{accountId,supported:capability?.accountId===accountId?capability.supported:null,catalogSupported:capability?.accountId===accountId&&capability.catalogSupported}}>{children}</NativeEva.Provider>;
}
