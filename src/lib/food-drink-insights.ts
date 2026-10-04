import type { FoodLog, DrinkLog, DrinkLimit, DrinkLimitStatus } from "./types";
import type { FoodDrinkEntry } from "./food-drink-timeline";
import { foodRecordDisplay } from "./food-record-display.ts";
import { drinkRecordName, drinkTypeLabels } from "./drink-display.ts";
import { buildDrinkPreferenceSummary } from "./drink-preferences.ts";
import { dateInEvaOrbit, shiftDate } from "./time.ts";

export interface FoodDrinkInsight { id: string; title: string; body: string; href?: string }
export interface FoodDrinkHomeData {
  date: string;
  brief: { foodCount: number; drinkCount: number; latest: FoodDrinkEntry | null };
  insights: FoodDrinkInsight[];
  window: { from: string; to: string; complete: boolean };
  limits: DrinkLimit[];
  limitStatuses: DrinkLimitStatus[];
}

const temperatureLabels = { normal_ice: "正常冰", less_ice: "少冰", no_ice: "去冰", room_temperature: "常温", hot: "热" };
const key = (value: string) => value.trim().toLocaleLowerCase();
function ranked(values: string[]) {
  const counts = new Map<string, { name: string; count: number }>();
  for (const value of values.filter(value => value.trim())) {
    const item = counts.get(key(value)) ?? { name: value.trim(), count: 0 }; item.count++; counts.set(key(value), item);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** A ranked shortlist of observed patterns, not an exhaustive statistics dashboard. */
export function buildFoodDrinkInsights(foods: FoodLog[], drinks: DrinkLog[], date = dateInEvaOrbit(), complete = true): FoodDrinkInsight[] {
  const recentFrom = shiftDate(date, -6), previousFrom = shiftDate(date, -13);
  const recent = <T extends FoodLog | DrinkLog>(rows: T[]) => rows.filter(row => { const day = dateInEvaOrbit(new Date(row.occurredAt)); return day >= recentFrom && day <= date; });
  const previous = <T extends FoodLog | DrinkLog>(rows: T[]) => rows.filter(row => { const day = dateInEvaOrbit(new Date(row.occurredAt)); return day >= previousFrom && day < recentFrom; });
  const rf = recent(foods), rd = recent(drinks), pf = previous(foods), pd = previous(drinks);
  if (rf.length + rd.length < 3) return [];
  const candidates: Array<FoodDrinkInsight & { score: number; group: string }> = [];
  function add(id: string, group: string, score: number, title: string, body: string, href?: string) { candidates.push({ id, group, score, title, body, ...(href ? { href } : {}) }); }
  const changes = [
    { id: "meals", label: "正餐", now: rf.filter(r => ["breakfast", "lunch", "dinner"].includes(r.mealType)).length, before: pf.filter(r => ["breakfast", "lunch", "dinner"].includes(r.mealType)).length, group: "food" },
    ...(["snack", "late_night"] as const).map(meal => ({ id: meal, label: meal === "snack" ? "零食 / 加餐" : "夜宵", now: rf.filter(r => r.mealType === meal).length, before: pf.filter(r => r.mealType === meal).length, group: "food" })),
    ...(["delivery", "restaurant", "home"] as const).map(scene => ({ id: scene, label: scene === "delivery" ? "外卖" : scene === "restaurant" ? "外食" : "在家吃饭", now: rf.filter(r => r.scene === scene).length, before: pf.filter(r => r.scene === scene).length, group: "food" })),
    { id: "drinks", label: "饮品", now: rd.length, before: pd.length, group: "drink" },
    ...(["coffee", "milk_tea"] as const).map(type => ({ id: type, label: drinkTypeLabels[type], now: rd.filter(r => r.drinkType === type).length, before: pd.filter(r => r.drinkType === type).length, group: "drink" })),
  ];
  if (complete && pf.length + pd.length >= 3) for (const change of changes) {
    const delta = change.now - change.before;
    if (Math.abs(delta) >= 3 && Math.abs(delta) >= change.before * .4) add(`change-${change.id}`, change.group, 90 + Math.abs(delta), `${change.label}记录${delta > 0 ? "增加" : "减少"}了`, `最近 7 天 ${change.now} 次，前 7 天 ${change.before} 次；只比较已记录的内容。`);
  }
  const commonFood = ranked(rf.map(row => foodRecordDisplay(row).title))[0];
  if (commonFood?.count >= 2) add("common-food", "food", 58 + commonFood.count, `最近常吃「${commonFood.name}」`, `最近 7 天记录了 ${commonFood.count} 次。`, "/food");
  const preferences = buildDrinkPreferenceSummary(rd, new Date(`${date}T12:00:00Z`));
  const commonDrink = preferences.commonDrinks[0];
  if (commonDrink?.count >= 2) add("common-drink", "drink", 59 + commonDrink.count, `最近常喝「${commonDrink.name}」`, `${commonDrink.brand ? commonDrink.brand + " · " : ""}最近 7 天 ${commonDrink.count} 次。`, "/drinks/history");
  const preferred = preferences.preferredDrinks[0];
  if (preferred && preferred.name !== commonDrink?.name) add("preferred-drink", "preference", 62, `有评价的饮品里，更喜欢「${preferred.name}」`, `最近 7 天 ${preferred.ratingCount} 条评价，记录了 ${preferred.count} 次。`, "/drinks/history");
  const likedFood = ranked(rf.filter(row => row.rating === "love" || row.rating === "good").map(row => foodRecordDisplay(row).title))[0];
  if (likedFood?.count >= 2 && likedFood.name !== commonFood?.name) add("preferred-food", "preference", 61, `「${likedFood.name}」获得了重复好评`, `最近 7 天 ${likedFood.count} 次正向评价。`, "/food");
  for (const dimension of ["sugarLevel", "temperature", "drinkType", "brand"] as const) {
    const currentValues = rd.map(row => row[dimension] ?? "").filter(Boolean), pastValues = pd.map(row => row[dimension] ?? "").filter(Boolean);
    const current = ranked(currentValues)[0], past = ranked(pastValues)[0];
    if (!current || currentValues.length < 3 || current.count < 3 || current.count / currentValues.length < .6) continue;
    const label = dimension === "sugarLevel" ? "糖度" : dimension === "temperature" ? "冷热" : dimension === "brand" ? "品牌" : "饮品类型";
    const display = (value: string) => dimension === "temperature" ? temperatureLabels[value as keyof typeof temperatureLabels] ?? value : dimension === "drinkType" ? drinkTypeLabels[value as DrinkLog["drinkType"]] ?? value : value;
    const changed = complete && past && pastValues.length >= 3 && past.count / pastValues.length >= .6 && key(past.name) !== key(current.name);
    add(`preference-${dimension}`, "preference", changed ? 88 : 52 + current.count, changed ? `${label}偏好从「${display(past.name)}」转向「${display(current.name)}」` : `${label}更常选「${display(current.name)}」`, `最近 7 天有填写${label}的 ${currentValues.length} 杯中，${current.count} 杯选了这一项。`);
  }
  const placeIds = [...new Set([...rf, ...rd].map(row => row.foodPlaceId).filter((id): id is number => Boolean(id)))];
  for (const id of placeIds) {
    const foodRows = rf.filter(row => row.foodPlaceId === id), drinkRows = rd.filter(row => row.foodPlaceId === id), count = foodRows.length + drinkRows.length;
    const name = [...foodRows, ...drinkRows].find(row => row.foodPlaceName)?.foodPlaceName;
    if (!name) continue;
    if (foodRows.length && drinkRows.length) add(`place-combo-${id}`, "place", 66 + count, `在「${name}」，吃喝都记了`, `最近 7 天 ${foodRows.length} 条 Food、${drinkRows.length} 条 Drink。`, `/food/places/${id}`);
    else if (count >= 2) add(`place-repeat-${id}`, "place", 55 + count, `最近常去「${name}」`, `最近 7 天关联了 ${count} 条记录。`, `/food/places/${id}`);
  }
  const names = (f: FoodLog[], d: DrinkLog[]) => new Set([...f.map(row => `food:${key(foodRecordDisplay(row).title)}`), ...d.map(row => `drink:${key(drinkRecordName(row))}`)]);
  const currentNames = names(rf, rd), previousNames = names(pf, pd);
  if (rf.length + rd.length >= 6 && currentNames.size >= 4) {
    const newNames = [...currentNames].filter(name => !previousNames.has(name)).length;
    add("variety", "variety", 56, "最近记录的吃喝内容挺多样", `最近 7 天记录了 ${currentNames.size} 种内容。${complete && previousNames.size >= 3 ? `其中 ${newNames} 种前 7 天未出现。` : "不同品名按记录统计。"}`);
  }
  // A representative frequency is useful even without a comparison baseline.
  for (const pattern of changes.filter(change => change.now >= 3)) {
    if (candidates.some(candidate => candidate.id === `change-${pattern.id}`)) continue;
    add(`pattern-${pattern.id}`, pattern.group, 42 + pattern.now, `最近 7 天，${pattern.label}记录了 ${pattern.now} 次`, `基于最近的饮食记录，不包含未记录的摄入。`);
  }
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const selected: typeof candidates = [], groups = new Map<string, number>();
  for (const maxPerGroup of [1, 2]) for (const candidate of candidates) {
    if (selected.length >= 5) break;
    if (selected.some(item => item.id === candidate.id) || (groups.get(candidate.group) ?? 0) >= maxPerGroup) continue;
    selected.push(candidate); groups.set(candidate.group, (groups.get(candidate.group) ?? 0) + 1);
  }
  return selected.map(({ id, title, body, href }) => ({ id, title, body, ...(href ? { href } : {}) }));
}
