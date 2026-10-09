import { drinkRecordName } from "./drink-display.ts";
import type { DrinkLog, DrinkPreferenceSummary, DrinkTemperature, DrinkType, TasteRating } from "./types";

const ratingWeights: Record<TasteRating, number> = { love: 2, good: 1, neutral: -1, dislike: -2 };

function rankedCounts<T extends string>(values: T[], limit = 3) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, limit);
}

function daysSince(value: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / 86_400_000));
}

export function drinkIdentity(log: DrinkLog) {
  if(log.drinkMenuId)return `menu:${log.drinkMenuId}`;
  if(log.foodLibraryId)return `library:${log.foodLibraryId}`;
  return `${log.foodPlaceId?`place:${log.foodPlaceId}`:log.brand.trim().toLocaleLowerCase()}\u0000${log.name.trim().toLocaleLowerCase()}`;
}

export function buildDrinkPreferenceSummary(logs: DrinkLog[], now = new Date()): DrinkPreferenceSummary {
  const sorted = [...logs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id);
  const groups = new Map<string, { name: string; brand: string; logs: DrinkLog[] }>();
  for (const log of sorted) {
    const name = (log.drinkMenuName || log.name).trim(); if (!name) continue; const brand = log.brand.trim(); const key = drinkIdentity(log);
    const group = groups.get(key) ?? { name, brand, logs: [] }; group.logs.push(log); groups.set(key, group);
  }
  const commonDrinks = [...groups.values()].map((group) => ({ name: group.name, brand: group.brand, ...(group.logs[0].drinkMenuId||group.logs[0].foodLibraryId||group.logs[0].foodPlaceId?{sourceKey:drinkIdentity(group.logs[0])}:{}), count: group.logs.length })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3);
  const preferredDrinks = [...groups.values()].map((group) => {
    const rated = group.logs.filter((log) => log.rating !== null);
    const ratingAverage = rated.length ? rated.reduce((sum, log) => sum + ratingWeights[log.rating!], 0) / rated.length : 0;
    const repurchase = Math.min(Math.max(group.logs.length - 1, 0) * 0.35, 1.4);
    const age = daysSince(group.logs[0].occurredAt, now);
    const recency = age <= 14 ? 1 : age <= 60 ? 0.5 : 0;
    return { name: group.name, brand: group.brand, ...(group.logs[0].drinkMenuId||group.logs[0].foodLibraryId||group.logs[0].foodPlaceId?{sourceKey:drinkIdentity(group.logs[0])}:{}), count: group.logs.length, score: Number((ratingAverage * 2 + repurchase + recency).toFixed(2)), ratingCount: rated.length };
  }).filter((item) => item.ratingCount > 0 && item.score > 0).sort((a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3);
  return {
    totalRecords: logs.length,
    commonTypes: rankedCounts(sorted.map((log) => log.drinkType as DrinkType)),
    commonDrinks,
    preferredDrinks,
    commonBrands: rankedCounts(sorted.map((log) => log.brand.trim()).filter(Boolean)),
    sugarTendency: rankedCounts(sorted.map((log) => log.sugarLevel.trim()).filter(Boolean)),
    temperatureTendency: rankedCounts(sorted.map((log) => log.temperature).filter((value): value is DrinkTemperature => value !== null)),
    recent: sorted.slice(0, 4).map((log) => ({ ...log, name: drinkRecordName(log) })),
  };
}
