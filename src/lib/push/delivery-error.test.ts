import assert from "node:assert/strict";
import test from "node:test";
import { deliveryErrorLog } from "./delivery-error.ts";

test("delivery logs retain operation, SQLSTATE and original error without arbitrary data", () => {
  const error = new Error("Could not create period medication reminder projection", {
    cause: { code: "42501", message: "permission denied for table reminders", details: "private row", headers: { cookie: "private" } },
  });
  const log = deliveryErrorLog(error);
  assert.equal(log.message, error.message);
  assert.match(String(log.stack), /delivery-error.test.ts/);
  assert.deepEqual(log.cause, { code: "42501", message: "permission denied for table reminders" });
});

test("delivery logs redact credentials in messages and nested stacks, and bound causes", () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret-value";
  try {
    const error = new Error("test-cron-secret-value Bearer unknown-token https://push.example/private-key");
    error.cause = new Error("eyJhbGciOiJIUzI1NiJ9.payload.signature\nCookie: private-session=value");
    (error.cause as Error).cause = error;
    const logged = JSON.stringify(deliveryErrorLog(error));
    for (const value of ["test-cron-secret-value", "unknown-token", "private-key", "payload.signature", "private-session"] ) {
      assert.ok(!logged.includes(value), value);
    }
    assert.ok(logged.includes("REDACTED"));
    assert.ok(logged.length < 20000);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
