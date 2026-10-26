import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("delivery preserves database failures before sending any notification", () => {
  const result = spawnSync(process.execPath, ["--experimental-loader", "./scripts/typescript-test-loader.mjs", "--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import { deliverDueReminderPushes } from "./src/lib/push/deliver.ts";
    import { deliveryErrorLog } from "./src/lib/push/delivery-error.ts";
    for (const table of ["medication_presets", "menstrual_periods", "reminders"]) {
      globalThis.fetch = async input => {
        const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
        assert.equal(url.origin, "https://database.example.test", "must never send a push");
        if (url.pathname.endsWith("/" + table)) {
          return Response.json({ code: "42501", message: "permission denied for table " + table }, { status: 403 });
        }
        return Response.json([]);
      };
      await assert.rejects(deliverDueReminderPushes(new Date("2026-10-27T00:00:00Z")), error => {
        const log = deliveryErrorLog(error);
        assert.ok(log.message.includes(table));
        assert.equal(log.cause.code, "42501");
        assert.equal(log.cause.message, "permission denied for table " + table);
        return true;
      });
    }
  `], {
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_URL: "https://database.example.test",
      SUPABASE_PUBLISHABLE_KEY: "test",
      SUPABASE_SECRET_KEY: "test",
      EVAORBIT_VAPID_PUBLIC_KEY: "",
      EVAORBIT_VAPID_PRIVATE_KEY: "",
      EVAORBIT_VAPID_SUBJECT: "",
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
