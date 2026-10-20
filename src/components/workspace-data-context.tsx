"use client";
import {createContext,useContext,type ComponentProps,type ComponentType,type ReactNode} from "react";
import NextLink from "next/link";
import {PageHeader} from "./page-header";
import {PageHeading} from "./page-heading";
export type WorkspaceRead=(path:string,init?:RequestInit)=>Promise<Response>;
type LinkProps=ComponentProps<"a">&{href:string};
const Context=createContext<{read:WorkspaceRead;Link:ComponentType<LinkProps>}|null>(null);
export function WorkspaceDataProvider({read,Link,children}:{read:WorkspaceRead;Link:ComponentType<LinkProps>;children:ReactNode}){return <Context.Provider value={{read,Link}}>{children}</Context.Provider>;}
export function useWorkspaceData(){const value=useContext(Context);return {read:value?.read??fetch,local:Boolean(value)};}
export function WorkspaceLink(props:LinkProps){const value=useContext(Context);return value?<value.Link {...props}/>:<NextLink {...props}/>;}
// Web keeps Lucius's existing navigation; the local shell owns its single back control.
export function WorkspacePageHeader(props:ComponentProps<typeof PageHeading>){const {local}=useWorkspaceData();return local?<PageHeading {...props}/>:<PageHeader {...props}/>;}
