"use client";
import {createContext,useContext,type ComponentProps,type ComponentType,type ReactNode} from "react";
import NextLink from "next/link";

export type RelationsRead=(path:string,init?:RequestInit)=>Promise<Response>;
type LinkProps=ComponentProps<"a">&{href:string};
const Context=createContext<{read:RelationsRead;Link:ComponentType<LinkProps>}|null>(null);
export function RelationsDataProvider({read,Link,children}:{read:RelationsRead;Link:ComponentType<LinkProps>;children:ReactNode}){return <Context.Provider value={{read,Link}}>{children}</Context.Provider>;}
export function useRelationsData(){const value=useContext(Context);return {read:value?.read??fetch,local:Boolean(value)};}
export function RelationsLink(props:LinkProps){const value=useContext(Context);return value?<value.Link {...props}/>:<NextLink {...props}/>;}
