"use client";
import {useRouter} from "next/navigation";
import {CaseDetailContent} from "./case-detail-content";
import type {LuciusCase} from "@/lib/types";
export function CaseDetailView({initial}:{initial:LuciusCase}){const router=useRouter();return <CaseDetailContent initial={initial} navigate={path=>{router.push(path);router.refresh();}}/>;}
