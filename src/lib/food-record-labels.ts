import type {MealType,FoodScene,TasteRating} from "./types";
export const meals: { value: MealType; label: string }[] = [{ value: "breakfast", label: "早餐" }, { value: "lunch", label: "午餐" }, { value: "dinner", label: "晚餐" }, { value: "snack", label: "加餐" }, { value: "late_night", label: "夜宵" }];
export const scenes: { value: FoodScene; label: string }[] = [{ value: "home", label: "自制" }, { value: "delivery", label: "外卖" }, { value: "restaurant", label: "外食" }, { value: "packaged_food", label: "包装食品" }, { value: "other", label: "其他" }];
export const tasteLabels: Record<TasteRating, string> = { love: "好吃", good: "还行", neutral: "一般", dislike: "难吃" };
