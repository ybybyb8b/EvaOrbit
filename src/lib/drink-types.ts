import type { DrinkType } from "./types";

export const DRINK_TYPES = ["coffee", "milk_tea", "tea", "soda", "juice", "alcohol", "other"] as const;
export const DRINK_TYPE_OPTIONS: [Exclude<DrinkType, "water">, string][] = [["coffee", "咖啡"], ["milk_tea", "奶茶"], ["tea", "茶"], ["soda", "汽水"], ["juice", "果汁"], ["alcohol", "酒"], ["other", "其他"]];
