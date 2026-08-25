import type { AiSettings, ChatMessage, ChatPreferences, ChatRole, ChatSession, DashboardSummary, DailyNutritionSummary, DrinkLimit, DrinkLog, FoodLibraryItem, FoodLog, InboxItem, Memory, Task } from "../types";

export type TaskFilter = "all" | "open" | "done";

export type NewTask = {
  title: string;
  notes: string;
  dueDate: string | null;
  priority: string;
  tags: string[];
};

export type AiSettingsInput = ChatPreferences & {
  providerPreset: string;
  providerName: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  enabled: boolean;
  temperature: number;
  systemPrompt: string;
  responseLength: "brief" | "balanced" | "detailed";
  initiative: "quiet" | "balanced" | "active";
  allowSuggestions: boolean;
  allowTeasing: boolean;
  includeTasks: boolean;
  includeMemories: boolean;
  allowWriteActions: boolean;
};

export type InternalAiSettings = AiSettings & { apiKey: string };

export type NewInboxItem = Pick<InboxItem, "content" | "source">;
export type NewFoodLog = Omit<FoodLog, "id" | "createdAt" | "updatedAt">;
export type NewFoodLibraryItem = Omit<FoodLibraryItem, "id" | "updatedAt">;
export type NewDrinkLog = Omit<DrinkLog, "id" | "createdAt" | "updatedAt">;
export type NewDrinkLimit = Omit<DrinkLimit, "id" | "createdAt" | "updatedAt">;

export interface EvaOrbitRepository {
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  getTask(id: number): Promise<Task | null>;
  createTask(input: NewTask): Promise<Task>;
  updateTask(id: number, input: Record<string, unknown>): Promise<Task | null>;
  deleteTask(id: number): Promise<boolean>;

  listMemories(query?: string, category?: string): Promise<Memory[]>;
  getMemory(id: number): Promise<Memory | null>;
  createMemory(input: { title: string; content: string; category: string }): Promise<Memory>;
  updateMemory(id: number, input: Record<string, unknown>): Promise<Memory | null>;
  deleteMemory(id: number): Promise<boolean>;

  getDashboardSummary(): Promise<DashboardSummary>;
  getAiSettings(): Promise<InternalAiSettings>;
  updateAiSettings(input: AiSettingsInput): Promise<InternalAiSettings>;
  updateChatPreferences(input: ChatPreferences): Promise<InternalAiSettings>;

  listChatSessions(): Promise<ChatSession[]>;
  getChatSession(id: number): Promise<ChatSession | null>;
  createChatSession(title?: string): Promise<ChatSession>;
  updateChatSession(id: number, title: string): Promise<ChatSession | null>;
  deleteChatSession(id: number): Promise<boolean>;
  listChatMessages(sessionId: number): Promise<ChatMessage[]>;
  addChatMessage(sessionId: number, role: ChatRole, content: string, model?: string | null): Promise<ChatMessage>;
  autoTitleChatSession(id: number, content: string): Promise<void>;

  listInbox(status?: string): Promise<InboxItem[]>;
  getInboxItem(id: number): Promise<InboxItem | null>;
  createInboxItem(input: NewInboxItem): Promise<InboxItem>;
  updateInboxItem(id: number, input: Record<string, unknown>): Promise<InboxItem | null>;
  deleteInboxItem(id: number): Promise<boolean>;

  listFoodLogs(input?: { date?: string; query?: string; mealType?: string; from?: string; to?: string }): Promise<FoodLog[]>;
  getFoodLog(id: number): Promise<FoodLog | null>;
  createFoodLog(input: NewFoodLog): Promise<FoodLog>;
  updateFoodLog(id: number, input: Record<string, unknown>): Promise<FoodLog | null>;
  deleteFoodLog(id: number): Promise<boolean>;
  searchFoodLibrary(query?: string, brand?: string): Promise<FoodLibraryItem[]>;
  upsertFoodLibraryItem(input: NewFoodLibraryItem): Promise<FoodLibraryItem>;

  listDrinkLogs(input?: { date?: string; from?: string; to?: string; drinkType?: string }): Promise<DrinkLog[]>;
  getDrinkLog(id: number): Promise<DrinkLog | null>;
  createDrinkLog(input: NewDrinkLog): Promise<DrinkLog>;
  updateDrinkLog(id: number, input: Record<string, unknown>): Promise<DrinkLog | null>;
  deleteDrinkLog(id: number): Promise<boolean>;
  listDrinkLimits(): Promise<DrinkLimit[]>;
  createDrinkLimit(input: NewDrinkLimit): Promise<DrinkLimit>;
  updateDrinkLimit(id: number, input: Record<string, unknown>): Promise<DrinkLimit | null>;
  deleteDrinkLimit(id: number): Promise<boolean>;

  getNutritionSettings(date: string): Promise<Pick<DailyNutritionSummary, "restingEnergyKcal" | "activeEnergyKcal" | "notes">>;
  updateNutritionSettings(date: string, input: { restingEnergyKcal: number | null; activeEnergyKcal: number | null; notes: string }): Promise<void>;
}
