import type { DrinkInputSuggestions, DrinkLog } from "./types";
import { buildHistorySuggestions } from "./history-suggestions.ts";

export function buildDrinkInputSuggestions(logs: DrinkLog[]): DrinkInputSuggestions {
  return {
    names: buildHistorySuggestions(logs, (log) => log.name, (log) => log.occurredAt),
    brands: buildHistorySuggestions(logs, (log) => log.brand, (log) => log.occurredAt),
  };
}
