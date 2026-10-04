import type { FoodLog, DrinkLog, DrinkLimit, DrinkLimitStatus } from "./types";
import type { FoodDrinkEntry } from "./food-drink-timeline";
import { foodRecordDisplay } from "./food-record-display.ts";
import { drinkTypeLabels } from "./drink-display.ts";
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
const day = (row: FoodLog | DrinkLog) => dateInEvaOrbit(new Date(row.occurredAt));
const activeDays = (rows: Array<FoodLog | DrinkLog>) => new Set(rows.map(day)).size;
function ranked(values: string[]) {
  const counts = new Map<string, { name: string; count: number }>();
  for (const value of values.filter(value => value.trim())) {
    const item = counts.get(key(value)) ?? { name: value.trim(), count: 0 };
    item.count++; counts.set(key(value), item);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Each insight uses its own evidence window; weak samples never fill the shortlist. */
export function buildFoodDrinkInsights(foods: FoodLog[], drinks: DrinkLog[], date = dateInEvaOrbit(), complete = true): FoodDrinkInsight[] {
  const monthFrom = shiftDate(date, -29), recentFrom = shiftDate(date, -6), previousFrom = shiftDate(date, -13);
  const within = <T extends FoodLog | DrinkLog>(rows: T[], from: string, to = date) => rows.filter(row => day(row) >= from && day(row) <= to);
  const mf = within(foods, monthFrom), md = within(drinks, monthFrom);
  if (mf.length + md.length < 3) return [];
  const rf = within(mf, recentFrom), rd = within(md, recentFrom);
  const pf = within(mf, previousFrom, shiftDate(date, -7)), pd = within(md, previousFrom, shiftDate(date, -7));
  const candidates: Array<FoodDrinkInsight & { score: number; group: string }> = [];
  function add(id: string, group: string, score: number, title: string, body: string, href?: string) {
    candidates.push({ id, group, score, title, body, ...(href ? { href } : {}) });
  }
  const foodPatterns = [
    { id: "meals", label: "正餐", more: "最近正餐记得更勤", less: "最近正餐记录少了些", match: (row: FoodLog) => ["breakfast", "lunch", "dinner"].includes(row.mealType) },
    { id: "snack", label: "零食 / 加餐", more: "最近零食和加餐更多", less: "最近零食和加餐少了些", match: (row: FoodLog) => row.mealType === "snack" },
    { id: "late_night", label: "夜宵", more: "最近更常吃夜宵", less: "最近夜宵少了些", match: (row: FoodLog) => row.mealType === "late_night" },
    { id: "delivery", label: "外卖", more: "最近更常点外卖", less: "最近外卖点得少了", match: (row: FoodLog) => row.scene === "delivery" },
    { id: "restaurant", label: "外食", more: "最近更常在外面吃", less: "最近在外面吃得少了", match: (row: FoodLog) => row.scene === "restaurant" },
    { id: "home", label: "在家吃饭", more: "最近更常在家吃饭", less: "最近在家吃饭少了些", match: (row: FoodLog) => row.scene === "home" },
  ];
  const changes = [
    ...foodPatterns.map(pattern => ({ ...pattern, now: rf.filter(pattern.match).length, before: pf.filter(pattern.match).length, group: "food", baseline: pf.length >= 3 && activeDays(pf) >= 2 && activeDays(rf) >= 2 })),
    ...(["coffee", "milk_tea"] as const).map(type => ({ id: type, label: drinkTypeLabels[type], more: type === "coffee" ? "最近喝咖啡更多" : "最近喝奶茶更多", less: type === "coffee" ? "最近咖啡喝得少了" : "最近奶茶喝得少了", now: rd.filter(row => row.drinkType === type).length, before: pd.filter(row => row.drinkType === type).length, group: "drink", baseline: pd.length >= 3 && activeDays(pd) >= 2 && activeDays(rd) >= 2 })),
  ];
  if (complete) for (const change of changes) {
    const delta = change.now - change.before;
    if (change.baseline && Math.abs(delta) >= 3 && Math.abs(delta) >= change.before * .5) {
      add(`change-${change.id}`, change.group, 90 + Math.abs(delta), delta > 0 ? change.more : change.less, `近 7 天${change.label} ${change.now} 次，前 7 天 ${change.before} 次。`);
    }
  }

  const commonFood = ranked(mf.map(row => foodRecordDisplay(row).title))[0];
  const sameFood = commonFood ? mf.filter(row => key(foodRecordDisplay(row).title) === key(commonFood.name)) : [];
  if (commonFood?.count >= 3 && activeDays(sameFood) >= 2 && !/^(早餐|午餐|晚餐|正餐|加餐|夜宵|饮食记录)$/.test(commonFood.name)) {
    add("common-food", "food", 58 + Math.min(commonFood.count, 10), `「${commonFood.name}」最近吃了好几次`, `近 30 天 ${commonFood.count} 次，分布在 ${activeDays(sameFood)} 天。`, "/food");
  }
  const preferences = buildDrinkPreferenceSummary(md, new Date(`${date}T12:00:00Z`));
  const commonDrink = preferences.commonDrinks[0];
  const sameDrink = commonDrink ? md.filter(row => key(row.drinkMenuName || row.name) === key(commonDrink.name) && key(row.brand) === key(commonDrink.brand)) : [];
  if (commonDrink?.count >= 3 && activeDays(sameDrink) >= 2) {
    add("common-drink", "drink", 59 + Math.min(commonDrink.count, 10), `「${commonDrink.name}」最近喝了好几次`, `${commonDrink.brand ? commonDrink.brand + " · " : ""}近 30 天 ${commonDrink.count} 杯，分布在 ${activeDays(sameDrink)} 天。`, "/drinks/history");
  }
  const preferred = preferences.preferredDrinks.find(item => {
    const rows = md.filter(row => key(row.drinkMenuName || row.name) === key(item.name) && key(row.brand) === key(item.brand));
    const positive = rows.filter(row => row.rating === "love" || row.rating === "good").length;
    return item.ratingCount >= 3 && positive / item.ratingCount >= .67 && activeDays(rows) >= 2 && item.name !== commonDrink?.name;
  });
  if (preferred) add("preferred-drink", "preference", 64, `最近喜欢「${preferred.name}」`, `近 30 天 ${preferred.ratingCount} 条评价，喝了 ${preferred.count} 次。`, "/drinks/history");
  const likedFood = ranked(mf.filter(row => row.rating === "love" || row.rating === "good").map(row => foodRecordDisplay(row).title))[0];
  if (likedFood?.count >= 3 && likedFood.name !== commonFood?.name) add("preferred-food", "preference", 63, `「${likedFood.name}」吃过几次，都挺喜欢`, `近 30 天 ${likedFood.count} 次正向评价。`, "/food");

  const sortedDrinks = [...md].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id);
  for (const dimension of ["sugarLevel", "temperature", "drinkType", "brand"] as const) {
    const filled = sortedDrinks.filter(row => String(row[dimension] ?? "").trim());
    if (filled.length < 6 || activeDays(filled) < 3) continue;
    const currentRows = filled.slice(0, 10), pastRows = filled.slice(10, 20);
    const current = ranked(currentRows.map(row => String(row[dimension])))[0], past = ranked(pastRows.map(row => String(row[dimension])))[0];
    if (current.count < 4 || current.count / currentRows.length < .65) continue;
    const display = (value: string) => dimension === "temperature" ? temperatureLabels[value as keyof typeof temperatureLabels] ?? value : dimension === "drinkType" ? drinkTypeLabels[value as DrinkLog["drinkType"]] ?? value : value;
    const label = dimension === "sugarLevel" ? "糖度" : dimension === "temperature" ? "冷热" : dimension === "brand" ? "品牌" : "饮品类型";
    const changed = complete && pastRows.length >= 5 && activeDays(pastRows) >= 2 && past && past.count / pastRows.length >= .65 && key(past.name) !== key(current.name);
    // Prefer a frequency change to a second headline saying the same thing about coffee or milk tea.
    if (dimension === "drinkType" && candidates.some(item => item.id === `change-${current.name}`)) continue;
    const title = changed ? `最近${label}更偏向「${display(current.name)}」` : dimension === "drinkType" ? `最近更偏爱${display(current.name)}` : dimension === "temperature" ? `最近喝饮品更常选${display(current.name)}` : dimension === "brand" ? `最近更常选「${display(current.name)}」` : `最近更常选「${display(current.name)}」糖度`;
    const evidence = filled.length > 10 ? `最近 ${currentRows.length} 杯有${label}记录的饮品中` : `近 30 天，有${label}记录的 ${currentRows.length} 杯中`;
    add(`preference-${dimension}`, "preference", changed ? 86 : 57 + Math.min(current.count, 10), title, `${evidence}，${current.count} 杯选了${display(current.name)}。${changed ? `此前 ${pastRows.length} 杯更常选${display(past.name)}。` : ""}`);
  }

  const placeIds = [...new Set([...mf, ...md].map(row => row.foodPlaceId).filter((id): id is number => Boolean(id)))];
  for (const id of placeIds) {
    const foodRows = mf.filter(row => row.foodPlaceId === id), drinkRows = md.filter(row => row.foodPlaceId === id);
    const rows = [...foodRows, ...drinkRows], days = activeDays(rows), count = rows.length;
    const name = rows.find(row => row.foodPlaceName)?.foodPlaceName;
    if (!name || days < 3 || count < 4) continue;
    if (foodRows.length >= 2 && drinkRows.length >= 2 && count >= 5) {
      add(`place-combo-${id}`, "place", 74 + Math.min(count, 10), `在「${name}」，吃的喝的都选过`, `近 30 天 ${foodRows.length} 条饮食、${drinkRows.length} 杯饮品，分布在 ${days} 天。`, `/food/places/${id}`);
    } else {
      add(`place-repeat-${id}`, "place", 64 + Math.min(count, 10), count >= 6 && days >= 4 ? `「${name}」是近一个月的常用来源` : `最近又选了「${name}」`, `近 30 天 ${count} 条关联记录，分布在 ${days} 天。`, `/food/places/${id}`);
    }
  }

  // Stable entity IDs only: a renamed meal or a free-text title cannot invent a new variety.
  const entities = new Set<string>(); let linkedRecords = 0;
  for (const row of mf) {
    const ids = row.foodDishIds?.length ? row.foodDishIds : row.foodDishId ? [row.foodDishId] : row.foodDishes?.map(dish => dish.id) ?? [];
    ids.forEach(id => entities.add(`menu:${id}`));
    if (row.foodLibraryId) entities.add(`library:${row.foodLibraryId}`);
    if (ids.length || row.foodLibraryId) linkedRecords++;
  }
  for (const row of md) {
    if (row.drinkMenuId) entities.add(`menu:${row.drinkMenuId}`);
    if (row.foodLibraryId) entities.add(`library:${row.foodLibraryId}`);
    if (row.drinkMenuId || row.foodLibraryId) linkedRecords++;
  }
  const total = mf.length + md.length, days = activeDays([...mf, ...md]);
  if (total >= 10 && days >= 5 && linkedRecords / total >= .6 && entities.size >= 5) {
    add("variety", "variety", 66, "近一个月吃喝的选择挺丰富", `近 30 天涉及 ${entities.size} 款关联菜品、饮品菜单或 Library 食品，记录覆盖 ${days} 天。`);
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
