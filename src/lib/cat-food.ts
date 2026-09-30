import type { CatFoodCadenceSuggestion, CatFoodItem, CatFoodPricePoint, CatFoodPurchase, CatFoodSummary } from "./types";

const DAY_MS = 86_400_000;

function dayNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function normalizedCatFoodPrice(purchase: CatFoodPurchase) {
  const total = purchase.packageCount * purchase.amountPerPackage;
  const scale = purchase.amountUnit === "piece" ? 1 : 1000;
  return {
    normalizedPriceMinor: Math.round((purchase.paidAmountMinor / total) * scale),
    normalizedUnit: purchase.amountUnit === "g" ? "kg" as const : purchase.amountUnit === "ml" ? "L" as const : "piece" as const,
  };
}

export function catFoodCadenceSuggestion(purchases: CatFoodPurchase[]): CatFoodCadenceSuggestion | null {
  const dates = [...new Set(purchases.map((item) => item.purchasedOn))].sort();
  if (dates.length < 4) return null;
  const recent = dates.slice(-6);
  const intervals = recent.slice(1).map((date, index) => dayNumber(date) - dayNumber(recent[index])).filter((days) => days > 0);
  if (intervals.length < 3) return null;
  const ordered = [...intervals].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 ? ordered[middle] : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
  const tolerance = Math.max(7, Math.round(median * .2));
  return intervals.every((days) => Math.abs(days - median) <= tolerance) ? { intervalDays: median, intervals } : null;
}

export function buildCatFoodSummary(item: CatFoodItem, purchases: CatFoodPurchase[]): CatFoodSummary {
  const ascending = [...purchases].sort((a, b) => a.purchasedOn.localeCompare(b.purchasedOn) || a.id - b.id);
  const bestByUnit = new Map<string, number>();
  for (const purchase of ascending) {
    const price = normalizedCatFoodPrice(purchase);
    bestByUnit.set(price.normalizedUnit, Math.min(bestByUnit.get(price.normalizedUnit) ?? Number.POSITIVE_INFINITY, price.normalizedPriceMinor));
  }
  const previousByUnit = new Map<string, number>();
  const points = ascending.map((purchase): CatFoodPricePoint => {
    const price = normalizedCatFoodPrice(purchase);
    const previous = previousByUnit.get(price.normalizedUnit);
    previousByUnit.set(price.normalizedUnit, price.normalizedPriceMinor);
    return {
      ...purchase,
      ...price,
      changePercent: previous ? Math.round(((price.normalizedPriceMinor - previous) / previous) * 1000) / 10 : null,
      isBestPrice: price.normalizedPriceMinor === bestByUnit.get(price.normalizedUnit),
    };
  }).reverse();
  const stockByUnit: CatFoodSummary["stockByUnit"] = {};
  for (const purchase of purchases) stockByUnit[purchase.amountUnit] = (stockByUnit[purchase.amountUnit] ?? 0) + purchase.remainingPackageCount * purchase.amountPerPackage;
  const stockPackages = purchases.reduce((sum, purchase) => sum + purchase.remainingPackageCount, 0);
  const latestPurchase = points[0] ?? null;
  return {
    ...item,
    purchases: points,
    latestPurchase,
    bestPriceMinor: latestPurchase ? bestByUnit.get(latestPurchase.normalizedUnit) ?? null : null,
    stockPackages,
    stockByUnit,
    cadenceSuggestion: catFoodCadenceSuggestion(purchases),
    stockState: stockPackages === 0 ? "empty" : stockPackages <= item.lowStockThresholdPackages ? "low" : "available",
  };
}

