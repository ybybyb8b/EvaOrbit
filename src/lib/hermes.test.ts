import assert from "node:assert/strict";
import test from "node:test";
import { hermesInput, hermesRead, hermesStatusText, mergeHermesMessages, type HermesMessage } from "./hermes.ts";

test("Hermes transport validates IDs and preserves distinct message and processing receipts", () => {
  assert(!hermesInput.safeParse({ action: "send", id: "not-an-id", conversationId: "not-an-id", content: "hi" }).success);
  assert(!hermesRead.safeParse({ pending: Array(101).fill("10000000-0000-4000-8000-000000000001") }).success);
  const message = { id: "one", seq: 1, status: "queued" } as HermesMessage;
  assert.match(hermesStatusText(message, false, false), /等待 Hermes 上线/);
  const updated = { ...message, status: "done" as const };
  assert.deepEqual(mergeHermesMessages([message], [{ ...message, id: "two", seq: 2 }, updated]), [updated, { ...message, id: "two", seq: 2 }]);
});
