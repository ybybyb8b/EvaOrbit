"use client";
import {useRouter} from "next/navigation";
import type {ComponentProps} from "react";
import {HealthViewContent} from "./health-view-content";
export type {HealthViewName} from "./health-view-content";
export function HealthView(props:Omit<ComponentProps<typeof HealthViewContent>,"navigation">){const router=useRouter();return <HealthViewContent {...props} navigation={router}/>;}
