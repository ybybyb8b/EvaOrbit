import type { ResourceField } from "./resource-registry.ts";

export type ResourceActionSchema = {
  id_required: boolean;
  id_description: string;
  fields: Record<string, ResourceField>;
  required_fields: string[];
  validation_rules: string[];
  result_description: string;
};

const actedAt: ResourceField = { type: "string", format: "date-time", description: "Actual execution instant; omitted uses server time." };
const childId: ResourceField = { type: "integer", description: "Child identifier belonging to this Tracker." };
const date: ResourceField = { type: "string", format: "date", description: "Date in YYYY-MM-DD format." };

function action(fields: Record<string, ResourceField> = {}, required_fields: string[] = [], result_description = "Updated resource record.", validation_rules: string[] = []): ResourceActionSchema {
  return { id_required: true, id_description: "Owning resource record identifier.", fields, required_fields, validation_rules, result_description };
}

// These contracts are also the allowed-key boundary in ResourceRegistry.action.
export const resourceActionSchemas: Record<string, Record<string, ResourceActionSchema>> = {
  daily_energy: {
    upsert: {
      ...action({
        resting_energy_kcal: { type: "number", nullable: true, description: "Manual resting energy, 0-20000 kcal. null clears override." },
        active_energy_kcal: { type: "number", nullable: true, description: "Manual active energy, 0-20000 kcal. null clears override." },
        notes: { type: "string", max_length: 2000, description: "Replacement notes; omitted means empty." },
      }, ["resting_energy_kcal", "active_energy_kcal"], "Calculated nutrition summary with effective energy and manual/HealthKit provenance.", ["Replaces both manual energy values and notes; not PATCH."]),
      id_description: "Valid YYYY-MM-DD date.",
    },
  },
  memory_entity: {
    merge: action({ target_entity_id: { type: "string", format: "uuid", description: "Active target Entity UUID." } }, ["target_entity_id"], "Target Entity with redirected_facts and self_loops."),
    archive: action(), restore: action(),
  },
  memory_fact: {
    invalidate: action({ reason: { type: "string", nullable: true, max_length: 2000, description: "Optional correction or withdrawal reason." } }),
    restore: action(),
  },
  inbox: { mark_processed: action(), archive: action(), restore: action() },
  task: { complete: action(), reopen: action() },
  lucius_case: { record_recurrence: action({ occurred_date: date }, [], "Case with atomically updated recurrence counters and dates.") },
  relation_person: { archive: action(), restore: action() },
  relation_event: {
    settle_advance: {
      ...action({
        amount_minor: { type: "integer", description: "Repayment in integer fen." },
        occurred_at: { type: "string", format: "date-time", description: "Repayment instant or existing date-only anchor." },
        occurred_has_explicit_time: { type: "boolean", description: "Whether a time was explicitly entered." },
        note: { type: "string", description: "Optional repayment note." },
      }, ["amount_minor", "occurred_at", "occurred_has_explicit_time"], "New repayment Relation Event."),
      id_description: "Advance flow identifier, not the Relation Event identifier.",
    },
  },
  media: {
    add_viewing: action({ watched_date: date }, ["watched_date"], "New viewing record."),
    update_viewing: action({ viewing_id: { type: "integer", description: "Viewing identifier belonging to this Media." }, watched_date: date }, ["viewing_id", "watched_date"], "Updated viewing record."),
    delete_viewing: action({ viewing_id: { type: "integer", description: "Viewing identifier belonging to this Media." } }, ["viewing_id"], "deleted and viewing id."),
  },
  tracker: {
    create_field: action({
      name: { type: "string", max_length: 60, description: "Field name." },
      type: { type: "string", enum: ["number", "single_select", "multi_select", "text", "boolean", "rating", "time_range"], default: "text", description: "Field type." },
      required: { type: "boolean", default: false, description: "Required for detailed capture." },
      default_value: { type: "json", nullable: true, description: "Default matching the selected field type." },
      options: { type: "array", items: { type: "string" }, description: "Required for select types." },
      show_after_quick_capture: { type: "boolean", description: "Show after quick capture." },
      include_in_stats: { type: "boolean", description: "Include in statistics." },
      sort_order: { type: "number", description: "Display order, 0-10000." },
      unit: { type: "string", max_length: 20, description: "Display unit; time_range always uses min." },
      precision: { type: "integer", description: "Decimal precision, 0-6; time_range always uses 2." },
      config: { type: "object", description: "Field configuration." },
    }, ["name"], "New field record."),
    create_entry: action({
      occurred_at: { type: "string", format: "date-time", description: "Point-event instant; omitted uses server time." },
      values: { type: "object", description: "Values keyed by the Tracker field key or id; time_range uses {startAt,endAt}." },
      note: { type: "string", max_length: 5000, description: "Entry note." },
    }, [], "New entry record."),
    update_entry: action({
      entry_id: childId,
      occurred_at: { type: "string", format: "date-time", description: "Replacement point-event instant." },
      values: { type: "object", description: "Replacement values object; omitted preserves it." },
      note: { type: "string", max_length: 5000, description: "Entry note." },
    }, ["entry_id"], "Updated entry record.", ["At least one of occurred_at, values, or note is required."]),
    delete_field: action({ child_id: childId }, ["child_id"], "deleted and child id; field deletion uses the existing archive service."),
    delete_entry: action({ child_id: childId }, ["child_id"], "deleted and child id."),
    create_goal: action({
      operator: { type: "string", enum: ["<=", ">=", "="], default: "<=", description: "Compare entry count with the goal." },
      target_value: { type: "number", default: 1, description: "Target entry count, 0.01-100000." },
      period_type: { type: "string", enum: ["daily", "weekly", "monthly", "yearly", "custom"], default: "monthly", description: "Goal period." },
      custom_period: { type: "string", max_length: 200, description: "Existing custom period description; not a date range or field selector." },
      enabled: { type: "boolean", default: true, description: "Enabled flag." },
    }, [], "New count-goal record."),
    delete_goal: action({ child_id: childId }, ["child_id"], "deleted and child id."),
    create_reminder: action({
      reminder_mode: { type: "string", enum: ["standard", "missing"], default: "missing", description: "Standard or missing-record reminder." },
      configured_time: { type: "string", default: "20:00", description: "Explicit local HH:mm reminder time." },
      period_days: { type: "integer", default: 1, description: "Observation period in positive whole days." },
      anchor_date: { ...date, description: "Observation anchor date; omitted uses today's EvaOrbit date." },
      timezone: { type: "string", default: "Asia/Shanghai", description: "IANA timezone." },
      enabled: { type: "boolean", default: true, description: "Enabled flag." },
      reminder_type: { type: "string", enum: ["scheduled", "interval"], description: "Legacy alias: scheduled=standard, interval=missing; prefer reminder_mode." },
      time_of_day: { type: "string", description: "Legacy alias of configured_time." },
      interval_days: { type: "integer", description: "Legacy alias of period_days." },
    }, [], "New Tracker reminder rule including its linked reminder_id.", ["Do not send conflicting canonical and legacy aliases."]),
    delete_reminder: action({ child_id: childId }, ["child_id"], "deleted and child id; cancels the projected reminder."),
  },
  cat_routine: {
    complete: action({ acted_at: actedAt }, [], "Updated routine and recorded completion."),
    skip: action({ acted_at: actedAt }, [], "Updated routine and recorded skip."),
    archive: action({}, [], "archived and routine id."),
  },
  reminder: {
    complete: action({ acted_at: actedAt }, [], "Owner-dependent result; may complete a Task, record a payment, or advance a routine."),
    skip: action({ acted_at: actedAt }, [], "Owner-dependent skip result."),
    snooze: action({
      choice: { type: "string", enum: ["later_today", "tomorrow", "custom"], description: "Snooze choice." },
      custom: { type: "string", description: "Explicit custom snooze time; required for choice=custom." },
    }, ["choice"], "Updated reminder.", ["custom is required when choice=custom."]),
  },
  subscription: {
    pause: action(), end: action(),
    resume: action({ next_renewal_on: date }),
    record_payment: action({
      scheduled_for: date, paid_on: date,
      amount: { type: "number", description: "Actual payment in major currency units." },
      currency: { type: "string", description: "Three-letter currency code." },
      note: { type: "string", description: "Payment note." },
      update_current_price: { type: "boolean", description: "Also append a current-price change." },
    }, ["scheduled_for", "paid_on", "amount", "currency"], "New immutable actual-payment record."),
  },
};
