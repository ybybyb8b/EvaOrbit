import type { ProjectItem, ProjectItemStatus, ProjectItemType } from "./types.ts";

export const projectItemTypeLabels: Record<ProjectItemType, string> = {
  feature: "Feature", bug: "Bug Fix", ui: "UI / UX", migration: "Migration",
  research: "Research", tech_debt: "Tech debt", other: "Other",
};
export const projectItemStatusLabels: Record<ProjectItemStatus, string> = {
  to_solve: "To Solve", doing: "Doing", blocked: "Blocked", done: "Done", verified: "Verified", dropped: "Dropped",
};

export function splitProjectModule(value: string | null) {
  const [module = "", ...category] = (value ?? "").split(/\s*\/\s*/);
  return { module: module.trim(), category: category.join(" / ").trim() };
}

export function joinProjectModule(module: string, category = "") {
  return module.trim() ? [module.trim(), category.trim()].filter(Boolean).join(" / ") : "";
}

export function projectModuleCatalog(values: readonly (string | null)[]) {
  const catalog = new Map<string, { name: string; categories: string[] }>();
  for (const value of values) {
    const { module, category } = splitProjectModule(value);
    if (!module) continue;
    const key = module.toLocaleLowerCase();
    const entry = catalog.get(key) ?? { name: module, categories: [] };
    if (category && !entry.categories.some(name => name.toLocaleLowerCase() === category.toLocaleLowerCase())) entry.categories.push(category);
    catalog.set(key, entry);
  }
  return [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name)).map(entry => ({ ...entry, categories: entry.categories.sort((a, b) => a.localeCompare(b)) }));
}

export function canonicalProjectModule(value: string, values: readonly (string | null)[]) {
  const { module, category } = splitProjectModule(value);
  const entry = projectModuleCatalog(values).find(entry => entry.name.toLocaleLowerCase() === module.toLocaleLowerCase());
  return joinProjectModule(entry?.name ?? module, entry?.categories.find(name => name.toLocaleLowerCase() === category.toLocaleLowerCase()) ?? category);
}

export function filterProjectItems(items: readonly ProjectItem[], status: ProjectItemStatus | "unfinished" | "", type: ProjectItemType | "", module = "") {
  return items.filter(item => (!status || (status === "unfinished" ? ["to_solve", "doing", "blocked"].includes(item.status) : item.status === status)) && (!type || item.type === type) && (!module || splitProjectModule(item.module).module.toLocaleLowerCase() === module.toLocaleLowerCase()));
}

export function groupProjectItems(items: readonly ProjectItem[]) {
  const groups = new Map<string, { name: string; items: ProjectItem[]; categories: Map<string, { name: string; items: ProjectItem[] }> }>();
  for (const item of items) {
    const { module, category } = splitProjectModule(item.module);
    const key = module.toLocaleLowerCase();
    const group = groups.get(key) ?? { name: module, items: [] as ProjectItem[], categories: new Map<string, { name: string; items: ProjectItem[] }>() };
    group.items.push(item);
    const categoryKey = category.toLocaleLowerCase();
    const subgroup = group.categories.get(categoryKey) ?? { name: category, items: [] };
    subgroup.items.push(item);
    group.categories.set(categoryKey, subgroup);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => !a.name ? 1 : !b.name ? -1 : a.name.localeCompare(b.name)).map(group => ({ ...group, categories: [...group.categories.values()].sort((a, b) => a.name.localeCompare(b.name)) }));
}
