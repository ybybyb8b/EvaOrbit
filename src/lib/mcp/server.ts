import "server-only";

import { createMcpHandler, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ConflictError } from "../errors";
import { withMcpRepository } from "../repositories";
import { createDrinkLog, updateDrinkLog } from "../services/drink";
import { createFoodLog, listFoodLogs, updateFoodLog } from "../services/food";
import { getDailyNutritionSummary } from "../services/nutrition";
import { createTrackerEntry, getTrackerDetail, listTrackerSummaries } from "../services/tracker";
import type { DrinkLog, FoodLog } from "../types";
import { parseDrinkLogPatch, parseFoodLogPatch, parseNewDrinkLog, parseNewFoodLog, parseNewTrackerEntry, ValidationError } from "../validation";

export const MCP_TOOL_NAMES = [
  "food_search_recent", "food_create", "food_update", "drink_create", "drink_update", "nutrition_get_daily_summary", "tracker_list", "tracker_create_entry",
] as const;

const mealType = z.enum(["breakfast", "lunch", "dinner", "snack", "late_night"]);
const scene = z.enum(["home", "delivery", "restaurant", "packaged_food", "other"]);
const confidence = z.enum(["high", "medium", "low"]);
const drinkType = z.enum(["coffee", "milk_tea", "tea", "soda", "juice", "water", "alcohol", "other"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const occurredAt = z.string().datetime({ offset: true });
const optionalKcal = z.number().min(0).max(100000).nullable().optional();

const foodFields = {
  occurred_at: occurredAt.optional(), meal_type: mealType.optional(), title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(), portion: z.string().max(200).optional(), scene: scene.optional(),
  estimated_kcal: optionalKcal, kcal_min: optionalKcal, kcal_max: optionalKcal, confidence: confidence.optional(), notes: z.string().max(2000).optional(),
};
const drinkFields = {
  occurred_at: occurredAt.optional(), name: z.string().trim().min(1).max(200), brand: z.string().max(120).optional(), drink_type: drinkType.optional(),
  volume_ml: z.number().min(0).max(10000).nullable().optional(), sugar_level: z.string().max(80).optional(), caffeine_mg: z.number().min(0).max(5000).nullable().optional(),
  estimated_kcal: optionalKcal, kcal_min: optionalKcal, kcal_max: optionalKcal, confidence: confidence.optional(), notes: z.string().max(2000).optional(),
};

function compactFood(record: FoodLog) {
  return { id: record.id, occurred_at: record.occurredAt, meal_type: record.mealType, title: record.title, description: record.description, portion: record.portion, estimated_kcal: record.estimatedKcal, kcal_min: record.kcalMin, kcal_max: record.kcalMax, confidence: record.confidence, notes: record.notes };
}

function compactDrink(record: DrinkLog) {
  return { id: record.id, occurred_at: record.occurredAt, name: record.name, brand: record.brand, drink_type: record.drinkType, volume_ml: record.volumeMl, sugar_level: record.sugarLevel, caffeine_mg: record.caffeineMg, estimated_kcal: record.estimatedKcal, kcal_min: record.kcalMin, kcal_max: record.kcalMax, confidence: record.confidence, notes: record.notes };
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

function safeDiagnosticError(error: unknown) {
  if (!error || typeof error !== "object") return { error_name: "UnknownError" };
  const value = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  const message = typeof value.message === "string"
    ? value.message.replace(/https?:\/\/\S+/gi, "[redacted-url]").replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[redacted-email]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 300)
    : undefined;
  return { error_name: typeof value.name === "string" ? value.name : "Error", status: typeof value.status === "number" || typeof value.status === "string" ? value.status : undefined, code: typeof value.code === "string" ? value.code : undefined, message };
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

function createServer() {
  const server = new McpServer({ name: "eva-orbit", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.registerTool("food_search_recent", { description: "Find recent EvaOrbit food records.", inputSchema: z.object({ query: z.string().max(200).optional(), date: date.optional(), meal_type: mealType.optional(), limit: z.number().int().min(1).max(50).default(10) }) },
    async ({ query, date: day, meal_type, limit }) => runTool(async () => ({ records: (await listFoodLogs({ query, date: day, mealType: meal_type })).slice(0, limit).map(compactFood) })));

  server.registerTool("food_create", { description: "Create one EvaOrbit food record.", inputSchema: z.object(foodFields) },
    async (input) => runTool(async () => ({ record: compactFood(await createFoodLog(parseNewFoodLog(foodInput(input)))) })));

  server.registerTool("food_update", { description: "Update an existing EvaOrbit food record by ID.", inputSchema: z.object({ id: z.number().int().positive(), ...foodFields, title: foodFields.title.optional() }) },
    async ({ id, ...input }) => runTool(async () => { const record = await updateFoodLog(id, parseFoodLogPatch(foodInput(input as z.infer<z.ZodObject<typeof foodFields>>))); if (!record) throw new ConflictError("Food record not found."); return { record: compactFood(record) }; }));

  server.registerTool("drink_create", { description: "Create one EvaOrbit drink record.", inputSchema: z.object(drinkFields) },
    async (input) => runTool(async () => { const result = await createDrinkLog(parseNewDrinkLog(drinkInput(input))); return { record: compactDrink(result.drink), limits: result.limits }; }));

  server.registerTool("drink_update", { description: "Update an existing EvaOrbit drink record by ID.", inputSchema: z.object({ id: z.number().int().positive(), ...drinkFields, name: drinkFields.name.optional() }) },
    async ({ id, ...input }) => runTool(async () => { const result = await updateDrinkLog(id, parseDrinkLogPatch(drinkInput(input as z.infer<z.ZodObject<typeof drinkFields>>))); if (!result) throw new ConflictError("Drink record not found."); return { record: compactDrink(result.drink), limits: result.limits }; }));

  server.registerTool("nutrition_get_daily_summary", { description: "Get EvaOrbit's calculated nutrition summary for one date.", inputSchema: z.object({ date }) },
    async ({ date: day }) => runTool(async () => { const summary = await getDailyNutritionSummary(day); return { date: summary.date, estimated_intake_kcal: summary.estimatedIntakeKcal, intake_min: summary.intakeMin, intake_max: summary.intakeMax, confidence: summary.confidence, resting_energy_kcal: summary.restingEnergyKcal, active_energy_kcal: summary.activeEnergyKcal, total_expenditure_kcal: summary.totalExpenditureKcal, energy_balance: summary.energyBalance, energy_balance_min: summary.energyBalanceMin, energy_balance_max: summary.energyBalanceMax, notes: summary.notes }; }));

  server.registerTool("tracker_list", { description: "List available EvaOrbit Trackers and the detail fields accepted by native Trackers.", inputSchema: z.object({}) },
    async () => runTool(async () => {
      console.info("[mcp-diagnostic]", { stage: "tracker_list_query_start" });
      try {
        const trackers = await Promise.all((await listTrackerSummaries()).map(async (tracker) => { const detail = tracker.dataSourceType === "native_tracker" ? await getTrackerDetail(tracker.id) : null; return { id: tracker.id, name: tracker.name, group: tracker.groupName, data_source_type: tracker.dataSourceType, quick_capture_enabled: tracker.quickCaptureEnabled, fields: detail?.fields.filter((field) => !field.archivedAt).map((field) => ({ key: field.key, name: field.name, type: field.type, required: field.required, options: field.options, unit: field.unit })) ?? [] }; }));
        console.info("[mcp-diagnostic]", { stage: "tracker_list_query_success", trackers_count: trackers.length });
        return { trackers };
      } catch (error) {
        console.error("[mcp-diagnostic]", { stage: "tracker_list_query_failed", ...safeDiagnosticError(error) });
        throw error;
      }
    }));

  server.registerTool("tracker_create_entry", { description: "Create a point-in-time entry for one native EvaOrbit Tracker.", inputSchema: z.object({ tracker_id: z.number().int().positive(), occurred_at: occurredAt.optional(), detail_fields: z.record(z.string(), z.unknown()).optional(), note: z.string().max(5000).optional() }) },
    async ({ tracker_id, occurred_at, detail_fields, note }) => runTool(async () => { const entry = await createTrackerEntry(parseNewTrackerEntry({ occurredAt: occurred_at, values: detail_fields ?? {}, note: note ?? "" }, tracker_id)); return { record: { id: entry.id, tracker_id: entry.trackerId, occurred_at: entry.occurredAt, detail_fields: entry.values, note: entry.note } }; }));

  return server;
}

export const mcpHandler = createMcpHandler(createServer, { responseMode: "json", legacy: "stateless" });
