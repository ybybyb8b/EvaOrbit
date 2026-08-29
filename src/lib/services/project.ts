import "server-only";

import { getRepository } from "../repositories";
import type { NewProject, NewProjectItem, ProjectItemListInput, ProjectItemPatch, ProjectListInput, ProjectPatch } from "../repositories/types";

export async function listProjects(input: ProjectListInput = {}) { return (await getRepository()).listProjects(input); }
export async function getProject(id: number) { return (await getRepository()).getProject(id); }
export async function createProject(input: NewProject) { return (await getRepository()).createProject(input); }
export async function updateProject(id: number, input: ProjectPatch) { return (await getRepository()).updateProject(id, input); }
export async function listProjectItems(input: ProjectItemListInput = {}) { return (await getRepository()).listProjectItems(input); }
export async function getProjectItem(id: number) { return (await getRepository()).getProjectItem(id); }
export async function createProjectItem(input: NewProjectItem) { return (await getRepository()).createProjectItem(input); }
export async function updateProjectItem(id: number, input: ProjectItemPatch) { return (await getRepository()).updateProjectItem(id, input); }
