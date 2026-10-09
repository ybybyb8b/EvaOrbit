import "server-only";
import { getRepository } from "../repositories";
import { catalogServingKcal, type FoodCatalogItem } from "../food-catalog";

export async function searchFoodCatalog(kind: "food" | "drink", query = "", placeId?: number): Promise<FoodCatalogItem[]> {
  const repository = await getRepository();
  const [menus, products] = await Promise.all([
    repository.listFoodDishes(query, { kind, foodPlaceId: placeId, limit: 100 }),
    repository.searchFoodLibrary(query, "", { category: kind === "drink" ? "drink" : undefined, foodPlaceId: placeId, limit: 100 }),
  ]);
  const placeCache = new Map<number, ReturnType<typeof repository.getFoodPlace>>();
  const libraryCache = new Map<number, ReturnType<typeof repository.getFoodLibraryItem>>();
  function place(id: number) { if (!placeCache.has(id)) placeCache.set(id, repository.getFoodPlace(id)); return placeCache.get(id)!; }
  function library(id: number) { if (!libraryCache.has(id)) libraryCache.set(id, repository.getFoodLibraryItem(id)); return libraryCache.get(id)!; }
  const items = await Promise.all(menus.map(async menu => {
    const [owner, reference] = await Promise.all([place(menu.foodPlaceId), menu.foodLibraryId ? library(menu.foodLibraryId) : null]);
    if (!owner || owner.archivedAt) return null;
    const nutrition = reference && !reference.archivedAt ? reference : undefined;
    return { key: `menu:${menu.id}`, name: menu.name, placeId: owner.id, placeName: [owner.name, owner.branch].filter(Boolean).join(" · "), menu, library: nutrition, servingKcal: catalogServingKcal(nutrition) };
  }));
  const used = new Set(menus.map(menu => menu.foodLibraryId));
  const standalone = await Promise.all(products.filter(item => !used.has(item.id) && (kind === "drink" ? item.category === "drink" : item.category !== "drink") && (!placeId || item.foodPlaceId === placeId)).map(async item => {
    const owner = item.foodPlaceId ? await place(item.foodPlaceId) : null;
    if (item.foodPlaceId && (!owner || owner.archivedAt)) return null;
    return { key: `library:${item.id}`, name: item.name, placeId: owner?.id ?? null, placeName: owner ? [owner.name, owner.branch].filter(Boolean).join(" · ") : item.brand, library: item, servingKcal: catalogServingKcal(item) };
  }));
  return [...items, ...standalone].filter((item): item is NonNullable<typeof item> => item !== null).slice(0, 100);
}
