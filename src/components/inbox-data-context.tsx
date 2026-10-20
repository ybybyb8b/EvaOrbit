"use client";
import {createContext,useContext,type ReactNode} from "react";
export type InboxRead=(path:string,init?:RequestInit)=>Promise<Response>;
const Context=createContext<InboxRead|null>(null);
export function InboxDataProvider({read,children}:{read:InboxRead;children:ReactNode}){return <Context.Provider value={read}>{children}</Context.Provider>;}
export function useInboxData(){const value=useContext(Context);return {read:value??fetch,local:Boolean(value)};}
