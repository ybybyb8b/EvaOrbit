import {useCallback,useEffect,useRef,type ReactNode,type ComponentType} from "react";
import {FoodDataProvider,type FoodLinkProps,type FoodRead} from "@/components/food-data-context";
import {createFoodLocalReader} from "@/lib/food-local-reader";
import {clientDataChanged} from "@/lib/client-data-cache";
import type {FoodReadonlyResource,FoodResourceKind} from "@/lib/food-readonly-resource";
import type {LocalAccount,TrackerPlatform} from "./platform";

export function FoodLocalData({account,platform,Link,onIssue,children}:{account:LocalAccount;platform:TrackerPlatform;Link:ComponentType<FoodLinkProps>;onIssue:(message:string)=>void;children:ReactNode}){
  const pending=useRef(new Map<string,Promise<FoodReadonlyResource|null>>()),refreshed=useRef(new Set<string>()),alive=useRef(true);
  const refresh=useCallback((kind:FoodResourceKind,key:string)=>{
    const token=kind+"/"+key,existing=pending.current.get(token);if(existing)return existing;
    refreshed.current.add(token);
    const request=platform.foodResource(account,kind,key,true).then(value=>{
      if(alive.current&&value){onIssue("");window.dispatchEvent(new CustomEvent(clientDataChanged,{detail:{domains:["food","drinks"],reason:"update"}}));}
      return value;
    }).finally(()=>pending.current.delete(token));
    pending.current.set(token,request);return request;
  },[account,platform,onIssue]);
  const resource=useCallback(async(kind:FoodResourceKind,key:string)=>{
    const cached=await platform.foodResource(account,kind,key);
    if(cached){if(!refreshed.current.has(kind+"/"+key))void refresh(kind,key).catch(reason=>{if(alive.current)onIssue(reason instanceof Error?reason.message:"Could not refresh downloaded Food data.");});return cached;}
    return refresh(kind,key);
  },[account,platform,refresh,onIssue]);
  const read=useCallback<FoodRead>((path,init)=>createFoodLocalReader(resource)(path,init),[resource]);
  useEffect(()=>{
    alive.current=true;
    const online=()=>{const recent=[...refreshed.current].slice(-2);for(const token of new Set(["catalog/current",...recent])){const [kind,key]=token.split("/");void refresh(kind as FoodResourceKind,key).catch(reason=>{if(alive.current)onIssue(String(reason instanceof Error?reason.message:"Could not refresh Food data."));});}};
    window.addEventListener("online",online);window.addEventListener("evaorbit:native-active",online);
    return()=>{alive.current=false;window.removeEventListener("online",online);window.removeEventListener("evaorbit:native-active",online);};
  },[refresh,onIssue]);
  return <FoodDataProvider read={read} Link={Link}>{children}</FoodDataProvider>;
}
