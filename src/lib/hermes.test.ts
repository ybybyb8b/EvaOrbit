import assert from "node:assert/strict";
import test from "node:test";
import { hermesInput, hermesNotice, hermesRead, hermesStatusText, mergeHermesMessages, type HermesMessage } from "./hermes.ts";

test("Hermes transport validates IDs and preserves distinct message and processing receipts", () => {
  assert(!hermesInput.safeParse({ action: "send", id: "not-an-id", conversationId: "not-an-id", content: "hi" }).success);
  assert(!hermesRead.safeParse({ pending: Array(101).fill("10000000-0000-4000-8000-000000000001") }).success);
  const message = { id: "one", seq: 1, status: "queued" } as HermesMessage;
  assert.match(hermesStatusText(message, false, false), /等待 Hermes 上线/);
  const updated = { ...message, status: "done" as const };
  assert.deepEqual(mergeHermesMessages([message], [{ ...message, id: "two", seq: 2 }, updated]), [updated, { ...message, id: "two", seq: 2 }]);
});

test("Hermes renders historical gateway notices without reclassifying ordinary replies", () => {
  const conversationId = "10000000-0000-4000-8000-000000000001";
  const message = { role: "assistant", conversation_id: conversationId, reply_to: null } as HermesMessage;
  const home = `✅ Home channel set to **EvaOrbit** (ID: ${conversationId}).\nCron jobs and cross-platform messages will be delivered here.`;
  const shutdown = "⚠️ Hermes is shutting down — your current task will be interrupted. When it is back online, send any message and I'll try to pick up where we left off.";
  assert(hermesNotice({ ...message, content: home, reply_to: "command" }));
  assert(hermesNotice({ ...message, content: shutdown }));
  assert(hermesNotice({ ...message, content: "♻️ Gateway online — Hermes is back and ready." }));
  assert(hermesNotice({ ...message, content: "♻️ 网关已上线——Hermes 已恢复就绪。" }));
  assert(hermesNotice({ ...message, content: "New Hermes system event", presentation: { notice: true } }));
  assert(!hermesNotice({ ...message, content: shutdown, reply_to: "normal-turn" }));
  assert(!hermesNotice({ ...message, content: home, conversation_id: "different-conversation" }));
  assert(!hermesNotice({ ...message, content: "⚠️ 检查前先备份。" }));
  assert(!hermesNotice({ ...message, role: "user", content: home }));
});
