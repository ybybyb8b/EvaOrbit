import assert from "node:assert/strict";
import { readMemoryContext } from "../src/lib/memory-context.ts";

const id = (group, n) => group + "0000000-0000-4000-8000-" + String(n).padStart(12, "0");
const today = "2026-11-02";

export async function seedMemoryContext(insert, owner) {
  const at = { user_id: owner, created_at: "2026-11-01 00:00:00", updated_at: "2026-11-01 00:00:00" };
  for (const [n, name, aliases] of [
    [301, "茶山主人", ["泡泡"]], [302, "同名独立", ["泡泡"]], [303, "独处人物", []],
  ]) {
    await insert("memory_entities", { ...at, id: id(1, n), canonical_name: name, aliases, entity_type: "person" });
  }
  await insert("memos", { ...at, id: 300, title: "Remote notebook", content: "Plain narrative", tags: ["旅行标签专用"] });
  await insert("memos", { ...at, id: 301, title: "归档叙事", content: "archive narrative", type: "event",
    status: "archived", event_date: "2025-06-01" });

  async function fact(n, objectValue, extra) {
    await insert("memory_facts", { ...at, id: id(2, n), subject_entity_id: id(1, 301), predicate: "茶饮选择",
      object_value: JSON.stringify(objectValue), valid_from: "2025-07-01", importance: 1, ...extra });
  }
  await fact(302, "旧观点", { valid_from: "2024-01-01", status: "invalidated", invalidation_reason: "superseded", invalidated_at: "2026-10-01" });
  await fact(301, "新版印记", { supersedes_fact_id: id(2, 302) });
  await fact(303, "新茶饮另说", { importance: 4 });
  await fact(304, { preference: "绿茶原味" }, { valid_from: "2025-01-01", valid_to: "2025-06-30" });
  await fact(305, "独立热茶", { subject_entity_id: id(1, 302), importance: 5 });
  await insert("memory_sources", { ...at, id: id(3, 501), fact_id: id(2, 301), source_resource: "manual",
    source_record_id: "OPAQUE-special-context-id", excerpt: "  保留原始证据  " });
  await insert("memory_sources", { ...at, id: id(3, 502), fact_id: id(2, 301), source_resource: "chat", excerpt: "第二原话" });
}

export async function assertMemoryContext(read) {
  const context = (query, options = {}) => readMemoryContext(read, { query, ...options }, { today });
  const memo = await context("行标");
  assert.deepEqual(memo.memos.map(hit => hit.id), [300]);
  assert.deepEqual(memo.memos[0].matched_by, ["memo_tag"]);
  assert.equal(memo.memos[0].time_status, "unknown");
  assert.equal(memo.memos[0].record.eventDate, null);
  assert.equal(memo.coverage.matched_count, 1);
  assert.ok(memo.notices.some(notice => notice.code === "event_date_unknown"));
  assert.equal((await context("归档叙事", { memo_type: "event", memo_status: "archived", from: "2025-05-31", to: "2025-06-01" })).memos[0]?.id, 301);
  assert.equal((await context("归档叙事", { memo_status: "archived", time_mode: "as_of", as_of: "2025-05-31" })).memos.length, 0);
  assert.equal((await context("行标", { from: "2020-01-01" })).memos.length, 0);

  const person = await context("独处人物");
  assert.deepEqual(person.entities.map(hit => hit.id), [id(1, 303)]);
  assert.deepEqual(person.entities[0].matched_by, ["canonical_name"]);
  assert.equal(person.coverage.returned_count, 1);
  assert.deepEqual(person.current_facts, []);
  const alias = await context("泡泡", { entity_ids: [id(1, 301)], query_variants: ["茶山主人", "茶饮选择"] });
  assert.deepEqual(alias.entities.map(hit => hit.id), [id(1, 301)]);
  assert.ok(alias.entities[0].matched_by.includes("alias"));
  assert.ok(alias.current_facts.every(hit => hit.record.subjectEntityId === id(1, 301)));
  const variantHit = alias.current_facts.find(hit => hit.id === id(2, 301));
  assert.ok(variantHit);
  assert.ok(["泡泡", "茶山主人", "茶饮选择"].every(term => variantHit.matched_terms.includes(term)));
  assert.equal(alias.current_facts.filter(hit => hit.id === id(2, 301)).length, 1);
  assert.ok(!alias.current_facts.some(hit => hit.id === id(2, 305)));

  const literal = await context("绿茶原味", { time_mode: "history" });
  assert.equal(literal.historical_facts[0].id, id(2, 304));
  assert.equal(literal.historical_facts[0].time_status, "historical");
  assert.ok(literal.historical_facts[0].matched_by.includes("object_value"));
  const objectEntity = await context("小茶锚点");
  assert.equal(objectEntity.unknown_facts[0].id, id(2, 205));
  assert.ok(objectEntity.unknown_facts[0].matched_by.includes("object_entity_alias"));
  assert.ok(objectEntity.notices.some(notice => notice.code === "validity_unknown"));
  assert.deepEqual(objectEntity.current_facts, []);

  const sourceOnly = await context("special-context");
  assert.equal(sourceOnly.current_facts[0].id, id(2, 301));
  assert.ok(sourceOnly.current_facts[0].matched_by.includes("source_record_id"));
  assert.equal(sourceOnly.current_facts[0].sources_complete, true);
  assert.equal(sourceOnly.current_facts[0].source_ids.length, 2);
  assert.equal(sourceOnly.sources[0].record.excerpt, "  保留原始证据  ");
  const excerpt = await context("第二原话");
  assert.equal(excerpt.current_facts[0].id, id(2, 301));
  assert.ok(excerpt.current_facts[0].matched_by.includes("source_excerpt"));
  const packet = JSON.parse(excerpt.context_text);
  assert.deepEqual(packet.current_facts, excerpt.current_facts);
  assert.deepEqual(packet.sources, excerpt.sources);

  const current = await context("茶饮选择");
  assert.ok(!current.current_facts.some(hit => [id(2, 302), id(2, 304)].includes(hit.id)));
  assert.ok(current.notices.some(notice => notice.code === "different_assertions" &&
    notice.ids.includes(id(2, 301)) && notice.ids.includes(id(2, 303))));
  assert.ok(current.notices.some(notice => notice.code === "missing_source"));
  const asOf = await context("茶饮选择", { time_mode: "as_of", as_of: "2025-06-30" });
  assert.deepEqual(asOf.current_facts.map(hit => [hit.id, hit.time_status]), [[id(2, 304), "as_of"]]);
  assert.equal(asOf.historical_facts[0].time_status, "corrected");
  const history = await context("新版印记", { time_mode: "history" });
  const previous = history.historical_facts.find(hit => hit.id === id(2, 302));
  assert.equal(previous.time_status, "corrected");
  assert.deepEqual(previous.matched_by, ["version_link"]);
  assert.ok(history.notices.some(notice => notice.code === "corrected_history"));

  const ranked = await context("茶山主人", { query_variants: ["茶饮选择"] });
  assert.ok(ranked.current_facts.findIndex(hit => hit.id === id(2, 301)) < ranked.current_facts.findIndex(hit => hit.id === id(2, 305)));
  const limited = await context("茶饮选择", { limit: 1 });
  assert.equal(limited.coverage.returned_count, 1);
  assert.ok(limited.coverage.reasons.includes("result_limit"));
  const budget = await context("独特凭证", { max_chars: 3500 });
  assert.equal(budget.unknown_facts[0].id, id(2, 203));
  assert.equal(budget.unknown_facts[0].sources_complete, false);
  assert.ok(budget.sources.length > 0 && budget.sources.length < 206);
  assert.ok(budget.context_text.length <= 3500);
  assert.ok(budget.coverage.reasons.includes("source_incomplete"));
  assert.ok(budget.coverage.reasons.includes("character_budget"));

  const partial = await readMemoryContext((resource, input) => {
    if (resource === "source" && input.cursor) throw new Error("fixture source failure");
    return read(resource, input);
  }, { query: "独特凭证", max_chars: 200000 }, { today });
  assert.equal(partial.coverage.status, "failed");
  assert.ok(partial.coverage.reasons.includes("source_incomplete"));
  assert.equal(partial.unknown_facts[0].id, id(2, 203));
  assert.equal(partial.sources.length, 100);
  const empty = await context("nonexistentneedle");
  assert.deepEqual([empty.coverage.complete, empty.coverage.matched_count, empty.context_text], [true, 0, ""]);
  await assert.rejects(() => context("茶饮", { time_mode: "as_of" }), /as_of/);
  await assert.rejects(() => context("茶饮", { as_of: "2026-02-30", time_mode: "as_of" }), /as_of/);
  await assert.rejects(() => context("茶饮", { query_variants: Array(9).fill("词") }), /variants/);
}
