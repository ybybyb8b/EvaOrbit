import type {Metadata} from "next";
import {SyncManager} from "@/components/sync-manager";
export const metadata:Metadata={title:"Data & Sync"};
export default function DataSyncPage(){return <SyncManager/>;}
