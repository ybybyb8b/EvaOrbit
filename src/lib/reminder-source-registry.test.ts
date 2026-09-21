import assert from "node:assert/strict";
import test from "node:test";
import { reminderSourceAllows, reminderSourceDefinition, REMINDER_SOURCE_REGISTRY } from "./reminder-source-registry.ts";

test("Reminder source registry keeps deterministic and conditional channels separate", () => {
  for (const source of [null, "cat_routine", "vet_visit", "medication", "tracker_standard", "subscription_renewal", "task_due", "task_reminder"]) {
    assert.equal(reminderSourceAllows(source, "native_local"), true);
    assert.equal(reminderSourceAllows(source, "web_push"), true);
  }
  for (const source of ["tracker_missing", "period_medication", "meal_missing", "weight_missing"]) {
    assert.equal(reminderSourceAllows(source, "native_local"), false);
    assert.equal(reminderSourceAllows(source, "web_push"), true);
  }
  assert.equal(reminderSourceDefinition("period_medication").projectionOwner, "medication_preset");
  assert.equal(reminderSourceDefinition("task_due").projectionOwner, "task");
  assert.equal(reminderSourceDefinition("task_reminder").projectionOwner, "task");
  assert.equal(reminderSourceDefinition("unregistered").channels.length, 0);
  assert.equal(Object.keys(REMINDER_SOURCE_REGISTRY).length, 12);
});
