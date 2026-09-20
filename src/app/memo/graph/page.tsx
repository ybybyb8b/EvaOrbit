import type { Metadata } from "next";
import { getMemoryGraphSnapshot } from "@/lib/services/memory-graph";
import { MemoryGraphView } from "./memory-graph-view";

export const metadata:Metadata={title:"Memory Graph"};
export const dynamic="force-dynamic";

export default async function MemoryGraphPage(){return <MemoryGraphView initial={await getMemoryGraphSnapshot()}/>;}
