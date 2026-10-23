// Mounted workspaces own their reads; pull refresh never emits online/native-active
// or calls the system integration scheduler. Cleanup follows the existing loader.
const readers = new Set<() => void | Promise<unknown>>();

export function registerLocalRefresh(read: () => void | Promise<unknown>) {
  const current: () => void | Promise<unknown> = () => readers.has(current) ? read() : undefined;
  readers.add(current);
  return () => { readers.delete(current); };
}

export async function refreshLocalPage() {
  await Promise.all([...readers].map(read => Promise.resolve().then(read)));
}
