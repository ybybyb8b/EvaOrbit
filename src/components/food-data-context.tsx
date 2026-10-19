"use client";
import {PageLogAction} from "./bottom-log-core";
import {createContext,useContext,type ComponentType,type ReactNode} from "react";

export type FoodRead=(path:string,init?:{signal?:AbortSignal})=>Promise<Response>;
export type FoodLinkProps={href:string;children:ReactNode;className?:string};
const FoodDataContext=createContext<{read:FoodRead;Link:ComponentType<FoodLinkProps>}|null>(null);
export function FoodDataProvider({read,Link,children}:{read:FoodRead;Link:ComponentType<FoodLinkProps>;children:ReactNode}){
  return <FoodDataContext.Provider value={{read,Link}}>{children}</FoodDataContext.Provider>;
}
export function useFoodData(){const local=useContext(FoodDataContext);return {read:local?.read??fetch,local:Boolean(local)};}
export function FoodLink({fallback:Fallback,...props}:FoodLinkProps&{fallback:ComponentType<FoodLinkProps>}){
  const data=useContext(FoodDataContext),Target=data?.Link??Fallback;
  return <Target {...props}/>;
}
export function FoodPreviewAction({label,onClick,children,className="button primary",disabled=false}:{label:string;onClick:()=>void;children:ReactNode;className?:string;disabled?:boolean}){
  return <PageLogAction label={label} className={className} onClick={onClick} disabled={disabled}>{children}</PageLogAction>;
}
