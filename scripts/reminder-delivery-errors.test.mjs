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

test("transient JWT failures in reconciliation recover and send a due notification only once", () => {
  const result = spawnSync(process.execPath, ["--experimental-loader", "./scripts/typescript-test-loader.mjs", "--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import { encryptAiApiKey } from "./src/lib/ai-secret.ts";
    import { deliverDueReminderPushes } from "./src/lib/push/deliver.ts";
    const encrypted = encryptAiApiKey("test-bark-device");
    const attempts = new Map();
    let sent = 0, reservations = 0;
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
      if (url.origin === "https://api.day.app") {
        sent += 1;
        return Response.json({ code: 200 });
      }
      assert.equal(url.origin, "https://database.example.test");
      const table = url.pathname.split("/").at(-1);
      const method = init?.method ?? "GET";
      if (method === "GET" && ["medication_presets", "menstrual_periods", "reminders"].includes(table)) {
        const count = (attempts.get(table) ?? 0) + 1;
        attempts.set(table, count);
        if (count === 1) return Response.json({ code: "PGRST303", message: "JWT issued at future" }, { status: 401 });
      }
      if (table === "reminders" && method === "GET" && !url.searchParams.has("source_type")) {
        return Response.json([{ id: 1, user_id: "owner", title: "Test", source_type: null,
          target_type: "task", target_id: 1, next_due_at: "2026-10-31T00:00:00.000Z",
          due_has_explicit_time: true, status: "scheduled", is_active: true,
          delivery_channel: "pwa", timezone: "Asia/Shanghai", interval_value: null, lead_time_minutes: 0 }]);
      }
      if (table === "bark_notification_settings") {
        return Response.json({ enabled: true, ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag });
      }
      if (table === "notification_deliveries" && method === "POST") {
        reservations += 1;
        return Response.json({ id: 1 });
      }
      return Response.json([]);
    };
    const result = await deliverDueReminderPushes(new Date("2026-10-31T00:01:00Z"));
    assert.equal(result.sent, 1);
    assert.equal(sent, 1);
    assert.equal(reservations, 1);
    assert.equal(attempts.get("medication_presets"), 2);
    assert.equal(attempts.get("menstrual_periods"), 2);
    assert.equal(attempts.get("reminders"), 3);
  `], {
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_URL: "https://database.example.test",
      SUPABASE_PUBLISHABLE_KEY: "test",
      SUPABASE_SECRET_KEY: "test",
      EVAORBIT_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      EVAORBIT_VAPID_PUBLIC_KEY: "",
      EVAORBIT_VAPID_PRIVATE_KEY: "",
      EVAORBIT_VAPID_SUBJECT: "",
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
