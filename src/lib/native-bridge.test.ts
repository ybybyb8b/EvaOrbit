import assert from "node:assert/strict";
import test from "node:test";
import { healthKitSupported, hostSupports, nativeNotificationsSupported } from "./native-bridge.ts";

test("native capabilities are detected from getInfo, never from user agent", () => {
  const oldHost = { platform: "ios", healthKitPipeline: "energy-v1" };
  assert.equal(healthKitSupported(oldHost), true);
  assert.equal(nativeNotificationsSupported(oldHost), false);
  assert.equal(hostSupports(oldHost, "notification.getStatus"), false);

  const nextHost = { platform: "ios", methods: [
    "notification.getStatus", "notification.requestAuthorization", "notification.schedule", "notification.cancel", "notification.listPending",
  ] };
  assert.equal(nativeNotificationsSupported(nextHost), true);
});

test("partial notification bridges stay unavailable", () => {
  assert.equal(nativeNotificationsSupported({ capabilities: { "notification.getStatus": true } }), false);
});
