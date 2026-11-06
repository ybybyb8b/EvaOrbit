export const hermesActivityEvent = "eo:hermes-activity";
export type HermesActivityEvent = { state: "sending" | "saved" | "uncertain"; id: string; conversationId?: string; error?: string } | { state: "seen"; conversationId: string; seq: number };
export type HermesThread = { id: string; title: string; latestSeq: number; unread: number; preview: string; pending: "queued" | "received" | "processing" | null; question: boolean; error: string | null };
export type HermesActivityData = { connection: { paired: boolean; online: boolean; lastSeenAt: string | null }; threads: HermesThread[]; receipt?: { id: string; status: string } | null };
export function notifyHermesActivity(detail: HermesActivityEvent) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(hermesActivityEvent, { detail }));
}
