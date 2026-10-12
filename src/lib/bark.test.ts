import assert from "node:assert/strict";
import test from "node:test";
import { barkDeviceKey, barkPayload, sendBark } from "./push/bark.ts";

const payload = { kind: "reminder_due" as const, title: "清理猫砂", body: "该完成了", url: "/settings/notifications?reminderId=42" };
test("Bark accepts official copied URLs, rejects other hosts and credentials", () => {
  assert.equal(barkDeviceKey(" https://api.day.app/abcdefgh123/title/body?group=test "), "abcdefgh123");
  for (const url of [null, "", "https://api.day.app.evil/abcdefgh123", "http://api.day.app/abcdefgh123", "https://user:pass@api.day.app/abcdefgh123", "https://api.day.app/", "https://localhost/abcdefgh123"]) assert.throws(() => barkDeviceKey(url));
});
test("Bark carries a clickable EO link without allowing an external redirect", () => {
  assert.equal(barkPayload("test-key", payload).url, "https://eva-orbit.vercel.app/settings/notifications?reminderId=42");
  for (const url of ["https://evil.example", "//evil.example", "/\\evil.example"]) assert.throws(() => barkPayload("test-key", { ...payload, url }));
});
test("Bark only reports accepted delivery on a successful API response", async () => {
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, "https://api.day.app/push");
    assert.equal(options?.method, "POST");
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    assert.equal(JSON.parse(String(options?.body)).device_key, "test-key");
    return Response.json({ code: 200 });
  };
  assert.equal(await sendBark("test-key", payload, request), true);
  assert.equal(await sendBark("test-key", payload, async () => Response.json({ code: 400 })), false);
  assert.equal(await sendBark("test-key", payload, async () => Response.json({ code: 200 }, { status: 500 })), false);
  assert.equal(await sendBark("test-key", payload, async () => { throw new Error("offline"); }), false);
});
