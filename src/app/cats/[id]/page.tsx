import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPetDetail } from "@/lib/services/cats";
import { PetDetailView } from "./pet-detail-view";
export const dynamic="force-dynamic";export const metadata:Metadata={title:"Cat"};
export default async function PetPage({params}:{params:Promise<{id:string}>}){const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<=0)notFound();let detail;try{detail=await getPetDetail(id);}catch{notFound();}return <PetDetailView initial={detail}/>;}
