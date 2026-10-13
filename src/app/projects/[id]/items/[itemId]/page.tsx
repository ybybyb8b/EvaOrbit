import { notFound } from "next/navigation";
import { getProject, getProjectItem, listProjectItems } from "@/lib/services/project";
import { ProjectItemDetailView } from "./project-item-detail-view";

export const dynamic="force-dynamic";
export default async function ProjectItemPage({params}:{params:Promise<{id:string;itemId:string}>}){const {id,itemId}=await params;const projectId=Number(id),entryId=Number(itemId);if(!Number.isSafeInteger(projectId)||!Number.isSafeInteger(entryId))notFound();const [project,item,items]=await Promise.all([getProject(projectId),getProjectItem(entryId),listProjectItems({projectId,limit:200})]);if(!project||!item||item.projectId!==projectId)notFound();return <ProjectItemDetailView project={project} initial={item} modules={items.map(item=>item.module)}/>;}
