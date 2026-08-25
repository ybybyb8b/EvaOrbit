import "server-only";
import { getRepository } from "../repositories";
import type { NewInboxItem } from "../repositories/types";

export async function listInbox(status = "inbox") { return (await getRepository()).listInbox(status); }
export async function createInbox(input: NewInboxItem) { return (await getRepository()).createInboxItem(input); }
export async function updateInbox(id: number, input: Record<string, unknown>) { return (await getRepository()).updateInboxItem(id, input); }
export async function deleteInbox(id: number) { return (await getRepository()).deleteInboxItem(id); }

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
