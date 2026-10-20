"use client";
import {createContext,useContext,type ComponentProps,type ComponentType,type ReactNode} from "react";
import NextLink from "next/link";

export type HealthRead=(path:string,init?:RequestInit)=>Promise<Response>;
export type HealthNavigation={refresh:()=>void;push:(path:string)=>void};
type LinkProps=ComponentProps<"a">&{href:string};
const Context=createContext<{read:HealthRead;Link:ComponentType<LinkProps>}|null>(null);
export function HealthDataProvider({read,Link,children}:{read:HealthRead;Link:ComponentType<LinkProps>;children:ReactNode}){return <Context.Provider value={{read,Link}}>{children}</Context.Provider>;}
export function useHealthData(){const value=useContext(Context);return {read:value?.read??fetch,local:Boolean(value)};}
export function HealthLink(props:LinkProps){const value=useContext(Context);return value?<value.Link {...props}/>:<NextLink {...props}/>;}
