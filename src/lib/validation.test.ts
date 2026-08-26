import assert from "node:assert/strict";
import test from "node:test";
import { parseAiSettings, parseChatPreferences, parseChatRequest, parseDailyEnergy, parseDrinkLimit, parseFoodLibraryItem, parseMemoryPatch, parseNewDrinkLog, parseNewFoodLog, parseNewInbox, parseNewTask, parseTaskPatch, ValidationError } from "./validation.ts";

test("normalizes a new task", () => {
  assert.deepEqual(
    parseNewTask({ title: "  买咖啡  ", tags: ["生活", "生活", " "] }),
    { title: "买咖啡", notes: "", dueDate: null, priority: "medium", tags: ["生活"] },
  );
});

test("rejects invalid task fields", () => {
  assert.throws(() => parseNewTask({ title: "" }), ValidationError);
  assert.throws(() => parseTaskPatch({ completed: "yes" }), ValidationError);
});

test("requires at least one patch field", () => {
  assert.throws(() => parseMemoryPatch({}), ValidationError);
});

test("normalizes AI settings and checks URL", () => {
  const settings = parseAiSettings({ providerName: " Local ", baseUrl: "http://127.0.0.1:11434/v1/", model: "qwen3" });
  assert.equal(settings.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(settings.providerName, "Local");
  assert.equal(settings.responseLength, "balanced");
  assert.equal(settings.initiative, "quiet");
  assert.equal(settings.clearApiKey, false);
  assert.equal(parseAiSettings({ providerName: "x", baseUrl: "https://example.com", model: "x", apiKey: " new-key " }).apiKey, "new-key");
  assert.throws(() => parseAiSettings({ providerName: "x", baseUrl: "file:///tmp/key", model: "x" }), ValidationError);
  assert.throws(() => parseAiSettings({ providerName: "x", baseUrl: "https://example.com", model: "x", responseLength: "endless" }), ValidationError);
  assert.throws(() => parseAiSettings({ providerName: "x", baseUrl: "https://example.com", model: "x", apiKey: "" }), ValidationError);
  assert.throws(() => parseAiSettings({ providerName: "x", baseUrl: "https://example.com", model: "x", apiKey: "new-key", clearApiKey: true }), ValidationError);
});

test("checks chat request identifiers and content", () => {
  assert.deepEqual(parseChatRequest({ sessionId: 2, content: "  你好  " }), { sessionId: 2, content: "你好" });
  assert.throws(() => parseChatRequest({ sessionId: "2", content: "你好" }), ValidationError);
});

test("normalizes core life capture records", () => {
  assert.deepEqual(parseNewInbox({ content: "  先记着  " }), { content: "先记着", source: "manual" });
  const food = parseNewFoodLog({ occurredAt: "2026-08-25T12:00:00+08:00", title: "面", mealType: "lunch", estimatedKcal: 420, kcalMin: 360, kcalMax: 520 });
  assert.equal(food.occurredAt, "2026-08-25T04:00:00.000Z");
  assert.equal(food.confidence, "low");
  assert.throws(() => parseNewFoodLog({ title: "面", kcalMin: 600, kcalMax: 400 }), /热量下限/);
  const drink = parseNewDrinkLog({ name: "拿铁", drinkType: "coffee", volumeMl: 350 });
  assert.equal(drink.brand, "");
  assert.equal(drink.volumeMl, 350);
});

test("keeps food brands distinct and validates drink limits", () => {
  const item = parseFoodLibraryItem({ name: "燕麦奶", brand: "A 品牌", category: "drink", referenceType: "per_100ml", referenceKcal: 48, dataSource: "package_label" });
  assert.equal(item.brand, "A 品牌");
  assert.equal(item.referenceKcal, 48);
  assert.deepEqual(parseDrinkLimit({ name: "本周咖啡", targetType: "coffee", period: "weekly", limitValue: 3 }), { name: "本周咖啡", targetType: "coffee", period: "weekly", limitValue: 3, enabled: true });
  assert.throws(() => parseDrinkLimit({ name: "咖啡", targetType: "coffee", limitValue: 0 }), ValidationError);
});

test("validates daily energy settings without inventing values", () => {
  assert.deepEqual(parseDailyEnergy({ date: "2026-08-25", restingEnergyKcal: 1500, activeEnergyKcal: null }), { date: "2026-08-25", restingEnergyKcal: 1500, activeEnergyKcal: null, notes: "" });
  assert.throws(() => parseDailyEnergy({ date: "25/08/2026", restingEnergyKcal: 1500 }), ValidationError);
  assert.throws(() => parseDailyEnergy({ date: "2026-08-25", activeEnergyKcal: -1 }), ValidationError);
});

test("keeps conversation identity as a validated UI preference", () => {
  assert.deepEqual(parseChatPreferences({ userDisplayName: "E", userAvatarType: "emoji", userAvatarValue: "🌿", assistantDisplayName: "Orbit", assistantAvatarType: "image", assistantAvatarValue: "webp", showUserName: false, showAssistantName: true, showAvatars: true }), {
    userDisplayName: "E", userAvatarType: "emoji", userAvatarValue: "🌿", assistantDisplayName: "Orbit", assistantAvatarType: "image", assistantAvatarValue: "webp", showUserName: false, showAssistantName: true, showAvatars: true,
  });
  assert.throws(() => parseChatPreferences({ userDisplayName: "我", userAvatarType: "image", userAvatarValue: "svg", assistantDisplayName: "Eva" }), ValidationError);
  assert.throws(() => parseChatPreferences({ userDisplayName: "我", userAvatarType: "emoji", userAvatarValue: "", assistantDisplayName: "Eva" }), ValidationError);
});
