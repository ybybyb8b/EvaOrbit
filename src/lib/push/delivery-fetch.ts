import { setTimeout as delay } from "node:timers/promises";

// Retry only rejected table reads, never writes, RPCs, or the delivery job itself.
export function createDeliveryFetch(
  supabaseUrl: string,
  request: typeof fetch = fetch,
  pause = (ms: number, signal?: AbortSignal) => delay(ms, undefined, { signal }),
): typeof fetch {
  const base = new URL(supabaseUrl);
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const canRetry = method === "GET" && url.origin === base.origin &&
      url.pathname.startsWith("/rest/v1/") && !url.pathname.startsWith("/rest/v1/rpc/");
    const waits = [500, 1500];
    for (let attempt = 0; ; attempt += 1) {
      const response = await request(input, init);
      if (response.ok && attempt > 0) {
        console.info("Reminder database read recovered", {
          table: url.pathname.slice("/rest/v1/".length), retries: attempt,
        });
      }
      if (!canRetry || response.status !== 401 || attempt === waits.length) return response;
      const error = await response.clone().json().catch(() => null);
      if (error?.code !== "PGRST303" || error?.message !== "JWT issued at future") return response;
      console.warn("Reminder database read retry", {
        table: url.pathname.slice("/rest/v1/".length),
        code: "PGRST303", attempt: attempt + 1, delayMs: waits[attempt],
      });
      await pause(waits[attempt], init?.signal ?? (input instanceof Request ? input.signal : undefined));
    }
  };
}
