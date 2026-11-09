import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import { readMemoryRecall } from "../src/lib/memory-recall.ts";
import { assertMemoryContext, seedMemoryContext } from "./memory-context-fixture.mjs";

const isSqlite = process.argv[2] === "sqlite";
const uuid = (group, id) => group + "0000000-0000-4000-8000-" + String(id).padStart(12, "0");
const owner = isSqlite ? "local" : uuid(9, 1), other = uuid(9, 2);
const timestamp = "2026-11-01 00:00:00";
const earlier = "2026-10-01 00:00:00";
const target = uuid(2, 203);
const tableCounts = { memo: 205, entity: 205, fact: 205, source: 410, candidate: 205 };

let requestId = 0;
async function callMcp(userId, name, args = {}) {
  const { mcpHandler } = await import("../src/lib/mcp/server.ts");
  const { withMcpRequestRepository } = await import("../src/lib/repositories/index.ts");
  return withMcpRequestRepository({ userId, accessToken: "fixture-" + userId }, async () => {
    const response = await mcpHandler.fetch(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method: "tools/call", params: { name, arguments: args } }),
    }));
    const raw = await response.text();
    const payload = JSON.parse(response.headers.get("content-type")?.includes("text/event-stream") ?
      raw.split("\n").find(line => line.startsWith("data:")).slice(5) : raw);
    if (payload.result?.isError) throw new Error(payload.result.content[0].text);
    if (payload.error) throw new Error(payload.error.message);
    assert.equal(response.status, 200, raw);
    return payload.result.structuredContent;
  });
}

async function searchContext(userId, args) {
  const result = await callMcp(userId, "eo_search", { resource: "memory_context", ...args });
  assert.equal(result.resource, "memory_context");
  assert.equal(result.next_cursor, null);
  assert.equal(result.items.length, 1);
  return result.items[0];
}

async function assertMcpContext(userId) {
  const call = (name, args) => callMcp(userId, name, args);
  const search = args => searchContext(userId, args);
  const { resources } = await call("eo_resources");
  const resource = resources.find(item => item.resource === "memory_context");
  assert.deepEqual(resource.capabilities, ["search"]);
  assert.deepEqual(resource.actions, []);
  const { schema } = await call("eo_schema", { resource: resource.resource });
  assert.deepEqual(schema.capabilities, ["search"]);
  assert.deepEqual(schema.create_fields, []);
  assert.deepEqual(schema.update_fields, []);
  assert.deepEqual(schema.action_schemas, {});
  assert.match(schema.operation_semantics.lifecycle, /Search only/);
  assert.equal(schema.search_schema.pagination, "none");
  assert.equal(schema.search_schema.query_required, true);
  assert.equal(schema.search_schema.query_max_length, 20000);
  assert.deepEqual(schema.search_schema.limit, { min: 1, max: 20, default: 8 });
  assert.deepEqual(Object.keys(schema.search_schema.filters), [
    "query_variants", "entity_ids", "time_mode", "as_of", "from", "to", "memo_type", "memo_status", "max_chars",
  ]);

  const filtered = await search({
    query: "未命中的问题", limit: 8,
    filters: { query_variants: ["绿茶原味", "归档叙事"], entity_ids: [uuid(1, 301)], time_mode: "as_of",
      as_of: "2025-06-30", from: "2025-01-01", to: "2025-06-30", memo_type: "event", memo_status: "archived", max_chars: 50000 },
  });
  assert.deepEqual(filtered.current_facts.map(hit => hit.id), [uuid(2, 304)]);
  assert.ok(filtered.current_facts[0].matched_terms.includes("绿茶原味"));
  assert.equal(filtered.current_facts[0].time_status, "as_of");
  assert.deepEqual(filtered.entities.map(hit => hit.id), [uuid(1, 301)]);
  assert.deepEqual(filtered.memos.map(hit => hit.id), [301]);
  assert.equal(filtered.coverage.complete, true);

  const packet = await search({ query: "第二原话", filters: { time_mode: "history" } });
  assert.deepEqual(Object.keys(packet).sort(), [
    "version", "query", "time", "current_facts", "historical_facts", "unknown_facts",
    "memos", "entities", "sources", "notices", "coverage", "context_text",
  ].sort());
  const fact = [...packet.current_facts, ...packet.historical_facts].find(hit => hit.id === uuid(2, 301));
  assert.ok(fact.matched_by.includes("source_excerpt"));
  assert.ok(packet.entities.some(hit => hit.id === fact.record.subjectEntityId));
  assert.deepEqual(fact.source_ids, [uuid(3, 502), uuid(3, 501)]);
  assert.equal(packet.sources.find(hit => hit.id === uuid(3, 501)).record.excerpt, "  保留原始证据  ");
  assert.ok(packet.notices.some(notice => notice.code === "corrected_history"));
  const rendered = JSON.parse(packet.context_text);
  assert.deepEqual(rendered.sources, packet.sources);
  assert.deepEqual(rendered.historical_facts, packet.historical_facts);

  const empty = await search({ query: "x".repeat(501) });
  assert.equal(empty.coverage.complete, true);
  assert.equal(empty.coverage.matched_count, 0);
  assert.deepEqual(empty.coverage.reasons, []);
  const limited = await search({ query: "unrelated" });
  assert.equal(limited.coverage.returned_count, 8);
  assert.equal(limited.coverage.status, "partial");
  assert.ok(limited.coverage.reasons.includes("result_limit"));
  const budget = await search({ query: "memo-only", filters: { max_chars: 1 } });
  assert.equal(budget.coverage.complete, false);
  assert.equal(budget.coverage.status, "partial");
  assert.ok(budget.coverage.reasons.includes("character_budget"));
  assert.equal(budget.coverage.matched_count, 1);
  assert.ok(budget.context_text.length <= 1);
}

async function seed(insert, owner, amount = 205) {
  const at = { user_id: owner, created_at: timestamp, updated_at: timestamp };
  for (let i = 1; i <= amount; i++) {
    await insert("memos", { ...at, id: owner === other ? 999 : i, title: "Memo " + i,
      content: i === 205 ? "叙事独享 memo-only" : "unrelated narrative", tags: ["fixture"] });
    await insert("memory_entities", { ...at, id: uuid(1, owner === other ? 999 : i), canonical_name: "Entity " + i,
      entity_type: "person", aliases: i === 205 ? ["小茶锚点"] : [] });
  }
  if (owner === other) return;
  for (let i = 1; i <= amount; i++) {
    await insert("memory_facts", { ...at, id: uuid(2, i), subject_entity_id: uuid(1, i),
      predicate: i === 204 || i === 205 ? "prefers" : "states", object_entity_id: i === 205 ? uuid(1, 205) : null,
      object_value: i === 205 ? null : JSON.stringify(i === 204 ? { nested: ["雪茶%_", true, 42, 1e-7] } : "unrelated"),
      importance: i >= 203 ? 1 : 5, valid_from: i === 204 ? "2026-11-01" : null,
      valid_to: i === 204 ? "2026-11-03" : null });
    await insert("memory_sources", { ...at, id: uuid(3, i), fact_id: uuid(2, i), source_resource: i === 202 ? "meeting" : "chat",
      source_record_id: i === 202 ? "meeting-202" : null, note: i === 202 ? "追踪说明" : null, excerpt: "common evidence" });
    await insert("memory_fact_candidates", { user_id: owner, created_at: i === 205 ? earlier : timestamp, id: uuid(4, i),
      proposed_fact: JSON.stringify({ subjectEntityId: uuid(1, i), predicate: "states", objectValue: "draft" }),
      proposed_sources: JSON.stringify([{ sourceResource: "chat", excerpt: "draft evidence" }]), proposed_by: "user",
      status: i === 205 ? "pending" : i === 204 ? "promoted" : "rejected",
      promoted_fact_id: i === 204 ? uuid(2, 204) : null, reviewed_at: i === 205 ? null : timestamp });
  }
  for (let i = 206; i <= 410; i++) {
    await insert("memory_sources", { ...at, id: uuid(3, i), fact_id: target, source_resource: "chat",
      excerpt: i >= 409 ? "独特凭证" : "supplement" });
  }
}

async function traverse(read, options, count) {
  const seen = [];
  let cursor;
  do {
    const page = await read({ ...options, limit: 37, cursor });
    assert.equal(page.has_more, page.next_cursor !== null);
    assert.ok(page.items.length <= 37);
    seen.push(...page.items.map(item => item.id));
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  assert.equal(seen.length, count);
  assert.equal(new Set(seen).size, count);
  return seen;
}

async function contract(repo) {
  const read = repo.pageMemory.bind(repo);
  for (const [resource, count] of Object.entries(tableCounts)) {
    for (const order of ["display", "created"]) {
      const ids = await traverse(input => read(resource, input), { order }, count);
      if (resource !== "candidate") assert.equal(ids[0], resource === "memo" ? 205 : uuid({ entity: 1, fact: 2, source: 3 }[resource], 1));
    }
  }
  const first = await read("memo", { limit: 1, tag: "fixture" });
  for (const request of [
    () => read("memo", { cursor: first.next_cursor, tag: "different" }),
    () => read("memo", { cursor: first.next_cursor, tag: "fixture", order: "created" }),
    () => read("entity", { cursor: first.next_cursor }),
    () => read("memo", { cursor: "" }),
  ]) await assert.rejects(request, /cursor/i);
  assert.deepEqual(await read("memo", { query: "missing" }), { items: [], has_more: false, next_cursor: null });
  const through = await read("memo", { limit: 200, query: "Memo " });
  const last = await read("memo", { cursor: through.next_cursor, limit: 5, query: "Memo " });
  assert.equal(last.items.length, 5);
  assert.equal(last.next_cursor, null);
  assert.equal(last.has_more, false);

  const fact = await read("fact", { query: "雪茶%_", limit: 1, validOn: "2026-11-01" });
  assert.equal(fact.items[0]?.id, uuid(2, 204));
  assert.equal((await read("fact", { query: "雪茶%_", validOn: "2026-11-03" })).items.length, 1);
  assert.equal((await read("fact", { query: "雪茶%_", validOn: "2026-11-04" })).items.length, 0);
  assert.equal((await read("fact", { query: "小茶锚点", predicate: "prefers", limit: 1 })).items[0]?.id, uuid(2, 205));
  for (const query of ["nested", "true", "42", "0.0000001", "1e-7"]) {
    assert.equal((await read("fact", { query, limit: 1 })).items[0]?.id, uuid(2, 204));
  }
  assert.equal((await read("candidate", { status: "pending", proposedBy: "user", limit: 1 })).items[0]?.id, uuid(4, 205));
  assert.equal((await read("candidate", { promotedFactId: uuid(2, 204) })).items[0]?.id, uuid(4, 204));
  assert.equal((await read("source", { query: "独特凭证", limit: 2 })).items.length, 2);
  for (const query of ["meeting", "追踪说明"]) {
    assert.deepEqual((await read("source", { query })).items.map(item => item.id), [uuid(3, 202)]);
  }
  const matchingFacts = await read("fact", { relatedTerms: ["独特凭证"] });
  assert.deepEqual(matchingFacts.items.map(item => item.id), [target]);
  const recallCalls = [];
  const tracked = (resource, input) => { recallCalls.push([resource, input]); return read(resource, input); };
  const byEvidence = await readMemoryRecall(tracked, "独特凭证", { maxChars: 200000, validOn: "2026-11-02" });
  assert.equal(byEvidence.coverage.complete, true);
  assert.equal(byEvidence.facts[0]?.fact.id, target);
  assert.equal(byEvidence.facts[0]?.sources.length, 206);
  assert.match(byEvidence.facts[0].explanation, /validity unknown/);
  assert.equal(recallCalls.filter(([resource]) => resource === "source").length, 3);
  assert.ok(recallCalls.filter(([resource]) => resource === "source").every(([,input]) => input.factIds.length === 1 && input.factIds[0] === target));
  assert.ok(!recallCalls.some(([resource]) => resource === "candidate"));
  const byAlias = await readMemoryRecall(read, "小茶锚点", { validOn: "2026-11-02" });
  assert.equal(byAlias.facts[0]?.fact.id, uuid(2, 205));
  assert.ok(byAlias.facts[0].channels.includes("exact"));
  const onlyMemo = await readMemoryRecall(read, "memo-only", { validOn: "2026-11-02" });
  assert.equal(onlyMemo.memos[0]?.id, 205);
  assert.deepEqual(onlyMemo.facts, []);
  const samePredicate = await readMemoryRecall(read, "prefers", { validOn: "2026-11-02" });
  assert.deepEqual(samePredicate.facts.map(hit => hit.fact.id), [uuid(2, 204), uuid(2, 205)]);
  const limited = await readMemoryRecall(read, "prefers", { limit: 1, validOn: "2026-11-02" });
  assert.equal(limited.coverage.status, "partial");
  assert.ok(limited.coverage.reasons.includes("result_limit"));
  const small = await readMemoryRecall(read, "memo-only", { maxChars: 40 });
  assert.equal(small.coverage.status, "partial");
  assert.ok(small.coverage.reasons.includes("character_budget"));
  const empty = await readMemoryRecall(read, "nonexistentneedle");
  assert.deepEqual(empty, { facts: [], memos: [], coverage: { status: "complete", complete: true, reasons: [] } });
  const failed = await readMemoryRecall(async () => { throw new Error("fixture query failure"); }, "test");
  assert.equal(failed.coverage.status, "failed");
  const timer = setTimeout(() => {}, 250);
  try {
    const timeout = await readMemoryRecall(() => new Promise(() => {}), "test", { timeoutMs: 10 });
    assert.equal(timeout.coverage.status, "timeout");
  } finally { clearTimeout(timer); }
}

function insertWith(execute, sqlite = false) {
  return async (table, row) => {
    const entries = Object.entries(row);
    const args = entries.map(([, value]) => sqlite && Array.isArray(value) ? JSON.stringify(value) : value);
    await execute("insert into " + table + " (" + entries.map(([column]) => column).join(",") + ") values (" +
      entries.map((_, index) => sqlite ? "?" : "$" + (index + 1)).join(",") + ")", args);
  };
}

if (isSqlite) {
  const { sqliteRepository } = await import("../src/lib/repositories/sqlite.ts");
  const sql = new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
  try {
    await seed(insertWith((query, params) => sql.prepare(query).run(...params), true), owner);
    await contract(sqliteRepository);
    const search = (resource, input) => callMcp(owner, "eo_search", { resource, ...input });
    for (const [resource, count] of Object.entries(tableCounts)) {
      await traverse(input => search(resource === "memo" ? "memo" : "memory_" + resource, input), { filters: { order: "created" } }, count);
    }
    assert.equal((await search("memory_source", { query: "独特凭证", limit: 1 })).has_more, true);
    assert.equal((await search("memory_fact", { query: "雪茶%_", limit: 1 })).items[0].id, uuid(2, 204));
    const page = await search("memory_source", { query: "独特凭证", limit: 1 });
    await assert.rejects(() => search("memory_source", { query: "different", limit: 1, cursor: page.next_cursor }), /cursor/i);
    assert.deepEqual((await search("memory_source", { query: "missing" })).items, []);
    await seedMemoryContext(insertWith((query, params) => sql.prepare(query).run(...params), true), owner);
    for (const table of ["memos", "memory_entities", "memory_facts", "memory_sources", "memory_fact_candidates"]) {
      for (const action of ["insert", "update", "delete"]) {
        sql.exec("create trigger forbid_" + table + "_" + action + " before " + action + " on " + table +
          " begin select raise(abort,'memory context must be read-only'); end");
      }
    }
    await assertMemoryContext(sqliteRepository.pageMemory.bind(sqliteRepository));
    await assertMcpContext(owner);
    for (const [args, message] of [
      [{}, /query/i],
      [{ query: " \t" }, /query/i],
      [{ query: "茶", filters: { primary_resource: "fact" } }, /primary_resource/i],
      [{ query: "茶", filters: { query_variants: null } }, /query_variants/i],
      [{ query: "茶", filters: { entity_ids: ["bad"] } }, /entity_ids/i],
      [{ query: "茶", filters: { time_mode: "future" } }, /time_mode/i],
      [{ query: "茶", filters: { time_mode: "as_of", as_of: "2025-02-30" } }, /as_of/i],
      [{ query: "茶", filters: { from: "2025-06-30", to: "2025-01-01" } }, /from|to/i],
      [{ query: "茶", filters: { memo_status: "pending" } }, /memo_status/i],
      [{ query: "茶", filters: { max_chars: 0 } }, /max_chars/i],
      [{ query: "茶", limit: 21 }, /limit/i],
      [{ query: "茶", cursor: "" }, /cursor/i],
    ]) await assert.rejects(() => searchContext(owner, args), message);
    for (const [name, args] of Object.entries({
      eo_get: { id: "context" }, eo_create: { data: {} },
      eo_update: { id: "context", data: {} }, eo_delete: { id: "context" }, eo_action: { action: "submit" },
    })) await assert.rejects(() => callMcp(owner, name, { resource: "memory_context", ...args }), /does not support/);
    assert.equal((await search("memo", { query: "Memo " })).items.length, 20);
    await assert.rejects(() => search("memo", { query: "x".repeat(501) }), /500/);
  } finally { sql.close(); }
} else {
  const pg = new PGlite();
  try {
    await pg.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);" +
      "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;" +
      "create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;" +
      "grant usage on schema auth to authenticated;create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;");
    await pg.query("insert into auth.users values($1),($2)", [owner, other]);
    for (const name of ["202608290004_memo_lucius", "202609070001_memory_graph", "202609200001_memory_graph_v02",
      "202611070002_memory_write_governance", "202611070003_memory_web_review", "202611070004_memory_source_patch",
      "202611070005_memory_source_unicode", "202611070006_memory_user_confirmed_evidence", "202611070007_memory_read_pagination",
      "202611070008_memory_context_reads"]) {
      await pg.exec(readFileSync(new URL("../supabase/migrations/" + name + ".sql", import.meta.url), "utf8"));
    }
    await seed(insertWith(pg.query.bind(pg)), owner);
    await seed(insertWith(pg.query.bind(pg)), other, 1);
    await pg.query("select set_config('test.uid',$1,false)", [owner]);
    await pg.exec("set role authenticated");
    let authenticatedOwner = owner;
    globalThis.fetch = async (input, options) => {
      const url = new URL(input);
      assert.equal(url.origin, "https://memory-page.invalid");
      assert.equal(url.pathname, "/rest/v1/rpc/read_memory_page");
      const { p_resource, p_filters, p_order, p_after, p_limit } = JSON.parse(options.body);
      const authorization = new Headers(options.headers).get("authorization");
      if (authorization?.startsWith("Bearer fixture-")) assert.equal(authorization, "Bearer fixture-" + authenticatedOwner);
      if (p_filters.relatedTerms?.includes("context-probe-failure")) {
        return Response.json({ message: "fixture query failure" }, { status: 400 });
      }
      if (p_filters.relatedTerms?.includes("context-probe-timeout")) {
        const timer = setTimeout(() => {}, 3000);
        try {
          await new Promise((_, reject) => {
            options.signal.throwIfAborted();
            options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
          });
        } finally { clearTimeout(timer); }
      }
      const { rows } = await pg.query("select row from read_memory_page($1,$2,$3,$4,$5) as row",
        [p_resource, p_filters, p_order, p_after, p_limit]);
      return Response.json(rows.map(row => row.row));
    };
    const { createMcpSupabaseRepository } = await import("../src/lib/repositories/supabase.ts");
    const repo = await createMcpSupabaseRepository("offline", owner);
    await contract(repo);
    await pg.exec("reset role");
    await seedMemoryContext(insertWith(pg.query.bind(pg)), owner);
    await pg.exec("set role authenticated; set default_transaction_read_only=on");
    await assertMemoryContext(repo.pageMemory.bind(repo));
    process.env.EVAORBIT_DATA_BACKEND = "supabase";
    await assertMcpContext(owner);
    for (const [probe, status, reason] of [
      ["context-probe-failure", "failed", "query_failed"],
      ["context-probe-timeout", "timeout", "timeout"],
    ]) {
      const packet = await searchContext(owner, { query: probe });
      assert.equal(packet.coverage.status, status);
      assert.equal(packet.coverage.complete, false);
      assert.ok(packet.coverage.reasons.includes(reason));
    }
    const first = await repo.pageMemory("memo", { limit: 1 });
    assert.ok(first.next_cursor);
    assert.ok(!(await repo.pageMemory("memo", { query: "Memo 1" })).items.some(item => item.id === 999));
    await pg.query("select set_config('test.uid',$1,false)", [other]);
    authenticatedOwner = other;
    const otherRepo = await createMcpSupabaseRepository("offline", other);
    await assert.rejects(() => otherRepo.pageMemory("memo", { limit: 1, cursor: first.next_cursor }), /cursor/i);
    assert.deepEqual((await otherRepo.pageMemory("memo")).items.map(row => row.id), [999]);
    const { readMemoryContext } = await import("../src/lib/memory-context.ts");
    const hidden = await readMemoryContext(otherRepo.pageMemory.bind(otherRepo), { query: "茶饮选择", time_mode: "history" });
    assert.equal(hidden.coverage.complete, true);
    assert.equal(hidden.coverage.matched_count, 0);
    const hiddenMcp = await searchContext(other, { query: "茶饮选择", filters: { time_mode: "history" } });
    assert.equal(hiddenMcp.coverage.complete, true);
    assert.equal(hiddenMcp.coverage.matched_count, 0);
  } finally { await pg.close(); }
}
