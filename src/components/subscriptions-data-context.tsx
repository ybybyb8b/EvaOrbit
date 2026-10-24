"use client";
import {createContext,useContext,type ComponentProps,type ComponentType,type ReactNode} from "react";
import NextLink from "next/link";
type LinkProps=ComponentProps<"a">&{href:string};
export type SubscriptionsRead=(path:string,init?:RequestInit)=>Promise<Response>;
const Context=createContext<{read:SubscriptionsRead;Link:ComponentType<LinkProps>;iconSources:Record<number,string>;libraryIconSources?:Record<number,string>}|null>(null);
export function SubscriptionsDataProvider({children,...value}:{children:ReactNode;read:SubscriptionsRead;Link:ComponentType<LinkProps>;iconSources:Record<number,string>;libraryIconSources?:Record<number,string>}){return <Context.Provider value={value}>{children}</Context.Provider>;}
export function useSubscriptionsData(){const value=useContext(Context);return {read:value?.read??fetch,local:Boolean(value),iconSources:value?.iconSources,libraryIconSources:value?.libraryIconSources};}
export function SubscriptionLink(props:LinkProps){const value=useContext(Context);return value?<value.Link {...props}/>:<NextLink {...props}/>;}
