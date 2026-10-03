import type { FoodPlace } from "./types";

export const placeServiceLabels = { food: "吃", drink: "喝", both: "吃喝都有" } as const;
export function placeSupports(place: Pick<FoodPlace, "serviceType">, kind: "food" | "drink") {
  return (place.serviceType ?? "food") === "both" || (place.serviceType ?? "food") === kind;
}
