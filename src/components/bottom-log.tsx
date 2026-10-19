"use client";
import type {ReactNode} from "react";
import {usePathname} from "next/navigation";
import {BottomLogProvider as CoreProvider} from "./bottom-log-core";
export {useBottomLog,useBottomLogAction,BottomLogScope,PageLogAction} from "./bottom-log-core";
export function BottomLogProvider({children}:{children:ReactNode}){return <CoreProvider pathname={usePathname()}>{children}</CoreProvider>;}
