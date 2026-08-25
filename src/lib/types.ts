export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: number;
  title: string;
  notes: string;
  completed: boolean;
  dueDate: string | null;
  priority: TaskPriority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Memory {
  id: number;
  title: string;
  content: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  openTasks: number;
  dueToday: number;
  memories: number;
  recentTasks: Task[];
  recentMemories: Memory[];
}

export interface ApiError {
  error: string;
}

export type ChatRole = "user" | "assistant";
export type AvatarType = "default" | "emoji" | "image";

export interface ChatPreferences {
  userDisplayName: string;
  userAvatarType: AvatarType;
  userAvatarValue: string;
  assistantDisplayName: string;
  assistantAvatarType: AvatarType;
  assistantAvatarValue: string;
  showUserName: boolean;
  showAssistantName: boolean;
  showAvatars: boolean;
}

export interface AiSettings extends ChatPreferences {
  providerPreset: string;
  providerName: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyManagedByEnvironment: boolean;
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
  updatedAt: string;
}

export interface ChatSession {
  id: number;
  title: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  preview: string;
  messageCount: number;
}

export interface ChatMessage {
  id: number;
  sessionId: number;
  role: ChatRole;
  content: string;
  model: string | null;
  createdAt: string;
}

export type InboxStatus = "inbox" | "processed" | "archived";
export interface InboxItem {
  id: number;
  content: string;
  status: InboxStatus;
  source: string;
  processedAt: string | null;
  convertedType: string | null;
  convertedId: number | null;
  createdAt: string;
  updatedAt: string;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "late_night";
export type FoodScene = "home" | "delivery" | "restaurant" | "packaged_food" | "other";
export type EstimateConfidence = "high" | "medium" | "low";
export interface FoodLog {
  id: number;
  occurredAt: string;
  mealType: MealType;
  title: string;
  description: string;
  portion: string;
  scene: FoodScene;
  estimatedKcal: number | null;
  kcalMin: number | null;
  kcalMax: number | null;
  confidence: EstimateConfidence;
  notes: string;
  imageUrl: string | null;
  attachmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FoodCategory = "staple" | "dish" | "snack" | "drink" | "other";
export type FoodReferenceType = "per_100g" | "per_100ml" | "per_serving";
export type FoodDataSource = "package_label" | "official" | "estimated" | "manual";
export interface FoodLibraryItem {
  id: number;
  name: string;
  brand: string;
  category: FoodCategory;
  defaultPortion: string;
  referenceType: FoodReferenceType;
  referenceEnergyKj: number | null;
  referenceKcal: number | null;
  servingWeight: number | null;
  servingKcal: number | null;
  dataSource: FoodDataSource;
  notes: string;
  updatedAt: string;
}

export type DrinkType = "coffee" | "milk_tea" | "tea" | "soda" | "juice" | "water" | "alcohol" | "other";
export interface DrinkLog {
  id: number;
  occurredAt: string;
  name: string;
  brand: string;
  drinkType: DrinkType;
  volumeMl: number | null;
  sugarLevel: string;
  caffeineMg: number | null;
  estimatedKcal: number | null;
  kcalMin: number | null;
  kcalMax: number | null;
  confidence: EstimateConfidence;
  foodLibraryId: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type LimitPeriod = "daily" | "weekly";
export interface DrinkLimit {
  id: number;
  name: string;
  targetType: string;
  period: LimitPeriod;
  limitValue: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LimitState = "within_limit" | "near_limit" | "reached_limit" | "exceeded_limit";
export interface DrinkLimitStatus {
  limit: DrinkLimit;
  count: number;
  state: LimitState;
}

export interface DailyNutritionSummary {
  date: string;
  estimatedIntakeKcal: number;
  intakeMin: number;
  intakeMax: number;
  restingEnergyKcal: number | null;
  activeEnergyKcal: number | null;
  totalExpenditureKcal: number | null;
  energyBalance: number | null;
  energyBalanceMin: number | null;
  energyBalanceMax: number | null;
  confidence: EstimateConfidence;
  notes: string;
}
