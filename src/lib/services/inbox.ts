import "server-only";
import { getRepository } from "../repositories";
import type { NewInboxItem } from "../repositories/types";
import type { InboxStatus } from "../types";

export async function listInbox(status: InboxStatus | "all" = "inbox") { return (await getRepository()).listInbox(status); }
export async function searchInbox(input: { query?: string; status?: InboxStatus | "all"; limit?: number } = {}) {
  const items = await listInbox(input.status ?? "inbox");
  const query = input.query?.trim().toLocaleLowerCase();
  const filtered = query ? items.filter((item) => item.content.toLocaleLowerCase().includes(query)) : items;
  return filtered.slice(0, Math.min(Math.max(input.limit ?? 20, 1), 100));
}
export async function getInbox(id: number) { return (await getRepository()).getInboxItem(id); }
export async function createInbox(input: NewInboxItem) { return (await getRepository()).createInboxItem(input); }
export async function updateInbox(id: number, input: Record<string, unknown>) {
  const patch = { ...input };
  if (patch.status === "processed") patch.processedAt = new Date().toISOString();
  if (patch.status === "inbox") patch.processedAt = null;
  return (await getRepository()).updateInboxItem(id, patch);
}
export async function deleteInbox(id: number) { return (await getRepository()).deleteInboxItem(id); }
export async function markInboxProcessed(id: number) { return updateInbox(id, { status: "processed" }); }
export async function archiveInbox(id: number) { return updateInbox(id, { status: "archived" }); }
export async function restoreInbox(id: number) { return updateInbox(id, { status: "inbox" }); }

export async function convertInbox(id: number, target: "task" | "memory") {
  const repository = await getRepository();
  const item = await repository.getInboxItem(id);
  if (!item) return null;
  const title = item.content.replace(/\s+/g, " ").trim().slice(0, 160);
  const converted = target === "task"
    ? await repository.createTask({ title, notes: item.content.length > 160 ? item.content : "", dueDate: null, priority: "medium", tags: [] })
    : await repository.createMemory({ title: title.slice(0, 80), content: item.content, category: "其他" });
  await repository.updateInboxItem(id, { status: "processed", processedAt: new Date().toISOString(), convertedType: target, convertedId: converted.id });
  return { item: await repository.getInboxItem(id), converted };
}
