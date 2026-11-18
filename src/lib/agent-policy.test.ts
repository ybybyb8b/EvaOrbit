import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createResourceRegistry, type ResourceRegistryOperations } from "./mcp/resource-registry.ts";
import {
  agentConnectionIsActive, agentDataScope, agentPolicyForConnection, allowsAgentCall,
  buildAgentPermissions, canChangeProjectStatus, HERMES_CLIENT, legacyChatGptPolicy, parseAgentPolicy,
} from "./mcp/agent-policy.ts";

const registration = readFileSync(new URL("./mcp/resource-registry.server.ts", import.meta.url), "utf8");
const keys = [...registration.matchAll(/^  (\w+)\s*:/gm)].map((match) => match[1]);
const operations = new Proxy({}, { get: () => () => undefined });
const registry = createResourceRegistry(Object.fromEntries(keys.map((key) => [key, operations])) as ResourceRegistryOperations);
const catalog = buildAgentPermissions(registry.resources());

test("connection policies default to denied and cannot activate missing, paused, revoked or expired sessions", () => {
  for (const state of ["pending","paused","revoked"]) assert.equal(agentConnectionIsActive({ state, expires_at: null }), false);
  assert.equal(agentConnectionIsActive({ state: "active", expires_at: "2026-11-18T08:00:00Z" }, Date.parse("2026-11-18T08:00:00Z")), false);
  assert.equal(agentConnectionIsActive({ state: "active", expires_at: null }), true);
  assert.equal(allowsAgentCall(parseAgentPolicy({}, catalog), catalog, { resource: "task", operation: "search" }), false);
});

test("the legacy ChatGPT migration contains the current explicit compatibility grants", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/202611180001_agent_access.sql", import.meta.url), "utf8");
  const policy = parseAgentPolicy(JSON.parse(migration.split("$policy$")[1]), catalog);
  assert.deepEqual(new Set(policy.permissions), new Set(legacyChatGptPolicy(catalog).permissions));
  for (const resource of ["echo", "memo", "memory_context"]) {
    assert.equal(allowsAgentCall(policy, catalog, { resource, operation: "search" }), true);
    assert.equal(allowsAgentCall(policy, catalog, { resource, operation: "delete" }), false);
  }
  assert.equal(allowsAgentCall(policy, catalog, { resource: "memory_candidate", operation: "action", action: "submit" }), false);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "subscription", operation: "action", action: "record_payment" }), false);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "relation_event", operation: "action", action: "settle" }), false);
});

test("project and Tracker object restrictions, aliases, and aggregate access are independent", () => {
  const policy = parseAgentPolicy({ permissions: ["project:search", "project:get", "project_item:search", "project_item:update",
    "echo:search", "tracker:action:create_entry"], projectIds: [18], trackerIds: [31], projectFields: ["next_step"] }, catalog);
  assert.deepEqual(agentDataScope(policy, "codex", { resource: "project_item", operation: "search" }).projectIds, [18]);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "project", operation: "get", id: 9 }), false);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "project_item", operation: "update", data: { next_step: "Test" } }), true);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "project_item", operation: "update", data: { project_id: 9 } }), false);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "memo", operation: "search" }), true);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "memory_context", operation: "search" }), false);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "insight_context", operation: "get" }), false);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "tracker", operation: "action", action: "create_entry", id: 31 }), true);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "tracker", operation: "action", action: "create_entry", id: 32 }), false);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "tracker", operation: "action", action: "delete_entry", id: 31 }), false);
  assert.equal(canChangeProjectStatus("doing", "done"), true);
  assert.equal(canChangeProjectStatus("done", "verified"), false);
});

test("Hermes can be limited to its own captures and task completion has its own grant", () => {
  const policy = agentPolicyForConnection({ permissions: ["inbox:search", "inbox:create", "task:update"], inboxOwn: false }, catalog, HERMES_CLIENT);
  assert.equal(agentDataScope(policy, HERMES_CLIENT, { resource: "inbox", operation: "search" }).inboxClientId, HERMES_CLIENT);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "inbox", operation: "get" }), false);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "task", operation: "update", data: { completed: true } }), false);
  assert.equal(allowsAgentCall(policy, catalog, { resource: "task", operation: "action", action: "complete" }), false);
});
