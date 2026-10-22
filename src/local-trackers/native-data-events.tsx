import {useEffect} from "react";
import {dataChangedEvent,dataChangedDomains} from "@/lib/data-changed";
import {invalidateHomeCache} from "@/lib/home-cache";
import {clearClientJsonCache} from "@/lib/client-json-cache";
import {onlineBusinessChanged} from "./online-business";

export function LocalNativeDataEvents({accountId}:{accountId:string}){
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  const changed=(event:Event)=>{if(!dataChangedDomains((event as CustomEvent).detail).length)return;clearTimeout(timer);timer=setTimeout(()=>{clearClientJsonCache();invalidateHomeCache();window.dispatchEvent(new CustomEvent(onlineBusinessChanged,{detail:{accountId,source:"native"}}));},100);};
  window.addEventListener(dataChangedEvent,changed);return()=>{clearTimeout(timer);window.removeEventListener(dataChangedEvent,changed);};
 },[accountId]);
 return null;
}
