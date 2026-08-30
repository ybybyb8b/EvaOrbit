import "server-only";

import { createMcpHandler, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ConflictError } from "../errors";
import { withMcpRepository } from "../repositories";
import { createDrinkLog, deleteDrinkLog, listDrinkLogs, updateDrinkLog } from "../services/drink";
import { createFoodLog, deleteFoodLog, listFoodLogs, removeFoodLibraryItem, searchFoodLibrary, updateFoodLog, updateFoodLibraryItem, upsertFoodLibraryItem } from "../services/food";
import { getDailyNutritionSummary, updateDailyEnergy } from "../services/nutrition";
import { createTrackerEntry, getTrackerDetail, listTrackerSummaries } from "../services/tracker";
import { SUGAR_LEVELS } from "../types";
import type { DrinkLog, FoodLibraryItem, FoodLog } from "../types";
import { parseDailyEnergy, parseDrinkLogPatch, parseFoodLibraryItem, parseFoodLibraryItemPatch, parseFoodLogPatch, parseNewDrinkLog, parseNewFoodLog, parseNewTrackerEntry, ValidationError } from "../validation";
import { resourceRegistry } from "./resource-registry.server";
import { registerGenericResourceTools } from "./resource-tools";

export const MCP_TOOL_NAMES = [
  "food_search_recent", "food_create", "food_update", "food_delete", "food_library_search", "food_library_create", "food_library_update", "food_library_delete", "drink_search_recent", "drink_create", "drink_update", "drink_delete", "nutrition_get_daily_summary", "daily_energy_upsert", "tracker_list", "tracker_create_entry",
  "eo_resources", "eo_schema", "eo_search", "eo_get", "eo_create", "eo_update", "eo_delete", "eo_action",
] as const;

const mealType = z.enum(["breakfast", "lunch", "dinner", "snack", "late_night"]);
const scene = z.enum(["home", "delivery", "restaurant", "packaged_food", "other"]);
const confidence = z.enum(["high", "medium", "low"]);
const drinkType = z.enum(["coffee", "milk_tea", "tea", "soda", "juice", "water", "alcohol", "other"]);
const sugarLevel = z.enum(SUGAR_LEVELS).or(z.literal(""));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const occurredAt = z.string().datetime({ offset: true });
const optionalKcal = z.number().min(0).max(100000).nullable().optional();
const foodLibraryCategory = z.enum(["staple", "dish", "snack", "drink", "other"]);
const foodLibraryReferenceType = z.enum(["per_100g", "per_100ml", "per_serving"]);
const foodLibraryDataSource = z.enum(["package_label", "official", "estimated", "manual"]);

const foodFields = {
  occurred_at: occurredAt.optional(), meal_type: mealType.optional(), title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(), portion: z.string().max(200).optional(), scene: scene.optional(),
  estimated_kcal: optionalKcal, kcal_min: optionalKcal, kcal_max: optionalKcal, confidence: confidence.optional(), notes: z.string().max(2000).optional(),
};
const drinkFields = {
  occurred_at: occurredAt.optional(), name: z.string().trim().min(1).max(200), brand: z.string().max(120).optional(), drink_type: drinkType.optional(),
  volume_ml: z.number().min(0).max(10000).nullable().optional(), sugar_level: sugarLevel.optional(), caffeine_mg: z.number().min(0).max(5000).nullable().optional(),
  estimated_kcal: optionalKcal, kcal_min: optionalKcal, kcal_max: optionalKcal, confidence: confidence.optional(), notes: z.string().max(2000).optional(),
};
const foodLibraryFields = {
  name: z.string().trim().min(1).max(200), brand: z.string().max(120).optional(), category: foodLibraryCategory.optional(),
  default_portion: z.string().max(160).optional(), reference_type: foodLibraryReferenceType.optional(),
  reference_energy_kj: z.number().min(0).max(100000).nullable().optional(), reference_kcal: z.number().min(0).max(100000).nullable().optional(),
  serving_weight: z.number().min(0).max(100000).nullable().optional(), serving_kcal: z.number().min(0).max(100000).nullable().optional(),
  data_source: foodLibraryDataSource.optional(), notes: z.string().max(2000).optional(),
};
const foodLibraryPatchFields = { ...foodLibraryFields, name: foodLibraryFields.name.optional() };

function compactFood(record: FoodLog) {
  return { id: record.id, occurred_at: record.occurredAt, meal_type: record.mealType, title: record.title, description: record.description, portion: record.portion, estimated_kcal: record.estimatedKcal, kcal_min: record.kcalMin, kcal_max: record.kcalMax, confidence: record.confidence, notes: record.notes };
}

function compactDrink(record: DrinkLog) {
  return { id: record.id, occurred_at: record.occurredAt, name: record.name, brand: record.brand, drink_type: record.drinkType, volume_ml: record.volumeMl, sugar_level: record.sugarLevel, caffeine_mg: record.caffeineMg, estimated_kcal: record.estimatedKcal, kcal_min: record.kcalMin, kcal_max: record.kcalMax, confidence: record.confidence, notes: record.notes };
}

function compactFoodLibrary(item: FoodLibraryItem) {
  return {
    id: item.id, name: item.name, brand: item.brand, category: item.category, default_portion: item.defaultPortion,
    reference_type: item.referenceType, reference_energy_kj: item.referenceEnergyKj, reference_kcal: item.referenceKcal,
    serving_weight: item.servingWeight, serving_kcal: item.servingKcal, data_source: item.dataSource, notes: item.notes,
    updated_at: item.updatedAt,
  };
}

function compactNutrition(summary: Awaited<ReturnType<typeof getDailyNutritionSummary>>) {
  return {
    date: summary.date, estimated_intake_kcal: summary.estimatedIntakeKcal, intake_min: summary.intakeMin, intake_max: summary.intakeMax,
    confidence: summary.confidence, resting_energy_kcal: summary.restingEnergyKcal, active_energy_kcal: summary.activeEnergyKcal,
    total_expenditure_kcal: summary.totalExpenditureKcal, energy_balance: summary.energyBalance,
    energy_balance_min: summary.energyBalanceMin, energy_balance_max: summary.energyBalanceMax, notes: summary.notes,
  };
}

function success(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function safeError(error: unknown) {
  if (error instanceof ValidationError || error instanceof ConflictError) return error.message;
  return "EvaOrbit could not complete this request.";
}

async function runTool(action: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try { return success(await withMcpRepository(action)); }
  catch (error) { return failure(safeError(error)); }
}

function foodInput(input: z.infer<z.ZodObject<typeof foodFields>>) {
  return { occurredAt: input.occurred_at, mealType: input.meal_type, title: input.title, description: input.description, portion: input.portion, scene: input.scene, estimatedKcal: input.estimated_kcal, kcalMin: input.kcal_min, kcalMax: input.kcal_max, confidence: input.confidence, notes: input.notes };
}

function drinkInput(input: z.infer<z.ZodObject<typeof drinkFields>>) {
  return { occurredAt: input.occurred_at, name: input.name, brand: input.brand, drinkType: input.drink_type, volumeMl: input.volume_ml, sugarLevel: input.sugar_level, caffeineMg: input.caffeine_mg, estimatedKcal: input.estimated_kcal, kcalMin: input.kcal_min, kcalMax: input.kcal_max, confidence: input.confidence, notes: input.notes };
}

function foodLibraryInput(input: Record<string, unknown>) {
  return {
    name: input.name, brand: input.brand, category: input.category, defaultPortion: input.default_portion,
    referenceType: input.reference_type, referenceEnergyKj: input.reference_energy_kj, referenceKcal: input.reference_kcal,
    servingWeight: input.serving_weight, servingKcal: input.serving_kcal, dataSource: input.data_source, notes: input.notes,
  };
}

function createServer() {
  const server = new McpServer({ name: "eva-orbit", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.registerTool("food_search_recent", { description: "Find recent EvaOrbit food records.", inputSchema: z.object({ query: z.string().max(200).optional(), date: date.optional(), meal_type: mealType.optional(), limit: z.number().int().min(1).max(50).default(10) }) },
    async ({ query, date: day, meal_type, limit }) => runTool(async () => ({ records: (await listFoodLogs({ query, date: day, mealType: meal_type })).slice(0, limit).map(compactFood) })));

  server.registerTool("food_create", { description: "Create one EvaOrbit food record.", inputSchema: z.object(foodFields) },
    async (input) => runTool(async () => ({ record: compactFood(await createFoodLog(parseNewFoodLog(foodInput(input)))) })));

  server.registerTool("food_update", { description: "Update an existing EvaOrbit food record by ID.", inputSchema: z.object({ id: z.number().int().positive(), ...foodFields, title: foodFields.title.optional() }) },
    async ({ id, ...input }) => runTool(async () => { const record = await updateFoodLog(id, parseFoodLogPatch(foodInput(input as z.infer<z.ZodObject<typeof foodFields>>))); if (!record) throw new ConflictError("Food record not found."); return { record: compactFood(record) }; }));

  server.registerTool("food_delete", { description: "Delete one EvaOrbit food record by its exact ID.", inputSchema: z.object({ id: z.number().int().positive() }) },
    async ({ id }) => runTool(async () => { if (!await deleteFoodLog(id)) throw new ConflictError("Food record not found."); return { deleted: true, id }; }));

  server.registerTool("food_library_search", { description: "Search active EvaOrbit Food Library items by query, name, brand, or category.", inputSchema: z.object({
    query: z.string().trim().max(200).optional(), keyword: z.string().trim().max(200).optional(), name: z.string().trim().max(200).optional(),
    brand: z.string().trim().max(120).optional(), category: foodLibraryCategory.optional(), limit: z.number().int().min(1).max(100).default(20),
  }).strict() },
    async ({ query, keyword, name, brand, category, limit }) => runTool(async () => ({
      items: (await searchFoodLibrary(query || keyword || "", brand ?? "", { name, category, limit })).map(compactFoodLibrary),
    })));

  server.registerTool("food_library_create", { description: "Create one EvaOrbit Food Library item.", inputSchema: z.object(foodLibraryFields).strict() },
    async (input) => runTool(async () => ({ item: compactFoodLibrary(await upsertFoodLibraryItem(parseFoodLibraryItem(foodLibraryInput(input)))) })));

  server.registerTool("food_library_update", { description: "Patch one EvaOrbit Food Library item by its exact ID.", inputSchema: z.object({ id: z.number().int().positive(), ...foodLibraryPatchFields }).strict() },
    async ({ id, ...input }) => runTool(async () => {
      const item = await updateFoodLibraryItem(id, parseFoodLibraryItemPatch(foodLibraryInput(input)));
      if (!item) throw new ConflictError("Food Library item not found.");
      return { item: compactFoodLibrary(item) };
    }));

  server.registerTool("food_library_delete", { description: "Delete or archive one EvaOrbit Food Library item by its exact ID.", inputSchema: z.object({ id: z.number().int().positive() }).strict() },
    async ({ id }) => runTool(async () => {
      const result = await removeFoodLibraryItem(id);
      if (!result) throw new ConflictError("Food Library item not found.");
      return { id: result.id, action: result.action };
    }));

  server.registerTool("drink_search_recent", { description: "Find recent EvaOrbit drink records.", inputSchema: z.object({ query: z.string().max(200).optional(), date: date.optional(), drink_type: drinkType.optional(), limit: z.number().int().min(1).max(50).default(10) }) },
    async ({ query, date: day, drink_type, limit }) => runTool(async () => ({ records: (await listDrinkLogs({ query, date: day, drinkType: drink_type })).slice(0, limit).map(compactDrink) })));

  server.registerTool("drink_create", { description: "Create one EvaOrbit drink record.", inputSchema: z.object(drinkFields) },
    async (input) => runTool(async () => { const result = await createDrinkLog(parseNewDrinkLog(drinkInput(input))); return { record: compactDrink(result.drink), limits: result.limits }; }));

  server.registerTool("drink_update", { description: "Update an existing EvaOrbit drink record by ID.", inputSchema: z.object({ id: z.number().int().positive(), ...drinkFields, name: drinkFields.name.optional() }) },
    async ({ id, ...input }) => runTool(async () => { const result = await updateDrinkLog(id, parseDrinkLogPatch(drinkInput(input as z.infer<z.ZodObject<typeof drinkFields>>))); if (!result) throw new ConflictError("Drink record not found."); return { record: compactDrink(result.drink), limits: result.limits }; }));

  server.registerTool("drink_delete", { description: "Delete one EvaOrbit drink record by its exact ID.", inputSchema: z.object({ id: z.number().int().positive() }) },
    async ({ id }) => runTool(async () => { if (!await deleteDrinkLog(id)) throw new ConflictError("Drink record not found."); return { deleted: true, id }; }));

  server.registerTool("nutrition_get_daily_summary", { description: "Get EvaOrbit's calculated nutrition summary for one date.", inputSchema: z.object({ date }) },
    async ({ date: day }) => runTool(async () => compactNutrition(await getDailyNutritionSummary(day))));

  server.registerTool("daily_energy_upsert", { description: "Create or replace EvaOrbit resting and active energy values for one date, such as a daily Apple Health import.", inputSchema: z.object({
    date, resting_energy_kcal: z.number().min(0).max(20000).nullable(), active_energy_kcal: z.number().min(0).max(20000).nullable(), notes: z.string().max(2000).optional(),
  }).strict() },
    async ({ date: day, resting_energy_kcal, active_energy_kcal, notes }) => runTool(async () => {
      const parsed = parseDailyEnergy({ date: day, restingEnergyKcal: resting_energy_kcal, activeEnergyKcal: active_energy_kcal, notes: notes ?? "" });
      return compactNutrition(await updateDailyEnergy(parsed.date, parsed));
    }));

  server.registerTool("tracker_list", { description: "List available EvaOrbit Trackers and their detail fields.", inputSchema: z.object({}) },
    async () => runTool(async () => ({ trackers: await Promise.all((await listTrackerSummaries()).map(async (tracker) => { const detail = await getTrackerDetail(tracker.id); return { id: tracker.id, name: tracker.name, group: tracker.groupName, quick_capture_enabled: tracker.quickCaptureEnabled, fields: detail?.fields.filter((field) => !field.archivedAt).map((field) => ({ key: field.key, name: field.name, type: field.type, required: field.required, options: field.options, unit: field.unit })) ?? [] }; })) })));

  server.registerTool("tracker_create_entry", { description: "Create a point-in-time entry for one EvaOrbit Tracker.", inputSchema: z.object({ tracker_id: z.number().int().positive(), occurred_at: occurredAt.optional(), detail_fields: z.record(z.string(), z.unknown()).optional(), note: z.string().max(5000).optional() }) },
    async ({ tracker_id, occurred_at, detail_fields, note }) => runTool(async () => { const entry = await createTrackerEntry(parseNewTrackerEntry({ occurredAt: occurred_at, values: detail_fields ?? {}, note: note ?? "" }, tracker_id)); return { record: { id: entry.id, tracker_id: entry.trackerId, occurred_at: entry.occurredAt, detail_fields: entry.values, note: entry.note } }; }));

  registerGenericResourceTools(server, runTool, resourceRegistry);

  return server;
}

export const mcpHandler = createMcpHandler(createServer, { responseMode: "json", legacy: "stateless" });
