import assert from "node:assert/strict";
import test from "node:test";
import { allowsSettingsConfiguration } from "./settings-configuration-request.ts";

test("settings bridge allows only exact preference paths and their methods", () => {
  for (const [path, methods] of [["/api/preferences/life-day", ["GET", "PATCH"]], ["/api/calendar-interpretation", ["GET", "PUT"]], ["/api/timeline-association", ["GET", "PUT"]]] as const) {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) assert.equal(allowsSettingsConfiguration(path, method), (methods as readonly string[]).includes(method));
    for (const suffix of ["/", "?account=other", "#fragment", "/../ai/providers"]) assert.equal(allowsSettingsConfiguration(path + suffix, "GET"), false);
  }
  for (const path of ["https://evil.invalid/api/preferences/life-day", "/api/notifications", "/api/preferences/appearance", "/api/native/sync", "/api/ai/providers", "/api/calendar"]) assert.equal(allowsSettingsConfiguration(path, "GET"), false);
});
