import "server-only";

import { readMemoryContext, type MemoryContextInput } from "../memory-context";
import { getRepository } from "../repositories";

export function getMemoryContext(input: MemoryContextInput, signal?: AbortSignal) {
  let repository: ReturnType<typeof getRepository> | undefined;
  return readMemoryContext(async (resource, options) =>
    (await (repository ??= getRepository())).pageMemory(resource, options), input, { signal });
}
