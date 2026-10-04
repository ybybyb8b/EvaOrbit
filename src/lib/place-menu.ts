import type { FoodPlace } from "./types";

export const placeServiceLabels = { food: "吃", drink: "喝", both: "吃喝都有" } as const;
export const placeKindLabels = { restaurant: "餐饮", drink: "饮品", retail: "零售", homemade: "Homemade / 自制", other: "其他" } as const;
export const placeScopeLabels = { brand: "品牌 / 来源", branch: "具体门店", virtual: "虚拟地点" } as const;
export function defaultPlaceScope(kind: FoodPlace["kind"]): NonNullable<FoodPlace["scope"]> {
  return kind === "homemade" ? "virtual" : kind === "drink" || kind === "retail" ? "brand" : "branch";
}
export function placeSupports(place: Pick<FoodPlace, "serviceType">, kind: "food" | "drink") {
  return (place.serviceType ?? "food") === "both" || (place.serviceType ?? "food") === kind;
}
