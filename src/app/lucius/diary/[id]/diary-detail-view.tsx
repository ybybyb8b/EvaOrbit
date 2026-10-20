"use client";
import {useRouter} from "next/navigation";
import {DiaryDetailContent} from "./diary-detail-content";
import type {LuciusDiaryEntry} from "@/lib/types";
export function DiaryDetailView({initial}:{initial:LuciusDiaryEntry}){const router=useRouter();return <DiaryDetailContent initial={initial} navigate={path=>{router.push(path);router.refresh();}}/>;}
