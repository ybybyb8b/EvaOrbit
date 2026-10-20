"use client";
import {useRouter} from "next/navigation";
import type {HealthRecord} from "@/lib/types";
import {HealthRecordDetailContent} from "./health-record-detail-content";
export function HealthRecordDetailView({initial}:{initial:HealthRecord}){const router=useRouter();return <HealthRecordDetailContent initial={initial} navigation={router}/>;}
