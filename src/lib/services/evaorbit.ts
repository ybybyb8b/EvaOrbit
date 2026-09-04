import "server-only";

import { getRepository } from "../repositories";
import type { AiModelConfigInput, AiProviderInput, AiSettingsInput, NewTask, TaskFilter } from "../repositories/types";
import type { ChatRole } from "../types";
import type { HomeModuleId } from "../home-modules";
import type { AppearanceMode, ColorTheme } from "../theme";
import type { UiLanguage } from "../locale";
import type { ChineseFont, EnglishFont } from "../font-preferences";

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
export async function getUiPreferences() { return (await getRepository()).getUiPreferences(); }
export async function updateHomeModuleOrder(order: HomeModuleId[]) { return (await getRepository()).updateHomeModuleOrder(order); }
export async function updateAppearancePreferences(input: { appearanceMode: AppearanceMode; colorTheme: ColorTheme; uiLanguage: UiLanguage; chineseFont: ChineseFont; englishFont: EnglishFont }) { return (await getRepository()).updateAppearancePreferences(input); }
export async function getAiSettings() { return (await getRepository()).getAiSettings(); }
export async function updateAiSettings(input: AiSettingsInput) { return (await getRepository()).updateAiSettings(input); }
export async function getAiRuntimeSettings(modelConfigId?: number | null) { return (await getRepository()).getAiRuntimeSettings(modelConfigId); }
export async function listAiProviders() { return (await getRepository()).listAiProviders(); }
export async function getAiProvider(id: number) { return (await getRepository()).getAiProvider(id); }
export async function createAiProvider(input: AiProviderInput) { return (await getRepository()).createAiProvider(input); }
export async function updateAiProvider(id: number, input: AiProviderInput) { return (await getRepository()).updateAiProvider(id, input); }
export async function deleteAiProvider(id: number) { return (await getRepository()).deleteAiProvider(id); }
export async function createAiModelConfig(providerId: number, input: AiModelConfigInput) { return (await getRepository()).createAiModelConfig(providerId, input); }
export async function updateAiModelConfig(id: number, input: AiModelConfigInput) { return (await getRepository()).updateAiModelConfig(id, input); }
export async function deleteAiModelConfig(id: number) { return (await getRepository()).deleteAiModelConfig(id); }

export async function listChatSessions() { return (await getRepository()).listChatSessions(); }
export async function getChatSession(id: number) { return (await getRepository()).getChatSession(id); }
export async function createChatSession(title?: string, modelConfigId?: number | null) { return (await getRepository()).createChatSession(title, modelConfigId); }
export async function updateChatSession(id: number, input: { title?: string; modelConfigId?: number | null }) { return (await getRepository()).updateChatSession(id, input); }
export async function deleteChatSession(id: number) { return (await getRepository()).deleteChatSession(id); }
export async function listChatMessages(sessionId: number) { return (await getRepository()).listChatMessages(sessionId); }
export async function addChatMessage(sessionId: number, role: ChatRole, content: string, model?: string | null, providerId?: number | null, modelConfigId?: number | null) { return (await getRepository()).addChatMessage(sessionId, role, content, model, providerId, modelConfigId); }
export async function autoTitleChatSession(id: number, content: string) { return (await getRepository()).autoTitleChatSession(id, content); }
