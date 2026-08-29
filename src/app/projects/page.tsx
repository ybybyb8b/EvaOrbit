import type { Metadata } from "next";
import { listProjects } from "@/lib/services/project";
import { ProjectsView } from "./projects-view";

export const metadata:Metadata={title:"Projects"};
export const dynamic="force-dynamic";
export default async function ProjectsPage(){return <ProjectsView initial={await listProjects({limit:100})}/>;}
