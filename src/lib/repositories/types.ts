import type { AiModelConfig, AiProvider, AiSettings, ChatMessage, ChatPreferences, ChatRole, ChatSession, DashboardSummary, DailyNutritionSummary, DrinkLimit, DrinkLog, FoodLibraryItem, FoodLog, InboxItem, Memory, Task, Tracker, TrackerEntry, TrackerField, TrackerGoal, TrackerReminder, UiPreferences } from "../types";
import type { HomeModuleId } from "../home-modules";

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
  clearApiKey: boolean;
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

export type InternalAiSettings = AiSettings & { apiKey: string; providerId: number | null; modelConfigId: number | null };
export type InternalAiProvider = Omit<AiProvider, "models" | "hasApiKey" | "maskedApiKey"> & { apiKey: string };
export type AiProviderInput = { name: string; providerType: string; baseUrl: string; enabled: boolean; apiKey?: string; clearApiKey: boolean };
export type AiModelConfigInput = { modelId: string; displayName: string; enabled: boolean; isDefault: boolean; capabilities: Record<string, unknown> };

export type NewInboxItem = Pick<InboxItem, "content" | "source">;
export type NewFoodLog = Omit<FoodLog, "id" | "createdAt" | "updatedAt">;
export type NewFoodLibraryItem = Omit<FoodLibraryItem, "id" | "updatedAt">;
export type NewDrinkLog = Omit<DrinkLog, "id" | "createdAt" | "updatedAt">;
export type NewDrinkLimit = Omit<DrinkLimit, "id" | "createdAt" | "updatedAt">;
export type NewTracker = Omit<Tracker, "id" | "createdAt" | "updatedAt">;
export type NewTrackerField = Omit<TrackerField, "id" | "createdAt" | "updatedAt">;
export type NewTrackerEntry = Omit<TrackerEntry, "id" | "sourceType" | "createdAt" | "updatedAt">;
export type NewTrackerGoal = Omit<TrackerGoal, "id" | "createdAt" | "updatedAt">;
export type NewTrackerReminder = Omit<TrackerReminder, "id" | "createdAt" | "updatedAt">;

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
  getUiPreferences(): Promise<UiPreferences>;
  updateHomeModuleOrder(order: HomeModuleId[]): Promise<UiPreferences>;
  getAiSettings(): Promise<InternalAiSettings>;
  updateAiSettings(input: AiSettingsInput): Promise<InternalAiSettings>;
  updateChatPreferences(input: ChatPreferences): Promise<InternalAiSettings>;
  getAiRuntimeSettings(modelConfigId?: number | null): Promise<InternalAiSettings>;
  listAiProviders(): Promise<AiProvider[]>;
  getAiProvider(id: number): Promise<InternalAiProvider | null>;
  createAiProvider(input: AiProviderInput): Promise<AiProvider>;
  updateAiProvider(id: number, input: AiProviderInput): Promise<AiProvider | null>;
  deleteAiProvider(id: number): Promise<boolean>;
  createAiModelConfig(providerId: number, input: AiModelConfigInput): Promise<AiModelConfig>;
  updateAiModelConfig(id: number, input: AiModelConfigInput): Promise<AiModelConfig | null>;
  deleteAiModelConfig(id: number): Promise<boolean>;

  listChatSessions(): Promise<ChatSession[]>;
  getChatSession(id: number): Promise<ChatSession | null>;
  createChatSession(title?: string, modelConfigId?: number | null): Promise<ChatSession>;
  updateChatSession(id: number, input: { title?: string; modelConfigId?: number | null }): Promise<ChatSession | null>;
  deleteChatSession(id: number): Promise<boolean>;
  listChatMessages(sessionId: number): Promise<ChatMessage[]>;
  addChatMessage(sessionId: number, role: ChatRole, content: string, model?: string | null, providerId?: number | null, modelConfigId?: number | null): Promise<ChatMessage>;
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

  listTrackers(): Promise<Tracker[]>;
  getTracker(id: number): Promise<Tracker | null>;
  createTracker(input: NewTracker): Promise<Tracker>;
  updateTracker(id: number, input: Record<string, unknown>): Promise<Tracker | null>;
  deleteTracker(id: number): Promise<boolean>;
  listTrackerFields(trackerId: number): Promise<TrackerField[]>;
  createTrackerField(input: NewTrackerField): Promise<TrackerField>;
  deleteTrackerField(id: number): Promise<boolean>;
  listTrackerEntries(trackerId?: number, input?: { from?: string; to?: string; query?: string }): Promise<TrackerEntry[]>;
  getTrackerEntry(id: number): Promise<TrackerEntry | null>;
  createTrackerEntry(input: NewTrackerEntry): Promise<TrackerEntry>;
  updateTrackerEntry(id: number, input: Record<string, unknown>): Promise<TrackerEntry | null>;
  deleteTrackerEntry(id: number): Promise<boolean>;
  listTrackerGoals(trackerId: number): Promise<TrackerGoal[]>;
  createTrackerGoal(input: NewTrackerGoal): Promise<TrackerGoal>;
  deleteTrackerGoal(id: number): Promise<boolean>;
  listTrackerReminders(trackerId: number): Promise<TrackerReminder[]>;
  createTrackerReminder(input: NewTrackerReminder): Promise<TrackerReminder>;
  deleteTrackerReminder(id: number): Promise<boolean>;

  getNutritionSettings(date: string): Promise<Pick<DailyNutritionSummary, "restingEnergyKcal" | "activeEnergyKcal" | "notes">>;
  updateNutritionSettings(date: string, input: { restingEnergyKcal: number | null; activeEnergyKcal: number | null; notes: string }): Promise<void>;
}
