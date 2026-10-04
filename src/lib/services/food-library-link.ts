import "server-only";
import type { EvaOrbitRepository } from "../repositories/types";
import { ValidationError } from "../validation";

export async function validateLibraryLink(repository: EvaOrbitRepository, id: number | null | undefined, existing?: number | null) {
  if (id == null) return;
  const item = await repository.getFoodLibraryItem(id);
  if (!item || (item.archivedAt && id !== existing)) throw new ValidationError("食品库项目不存在或已归档");
}
