import type { MemoryPage } from "./memory-pagination";
import { responseError } from "./response-error";

export async function fetchMemoryPages<T>(
  path: string, params: URLSearchParams, signal?: AbortSignal, read: (path: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<T[]> {
  const query = new URLSearchParams(params);
  const items: T[] = [];
  let cursor = query.get("cursor");
  do {
    if (cursor) query.set("cursor", cursor);
    const response = await read(path + "?" + query, { cache: "no-store", signal });
    if (!response.ok) throw new Error(await responseError(response, "Could not load Memory."));
    const page: MemoryPage<T> = await response.json();
    items.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return items;
}
