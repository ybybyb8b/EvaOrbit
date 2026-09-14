export type ReminderDeliveryChannel = "native_local" | "web_push";
export type ReminderDomainRule = "scheduled" | "tracker_missing" | "period_medication" | "missing_record";
export type ReminderProjectionOwner = "reminder" | "cat_routine" | "tracker" | "subscription" | "task" | "medication_preset" | "meal_rule" | "weight_settings" | "unknown";

export type ReminderSourceDefinition = {
  sourceType: string | null;
  businessFact: string;
  projectionOwner: ReminderProjectionOwner;
  domainRule: ReminderDomainRule;
  label: string;
  channels: readonly ReminderDeliveryChannel[];
};

const localAndPush = ["native_local", "web_push"] as const;
const pushOnly = ["web_push"] as const;

export const REMINDER_SOURCE_REGISTRY = {
  manual: { sourceType: null, businessFact: "reminder", projectionOwner: "reminder", domainRule: "scheduled", label: "Reminder", channels: localAndPush },
  cat_routine: { sourceType: "cat_routine", businessFact: "cat_routine", projectionOwner: "cat_routine", domainRule: "scheduled", label: "Routine", channels: localAndPush },
  vet_visit: { sourceType: "vet_visit", businessFact: "vet_visit", projectionOwner: "reminder", domainRule: "scheduled", label: "Cats", channels: localAndPush },
  medication: { sourceType: "medication", businessFact: "cat_medication", projectionOwner: "reminder", domainRule: "scheduled", label: "Cats", channels: localAndPush },
  tracker_standard: { sourceType: "tracker_standard", businessFact: "tracker_reminder", projectionOwner: "tracker", domainRule: "scheduled", label: "Tracker", channels: localAndPush },
  tracker_missing: { sourceType: "tracker_missing", businessFact: "tracker_entries", projectionOwner: "tracker", domainRule: "tracker_missing", label: "Tracker · Missing", channels: pushOnly },
  subscription_renewal: { sourceType: "subscription_renewal", businessFact: "subscription", projectionOwner: "subscription", domainRule: "scheduled", label: "Subscriptions", channels: localAndPush },
  task_due: { sourceType: "task_due", businessFact: "task", projectionOwner: "task", domainRule: "scheduled", label: "Tasks", channels: localAndPush },
  period_medication: { sourceType: "period_medication", businessFact: "period_and_medication_dose", projectionOwner: "medication_preset", domainRule: "period_medication", label: "Health", channels: pushOnly },
  meal_missing: { sourceType: "meal_missing", businessFact: "food_logs", projectionOwner: "meal_rule", domainRule: "missing_record", label: "Food · Missing", channels: pushOnly },
  weight_missing: { sourceType: "weight_missing", businessFact: "weight_records", projectionOwner: "weight_settings", domainRule: "missing_record", label: "Health · Missing", channels: pushOnly },
} as const satisfies Record<string, ReminderSourceDefinition>;

const bySourceType = new Map<string | null, ReminderSourceDefinition>(Object.values(REMINDER_SOURCE_REGISTRY).map((item) => [item.sourceType, item]));
const unknownSource: ReminderSourceDefinition = { sourceType: "unknown", businessFact: "unknown", projectionOwner: "unknown", domainRule: "scheduled", label: "Reminder", channels: [] };

export const PERIOD_MEDICATION_REMINDER_SOURCE = REMINDER_SOURCE_REGISTRY.period_medication.sourceType;

export function reminderSourceDefinition(sourceType: string | null | undefined) {
  return bySourceType.get(sourceType ?? null) ?? unknownSource;
}

export function reminderSourceAllows(sourceType: string | null | undefined, channel: ReminderDeliveryChannel) {
  return reminderSourceDefinition(sourceType).channels.includes(channel);
}

export function reminderSourceLabel(sourceType: string | null | undefined, targetType?: string) {
  const definition = reminderSourceDefinition(sourceType);
  if (definition.projectionOwner !== "reminder") return definition.label;
  if (targetType === "cat" || targetType === "cat_household") return "Cats";
  if (targetType === "tracker") return "Tracker";
  if (targetType === "health" || targetType === "health_record") return "Health";
  if (targetType === "subscription") return "Subscriptions";
  if (targetType === "task") return "Tasks";
  return definition.label;
}
