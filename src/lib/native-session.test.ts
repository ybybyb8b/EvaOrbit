import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseNativeLoginCredentials } from "./native-session.ts";
import { ValidationError } from "./validation.ts";

test("normalizes native login credentials without changing the password", () => {
  assert.deepEqual(parseNativeLoginCredentials({ email: "  Owner@Example.COM ", password: " secret " }), {
    email: "owner@example.com",
    password: " secret ",
  });
});

test("rejects malformed native login credentials", () => {
  assert.throws(() => parseNativeLoginCredentials(null), ValidationError);
  assert.throws(() => parseNativeLoginCredentials({ email: "", password: "secret" }), ValidationError);
  assert.throws(() => parseNativeLoginCredentials({ email: "owner@example.com", password: "" }), ValidationError);
  assert.throws(() => parseNativeLoginCredentials({ email: "owner@example.com", password: 123 }), ValidationError);
});

test("native session is the only unauthenticated entry point added for SwiftUI login", () => {
  const route = readFileSync(new URL("../app/api/native/session/route.ts", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /pathname === "\/api\/native\/session"/);
  assert.match(route, /signInWithPassword/);
  assert.match(route, /getClaims/);
  assert.match(route, /signOut/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(route, /SUPABASE_PUBLISHABLE_KEY|SUPABASE_URL/);
});
