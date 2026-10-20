// Explicit settings exception to the development Host's business read-only mode.
// Never allow chat, sessions, arbitrary URLs, queries, or automatic replay here.
export function allowsAiConfiguration(path: string, method: string): boolean {
  if (path === "/api/ai/providers") return method === "GET" || method === "POST";
  if (path === "/api/ai/providers/test") return method === "POST";
  if (/^\/api\/ai\/providers\/[1-9][0-9]*$/.test(path)) return method === "PATCH" || method === "DELETE";
  if (/^\/api\/ai\/providers\/[1-9][0-9]*\/models$/.test(path)) return method === "POST";
  return /^\/api\/ai\/model-configs\/[1-9][0-9]*$/.test(path) && (method === "PATCH" || method === "DELETE");
}
