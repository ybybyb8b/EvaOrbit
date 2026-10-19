"use client";
import {createContext,useContext,type ComponentProps,type ComponentType,type ReactNode} from "react";
import NextLink from "next/link";

export type CatsRead=(path:string,init?:RequestInit)=>Promise<Response>;
type LinkProps=ComponentProps<"a"> & {href:string};
const Context=createContext<{read:CatsRead;Link:ComponentType<LinkProps>}|null>(null);
export function CatsDataProvider({read,Link,children}:{read:CatsRead;Link:ComponentType<LinkProps>;children:ReactNode}){return <Context.Provider value={{read,Link}}>{children}</Context.Provider>;}
export function useCatsData(){const value=useContext(Context);return {read:value?.read??fetch,local:Boolean(value)};}
export function CatsLink(props:LinkProps){const value=useContext(Context);return value?<value.Link {...props}/>:<NextLink {...props}/>;}
