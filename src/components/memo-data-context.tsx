"use client";
import {createContext,useContext,type ComponentProps,type ComponentType,type ReactNode} from "react";
import NextLink from "next/link";
type LinkProps=ComponentProps<"a">&{href:string};
export type MemoRead=(path:string,init?:RequestInit)=>Promise<Response>;
const Context=createContext<{read:MemoRead;Link:ComponentType<LinkProps>;complete:boolean}|null>(null);
export function MemoDataProvider({children,...value}:{children:ReactNode;read:MemoRead;Link:ComponentType<LinkProps>;complete:boolean}){return <Context.Provider value={value}>{children}</Context.Provider>;}
export function useMemoData(){const value=useContext(Context);return {read:value?.read??fetch,local:Boolean(value),complete:value?.complete??true};}
export function MemoLink(props:LinkProps){const value=useContext(Context);return value?<value.Link {...props}/>:<NextLink {...props}/>;}
