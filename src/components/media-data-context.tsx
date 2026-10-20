"use client";
import {createContext,useContext,type ComponentProps,type ComponentType,type ReactNode} from "react";
import NextLink from "next/link";
export type MediaRead=(path:string,init?:RequestInit)=>Promise<Response>;
type LinkProps=ComponentProps<"a">&{href:string};
const Context=createContext<{read:MediaRead;Link:ComponentType<LinkProps>}|null>(null);
export function MediaDataProvider({read,Link,children}:{read:MediaRead;Link:ComponentType<LinkProps>;children:ReactNode}){return <Context.Provider value={{read,Link}}>{children}</Context.Provider>;}
export function useMediaData(){const value=useContext(Context);return {read:value?.read??fetch,local:Boolean(value)};}
export function MediaLink(props:LinkProps){const value=useContext(Context);return value?<value.Link {...props}/>:<NextLink {...props}/>;}
