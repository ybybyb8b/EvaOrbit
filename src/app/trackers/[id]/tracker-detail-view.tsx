"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {TrackerIcon} from "@/components/tracker-icon";
import {TrackerDetailContent,type TrackerDetailData} from "./tracker-detail-content";
export function TrackerDetailView(props:{initial:TrackerDetailData;trackerId:number;openDetailedRecord?:boolean}){
 const router=useRouter();
 return <TrackerDetailContent {...props} navigation={router} LinkComponent={Link} Picture={TrackerIcon}/>;
}
