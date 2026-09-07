import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { retryDelayMs } from "./local-first-inbox.ts";

test("pending Inbox mutations back off without becoming an infinite tight loop", () => {
  assert.equal(retryDelayMs(1), 1_000);
  assert.equal(retryDelayMs(2), 2_000);
  assert.equal(retryDelayMs(7), 60_000);
  assert.equal(retryDelayMs(50), 60_000);
});

test("Inbox migration scopes create idempotency to one user and records update receipts", () => {
  const migration = readFileSync(resolve("supabase/migrations/202609070002_inbox_client_mutation_id.sql"), "utf8");
  assert.match(migration, /client_mutation_id uuid/);
  assert.match(migration, /last_client_mutation_id uuid/);
  assert.match(migration, /inbox_items\(user_id, client_mutation_id\)/);
});

test("Native Host enables persistent App-Bound Service Worker shell caching", () => {
  const project = readFileSync(resolve("ios/EvaOrbitHost/project.yml"), "utf8");
  const webView = readFileSync(resolve("ios/EvaOrbitHost/Sources/WebViewController.swift"), "utf8");
  const registration = readFileSync(resolve("src/components/pwa-register.tsx"), "utf8");
  const worker = readFileSync(resolve("public/sw.js"), "utf8");
  assert.match(project, /WKAppBoundDomains:\s+- eva-orbit\.vercel\.app/);
  assert.match(webView, /websiteDataStore = \.default\(\)|websiteDataStore = \.default/);
  assert.match(webView, /limitsNavigationsToAppBoundDomains = true/);
  assert.match(registration, /await activatedWorker\(registration\)/);
  assert.match(registration, /new MessageChannel\(\)/);
  assert.match(worker, /reply\?\.postMessage\(\{ ok: true \}\)/);
});
