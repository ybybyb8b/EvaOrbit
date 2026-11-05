import assert from "node:assert/strict";
import test from "node:test";
import { takeNativeNavigationPath } from "../local-trackers/native-navigation.ts";

test("native notification paths keep their destination and are consumed once", () => {
  for (const path of ["/", "/tasks?taskId=123#details", "/settings/notifications?reminderId=42", "/food?date=2026-11-05", "/health", "/lucius", "/memo/123"]) {
    const host = { __evaorbitPendingPath: path };
    assert.equal(takeNativeNavigationPath(host), path);
    assert.equal(takeNativeNavigationPath(host), null);
  }
});

test("native notification paths reject external links, APIs and encoded traversal", () => {
  for (const path of [null, 42, "https://example.com/tasks", "//example.com/tasks", "/api/tasks", "/tasks/../api/tasks", "/tasks/%2e%2e/api/tasks", "/%2fexample.com/tasks", "/tasks\\evil", "/tasks/%5cevil", "/unknown", "/tasks\n"]) {
    const host = { __evaorbitPendingPath: path };
    assert.equal(takeNativeNavigationPath(host), null, String(path));
    assert.equal(host.__evaorbitPendingPath, undefined);
  }
});
