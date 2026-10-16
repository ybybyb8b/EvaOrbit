import type { FoodPlace, FoodLog } from "./types";

export function mergePlaceAddress(address = "", location = "") {
  const detail = address.trim(), area = location.trim();
  if (!area || detail.toLocaleLowerCase().includes(area.toLocaleLowerCase())) return detail;
  return [area, detail].filter(Boolean).join(" · ");
}

export function placeRecordLabel(record: Pick<FoodLog, "foodPlaceName" | "foodPlaceBranch" | "foodPlaceCity">) {
  const name = record.foodPlaceName?.trim() ?? "";
  const detail = record.foodPlaceBranch?.trim() || record.foodPlaceCity?.trim() || "";
  return [name, detail && !name.includes(detail) ? detail : ""].filter(Boolean).join(" · ");
}

export function canonicalPlace(place: FoodPlace): FoodPlace {
  return { ...place, address: mergePlaceAddress(place.address, place.location), location: "" };
}

export const placeServiceLabels = { food: "吃", drink: "喝", both: "吃喝都有" } as const;
export const placeKindLabels = { restaurant: "餐饮", drink: "饮品", retail: "零售", homemade: "Homemade / 自制", other: "其他" } as const;
export const placeScopeLabels = { brand: "品牌 / 来源", branch: "具体门店", virtual: "虚拟地点" } as const;
export function defaultPlaceScope(kind: FoodPlace["kind"]): NonNullable<FoodPlace["scope"]> {
  return kind === "homemade" ? "virtual" : kind === "drink" || kind === "retail" ? "brand" : "branch";
}
export function placeSupports(place: Pick<FoodPlace, "serviceType">, kind: "food" | "drink") {
  return (place.serviceType ?? "food") === "both" || (place.serviceType ?? "food") === kind;
}
