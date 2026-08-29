import { notFound } from "next/navigation";
import { getProject, listProjectItems } from "@/lib/services/project";
import { ProjectDetailView } from "./project-detail-view";

export const dynamic="force-dynamic";
export default async function ProjectDetailPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const projectId=Number(id);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();const [project,items]=await Promise.all([getProject(projectId),listProjectItems({projectId,limit:200})]);if(!project)notFound();return <ProjectDetailView initialProject={project} initialItems={items}/>;}
