import assert from "node:assert/strict";
import test from "node:test";
import { eventKitRpcConflict } from "./eventkit-errors.ts";

test("Known EventKit RPC refusals distinguish missing EO, ambiguous identity and an active creation lease", () => {
  for (const [message, code] of [["Invalid EventKit logical link", "eventkit_eo_missing"], ["Linked EO record is missing; manual resolution required", "eventkit_eo_missing"], ["Ambiguous EventKit identity", "eventkit_identity_conflict"], ["Reminder creation in progress; retry later", "eventkit_creation_pending"]]) {
    assert.equal(eventKitRpcConflict({ code: "P0001", message })?.code, code);
  }
});
test("Unexpected database and network failures remain server errors", () => {
  for (const error of [null, new Error("offline"), { code: "P0001", message: "Unrecognized failure" }, { code: "42501", message: "Invalid EventKit logical link" }]) assert.equal(eventKitRpcConflict(error), null);
});
