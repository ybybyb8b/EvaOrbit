"use client";
import {useRouter} from "next/navigation";
import {MediaDetailContent} from "./media-detail-content";
import type {MediaDetail,MediaSeries} from "@/lib/types";
export function MediaDetailView(props:{initial:MediaDetail;initialSeries:MediaSeries[]}){const router=useRouter();return <MediaDetailContent {...props} navigate={path=>{router.push(path);router.refresh();}}/>;}
