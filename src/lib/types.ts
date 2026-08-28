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

export interface UiPreferences {
  homeModuleOrder: import("./home-modules").HomeModuleId[];
  updatedAt: string;
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
  maskedApiKey: string | null;
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

export interface AiModelConfig {
  id: number;
  providerId: number;
  modelId: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  capabilities: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AiProvider {
  id: number;
  name: string;
  providerType: string;
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
  maskedApiKey: string | null;
  models: AiModelConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: number;
  title: string;
  model: string | null;
  providerId: number | null;
  modelConfigId: number | null;
  providerName: string | null;
  modelDisplayName: string | null;
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
  providerId: number | null;
  modelConfigId: number | null;
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

export type TimelineSourceType = "food" | "drink" | "tracker" | "cat" | "person" | "media" | "chronicle";

export interface TimelineEvent {
  id: string;
  eventType: string;
  sourceType: TimelineSourceType;
  sourceId: number | string;
  title: string;
  detail: string;
  occurredAt: string;
  endAt: string | null;
  href: string;
  relatedPeople: Array<number | string>;
  relatedPets: Array<number | string>;
  metadata: Record<string, unknown>;
}

export type TrackerTimeType = "point" | "range";
export type TrackerDataSourceType = "native_tracker" | "linked_source";
export type TrackerIconType = "default" | "image";
export type TrackerFieldType = "number" | "single_select" | "multi_select" | "text" | "boolean" | "rating";
export type TrackerGoalOperator = "<=" | ">=" | "=";
export type TrackerPeriodType = "daily" | "weekly" | "monthly" | "yearly" | "custom";
export type TrackerReminderType = "scheduled" | "interval";

export interface Tracker {
  id: number;
  name: string;
  icon: string;
  iconType: TrackerIconType;
  iconValue: string;
  groupName: string;
  timeType: TrackerTimeType;
  quickCaptureEnabled: boolean;
  dataSourceType: TrackerDataSourceType;
  sourceConfig: Record<string, unknown>;
  statsConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TrackerField {
  id: number;
  trackerId: number;
  key: string;
  name: string;
  type: TrackerFieldType;
  required: boolean;
  defaultValue: unknown;
  options: string[];
  showAfterQuickCapture: boolean;
  includeInStats: boolean;
  sortOrder: number;
  unit: string;
  precision: number;
  config: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackerEntry {
  id: number;
  trackerId: number;
  occurredAt: string;
  endAt: string | null;
  values: Record<string, unknown>;
  note: string;
  sourceType: "native_tracker" | "drink";
  createdAt: string;
  updatedAt: string;
}

export interface TrackerGoal {
  id: number;
  trackerId: number;
  operator: TrackerGoalOperator;
  targetValue: number;
  periodType: TrackerPeriodType;
  customPeriod: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrackerReminder {
  id: number;
  trackerId: number;
  reminderType: TrackerReminderType;
  scheduleRule: string;
  intervalDays: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrackerStats {
  today: number;
  week: number;
  month: number;
  year: number;
  total: number;
  lastOccurredAt: string | null;
  reminderDue: boolean;
}

export interface TrackerHeatmapDay {
  date: string;
  count: number;
}

export interface TrackerDistributionItem {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface TrackerNumericInsight {
  fieldKey: string;
  name: string;
  unit: string;
  count: number;
  average: number;
  minimum: number;
  maximum: number;
  latest: number;
}

export interface TrackerChoiceInsight {
  fieldKey: string;
  name: string;
  values: TrackerDistributionItem[];
}

export interface TrackerInsights {
  heatmap: TrackerHeatmapDay[];
  monthly: TrackerDistributionItem[];
  weekdays: TrackerDistributionItem[];
  dayParts: TrackerDistributionItem[];
  activeDays: number;
  numericFields: TrackerNumericInsight[];
  choiceFields: TrackerChoiceInsight[];
}

export interface TrackerSummary extends Tracker {
  stats: TrackerStats;
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
  archivedAt: string | null;
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

export type PetSex = "female" | "male" | "unknown";
export interface Pet {
  id: number;
  name: string;
  avatarUrl: string;
  sex: PetSex | null;
  birthday: string | null;
  adoptionDate: string | null;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CatEventType = "deworming" | "grooming" | "care" | "note" | "cleaning" | "shared_note";
export interface CatEvent {
  id: number;
  petId: number | null;
  eventType: CatEventType;
  occurredAt: string;
  title: string;
  note: string;
  sourceType: string | null;
  sourceId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatSymptom {
  id: number;
  petId: number;
  occurredAt: string;
  title: string;
  severity: string;
  description: string;
  bodyArea: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatVetVisit {
  id: number;
  petId: number;
  occurredAt: string;
  clinic: string;
  doctor: string;
  reason: string;
  symptoms: string;
  diagnosis: string;
  examinations: string;
  treatment: string;
  prescriptions: string;
  cost: number | null;
  followUpAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatMedication {
  id: number;
  petId: number;
  name: string;
  dose: string;
  unit: string;
  frequencyText: string;
  startedAt: string;
  endedAt: string | null;
  reason: string;
  active: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatMeasurement {
  id: number;
  petId: number;
  occurredAt: string;
  measurementType: string;
  value: number;
  unit: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type CatRecordKind = "event" | "symptom" | "vet_visit" | "medication" | "measurement";
export interface CatTimelineEntry {
  id: number;
  kind: CatRecordKind;
  petId: number | null;
  occurredAt: string;
  eventType: string;
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export type ReminderTargetType = "cat" | "cat_household" | "tracker";
export type ReminderScheduleType = "one_time" | "interval" | "course";
export type ReminderIntervalUnit = "hour" | "day" | "week" | "month";
export type CatRoutineScope = "cat" | "household";
export type NotificationStatus = "scheduled" | "sent" | "cancelled" | "failed" | "completed";
export type NotificationDeliveryStatus = "sent" | "failed" | "cancelled";
export type ReminderOccurrenceAction = "completed" | "skipped";
export interface CatRoutine {
  id: number;
  scope: CatRoutineScope;
  petId: number | null;
  title: string;
  intervalValue: number;
  intervalUnit: ReminderIntervalUnit;
  firstDueAt: string;
  lastCompletedAt: string | null;
  nextDueAt: string;
  reminderLeadMinutes: number;
  notes: string;
  enabled: boolean;
  reminderId: number | null;
  createdAt: string;
  updatedAt: string;
}
export interface Reminder {
  id: number;
  title: string;
  targetType: ReminderTargetType;
  targetId: number | null;
  sourceType: string | null;
  sourceId: number | null;
  scheduleType: ReminderScheduleType;
  startsAt: string;
  nextDueAt: string | null;
  intervalValue: number | null;
  intervalUnit: ReminderIntervalUnit | null;
  timesOfDay: string[];
  endsAt: string | null;
  timezone: string;
  note: string;
  leadTimeMinutes: number;
  status: NotificationStatus;
  isActive: boolean;
  lastCompletedAt: string | null;
  snoozedUntil: string | null;
  lastNotifiedAt: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderOccurrence {
  id: number;
  reminderId: number;
  action: ReminderOccurrenceAction;
  scheduledFor: string;
  actedAt: string;
  createdEventId: number | null;
  createdAt: string;
}

export interface DueReminder extends Reminder {
  subjectLabel: string;
  dueAt: string;
  overdueMs: number;
}

export interface ScheduledNotification extends Reminder {
  subjectLabel: string;
  scheduledAt: string;
  sourceLabel: string;
  isRoutine: boolean;
}

export interface NotificationDelivery {
  id: number;
  reminderId: number | null;
  title: string;
  sourceType: string | null;
  sourceId: number | null;
  targetType: ReminderTargetType;
  targetId: number | null;
  scheduledAt: string;
  sentAt: string | null;
  status: NotificationDeliveryStatus;
  createdAt: string;
}

export interface PushSubscriptionRecord {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
  lastUsedAt: string;
}
