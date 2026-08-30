import type { Metadata } from "next";import { listRelationPeople } from "@/lib/services/relations";import { RelationsView } from "./relations-view";
export const metadata:Metadata={title:"Relations"};export const dynamic="force-dynamic";export default async function RelationsPage(){return <RelationsView initialPeople={await listRelationPeople()}/>;}
