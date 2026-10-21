"use client";
import {createContext,useContext} from "react";
import type {BusinessRequest} from "@/lib/business-request";
const webRequest:BusinessRequest=(path,init)=>fetch(path,init);
export const BusinessRequestContext=createContext<BusinessRequest|null>(null);
// A form captures its account's request function. Later login changes cannot
// redirect the second step of a multi-request save into another account.
export function useBusinessRequest(){return useContext(BusinessRequestContext)??webRequest;}
