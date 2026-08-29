import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createResourceRegistry, type ChronicleResourceOperations } from "./mcp/resource-registry.ts";
import type { ChronicleEntry } from "./types.ts";

function fakeChronicleOperations() {
  let nextId = 0;
  const entries: ChronicleEntry[] = [];
  const operations: ChronicleResourceOperations = {
    async search({ query, limit = 20 }) {
      const needle = query?.toLocaleLowerCase();
      return entries.filter((entry) => !needle || entry.title.toLocaleLowerCase().includes(needle) || entry.contentMd.toLocaleLowerCase().includes(needle)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, limit);
    },
    async get(id) { return entries.find((entry) => entry.id === id) ?? null; },
    async create(input) {
      const entry: ChronicleEntry = { ...input, id: ++nextId, createdAt: "2026-08-29T00:00:00Z", updatedAt: "2026-08-29T00:00:00Z" };
      entries.push(entry);
      return entry;
    },
    async update(id, input) {
      const entry = entries.find((item) => item.id === id);
      if (!entry) return null;
      Object.assign(entry, input, { updatedAt: "2026-08-29T01:00:00Z" });
      return entry;
    },
    async delete(id) {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) return false;
      entries.splice(index, 1);
      return true;
    },
  };
  return { operations, entries };
}

test("registry exposes only Chronicle with declared CRUD capabilities and schema", () => {
  const { operations } = fakeChronicleOperations();
  const registry = createResourceRegistry(operations);
  assert.deepEqual(registry.resources().map((entry) => entry.resource), ["chronicle"]);
  assert.deepEqual(registry.resources()[0].capabilities, ["search", "get", "create", "update", "delete"]);
  const schema = registry.schema("chronicle");
  assert.deepEqual(schema.required_fields, ["date", "title", "content_md"]);
  assert.deepEqual(schema.writable_fields, ["date", "title", "content_md", "source"]);
  assert.deepEqual(schema.searchable_fields, ["title", "content_md"]);
  assert.deepEqual(schema.supported_actions, []);
  assert.throws(() => registry.schema("media"), /Unknown resource/);
});

test("generic Chronicle flow supports strict create, search, get, PATCH update, get and safe delete", async () => {
  const { operations } = fakeChronicleOperations();
  const registry = createResourceRegistry(operations);
  const created = await registry.create("chronicle", { date: "2026-08-29", title: "Inspector entry", content_md: "# Original\n\nKeep this body.", source: "manual" });
  const id = created.id as number;
  assert.deepEqual((await registry.search("chronicle", { query: "Keep this", limit: 20 })).items.map((item) => item.id), [id]);
  assert.equal((await registry.get("chronicle", id)).title, "Inspector entry");
  const updated = await registry.update("chronicle", id, { title: "Inspector entry patched" });
  assert.equal(updated.title, "Inspector entry patched");
  assert.equal(updated.content_md, "# Original\n\nKeep this body.");
  assert.equal(updated.date, "2026-08-29");
  assert.equal(updated.source, "manual");
  assert.equal((await registry.get("chronicle", id)).content_md, "# Original\n\nKeep this body.");
  assert.deepEqual(await registry.delete("chronicle", id), { deleted: true, id });
  await assert.rejects(() => registry.get("chronicle", id), /not found/i);
});

test("registry rejects unknown fields, invalid resource data, filters and unregistered actions", async () => {
  const { operations } = fakeChronicleOperations();
  const registry = createResourceRegistry(operations);
  await assert.rejects(() => registry.create("chronicle", { date: "2026-02-30", title: "Bad", content_md: "Body" }), /日期/);
  await assert.rejects(() => registry.create("chronicle", { date: "2026-08-29", title: "Bad", content_md: "Body", table: "tasks" }), /does not accept: table/);
  await assert.rejects(() => registry.update("chronicle", 1, {}), /没有可更新/);
  await assert.rejects(() => registry.search("chronicle", { filters: { source: "manual" }, limit: 20 }), /does not accept: source/);
  await assert.rejects(() => registry.action("chronicle", { action: "resolve", data: {} }), /does not support action/);
});

test("production registry delegates Chronicle delete to the existing business service", () => {
  const source = readFileSync(new URL("./mcp/resource-registry.server.ts", import.meta.url), "utf8");
  assert.match(source, /delete: deleteChronicleEntry/);
  assert.match(source, /create: createChronicleEntry/);
  assert.doesNotMatch(source, /from\([^)]*table|\.from\(|DELETE FROM|repository\./i);
});
