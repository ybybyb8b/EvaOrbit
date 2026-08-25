import "server-only";

import { getRepository } from "../repositories";
import type { AiSettingsInput, NewTask, TaskFilter } from "../repositories/types";
import type { ChatRole } from "../types";

export async function listTasks(filter: TaskFilter = "all") { return (await getRepository()).listTasks(filter); }
export async function getTask(id: number) { return (await getRepository()).getTask(id); }
export async function createTask(input: NewTask) { return (await getRepository()).createTask(input); }
export async function updateTask(id: number, input: Record<string, unknown>) { return (await getRepository()).updateTask(id, input); }
export async function deleteTask(id: number) { return (await getRepository()).deleteTask(id); }

export async function listMemories(query = "", category = "") { return (await getRepository()).listMemories(query, category); }
export async function getMemory(id: number) { return (await getRepository()).getMemory(id); }
export async function createMemory(input: { title: string; content: string; category: string }) { return (await getRepository()).createMemory(input); }
export async function updateMemory(id: number, input: Record<string, unknown>) { return (await getRepository()).updateMemory(id, input); }
export async function deleteMemory(id: number) { return (await getRepository()).deleteMemory(id); }

export async function getDashboardSummary() { return (await getRepository()).getDashboardSummary(); }
export async function getAiSettings() { return (await getRepository()).getAiSettings(); }
export async function updateAiSettings(input: AiSettingsInput) { return (await getRepository()).updateAiSettings(input); }

export async function listChatSessions() { return (await getRepository()).listChatSessions(); }
export async function getChatSession(id: number) { return (await getRepository()).getChatSession(id); }
export async function createChatSession(title?: string) { return (await getRepository()).createChatSession(title); }
export async function updateChatSession(id: number, title: string) { return (await getRepository()).updateChatSession(id, title); }
export async function deleteChatSession(id: number) { return (await getRepository()).deleteChatSession(id); }
export async function listChatMessages(sessionId: number) { return (await getRepository()).listChatMessages(sessionId); }
export async function addChatMessage(sessionId: number, role: ChatRole, content: string, model?: string | null) { return (await getRepository()).addChatMessage(sessionId, role, content, model); }
export async function autoTitleChatSession(id: number, content: string) { return (await getRepository()).autoTitleChatSession(id, content); }

export async function getAiContext() {
  const repository = await getRepository();
  const [tasks, memories] = await Promise.all([repository.listTasks("open"), repository.listMemories()]);
  return { tasks: tasks.slice(0, 30), memories: memories.slice(0, 30) };
}
