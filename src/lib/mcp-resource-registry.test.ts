import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCatRoutine } from "./cats-validation.ts";
import { parseDrinkLimit, parseNewTracker } from "./validation.ts";
import { createResourceRegistry, type ResourceRegistryOperations } from "./mcp/resource-registry.ts";
import type { ChronicleEntry, FoodDish, FoodPlace, InboxItem, LuciusCase, LuciusDiaryEntry, LuciusPost, LuciusPostComment, LuciusState, Memo, MemoryEntity, MemoryFact, MemorySource, Project, ProjectItem, Task } from "./types.ts";

test("production schemas describe every action and distinguish create from PATCH", async () => {
  const operations = fakeOperations().operations;
  const bindings = readFileSync(new URL("./mcp/resource-registry.server.ts", import.meta.url), "utf8");
  for (const [, key] of bindings.matchAll(/^\s*(\w+):\s*\{/gm)) Object.assign(operations, { [key]: {} });
  const registry = createResourceRegistry(operations);
  assert.equal(registry.resources().length, 36);
  assert.equal(registry.resources().reduce((sum, item) => sum + item.actions.length, 0), 37);
  for (const item of registry.resources()) {
    const schema = registry.schema(item.resource);
    assert.deepEqual(Object.keys(schema.action_schemas).sort(), [...item.actions].sort(), item.resource);
    for (const key of [...schema.create_fields, ...schema.update_fields]) {
      assert.ok(schema.fields[key], `${item.resource}.${key} has a field definition`);
      assert.notEqual(schema.fields[key].read_only, true, `${item.resource}.${key} is writable`);
    }
    for (const [name, action] of Object.entries(schema.action_schemas)) {
      assert.equal(action.id_required, true);
      assert.ok(action.result_description);
      for (const key of action.required_fields) assert.ok(action.fields[key]);
      await assert.rejects(() => registry.action(item.resource, { action: name, id: 1, data: { unexpected: true } }), /does not accept: unexpected/);
    }
  }
  assert.deepEqual(registry.schema("lucius_post_comment").update_fields, ["content"]);
  assert.deepEqual(registry.schema("person_note").update_fields, ["content"]);
  assert.ok(!registry.schema("media").update_fields.includes("title"));
  assert.ok(!registry.schema("media").update_fields.includes("watched_date"));
  assert.ok(!registry.schema("memory_fact").update_fields.includes("predicate"));
  assert.ok(!registry.schema("memory_source").update_fields.includes("fact_id"));
  assert.deepEqual(registry.schema("lucius_state").create_fields, []);
});

test("Drink Limit PATCH preserves omitted configuration and rejects empty or invalid patches", async () => {
  const item = { ...parseDrinkLimit({ name: "Coffee", targetType: "coffee", period: "daily", limitValue: 3 }), id: 1, createdAt, updatedAt: createdAt };
  let writes = 0;
  const registry = createResourceRegistry({ ...fakeOperations().operations, drinkLimit: {
    async search() { return [item]; }, async create() { throw new Error("unused"); },
    async update(id, input) { writes++; assert.equal(id, 1); Object.assign(item, input); return item; }, async delete() { return false; },
  } });
  const patched = await registry.update("drink_limit", 1, { enabled: false });
  assert.equal(patched.enabled, false);
  assert.equal(patched.name, "Coffee"); assert.equal(patched.target_type, "coffee");
  assert.equal(patched.period, "daily"); assert.equal(patched.limit_value, 3);
  await registry.update("drink_limit", 1, { limit_value: 2 });
  assert.equal(item.enabled, false);
  await assert.rejects(() => registry.update("drink_limit", 1, {}), /No Drink limit fields/);
  await assert.rejects(() => registry.update("drink_limit", 1, { limit_value: 0 }));
  await assert.rejects(() => registry.update("drink_limit", 2, { enabled: true }), /not found/);
  assert.equal(writes, 2);
});

test("Cat Routine PATCH preserves modern schedule and reminder linkage, including legacy time edits", async () => {
  const item = { ...parseCatRoutine({ scope: "household", title: "Care", intervalValue: 7, intervalUnit: "day", recurrenceMode: "fixed", anchorDate: "2026-01-01", firstDueDate: "2026-01-01", nextDueDate: "2026-10-08", configuredReminderTime: "08:15", timezone: "UTC", repeatWhileOverdue: true }), id: 1, reminderId: 77, lastCompletedAt: null, createdAt, updatedAt: createdAt };
  let archives = 0, deletes = 0;
  const registry = createResourceRegistry({ ...fakeOperations().operations, catRoutine: {
    async search() { return [item]; }, async get(id) { return id === 1 ? item : null; }, async create() { throw new Error("unused"); },
    async update(id, input) { assert.equal(id, 1); assert.equal(Object.hasOwn(input, "reminderId"), false); Object.assign(item, input); return item; },
    async complete() { return {}; }, async skip() { return {}; }, async archive() { archives++; return true; }, async delete(id) { deletes++; return id === 1; },
  } });
  const before = { ...item };
  const patched = await registry.update("cat_routine", 1, { notes: "Only note" });
  assert.deepEqual(item, { ...before, notes: "Only note" });
  assert.equal(patched.reminder_id, 77);
  await registry.update("cat_routine", 1, { next_due_date: "2026-10-10", configured_reminder_time: "09:27" });
  assert.equal(item.nextDueAt, "2026-10-10T09:27:00.000Z");
  await registry.update("cat_routine", 1, { next_due_at: "2026-10-12T09:27:00Z" });
  assert.equal(item.nextDueDate, "2026-10-12");
  await registry.update("cat_routine", 1, { first_due_at: "2026-01-02T10:33:00Z" });
  assert.equal(item.firstDueDate, "2026-01-02"); assert.equal(item.configuredReminderTime, "10:33");
  assert.equal(item.recurrenceMode, "fixed"); assert.equal(item.timezone, "UTC"); assert.equal(item.reminderId, 77);
  await assert.rejects(() => registry.update("cat_routine", 1, {}), /No Cat routine fields/);
  assert.deepEqual(await registry.delete("cat_routine", 1), { deleted: true, id: 1 });
  assert.deepEqual(await registry.action("cat_routine", { id: 1, action: "archive", data: {} }), { archived: true, id: 1 });
  await assert.rejects(() => registry.action("cat_routine", { id: 1, action: "archive", data: { acted_at: "2026-01-01" } }), /does not accept/);
  assert.equal(archives, 1); assert.equal(deletes, 1);
  await assert.rejects(() => registry.delete("cat_routine", 2), /not found/);
});

test("generic Tracker discovery pages more than 100 Trackers without losing entries", async () => {
  const operations = fakeOperations().operations;
  const template = { ...parseNewTracker({ name: "Template" }), id: 1, createdAt, updatedAt: createdAt };
  const summaries = Array.from({ length: 205 }, (_, index) => ({ ...template, id: index + 1, name: "Tracker " + (index + 1), stats: { today: 0, week: 0, month: 0, year: 0, total: 0, lastOccurredAt: null, reminderDue: false } }));
  const registry = createResourceRegistry({ ...operations, tracker: {
    async search() { return [...summaries].reverse(); },
    async get() { throw new Error("unused"); }, async create() { throw new Error("unused"); }, async update() { throw new Error("unused"); }, async delete() { return false; },
    async createField() { return {}; }, async deleteField() { return false; }, async createEntry() { return {}; }, async updateEntry() { return null; }, async deleteEntry() { return false; },
    async createGoal() { return {}; }, async deleteGoal() { return false; }, async createReminder() { return {}; }, async deleteReminder() { return false; },
  } });
  const seen: unknown[] = [];
  let cursor: string | undefined;
  do {
    const page = await registry.search("tracker", { query: "Tracker ", limit: 100, cursor });
    seen.push(...page.items.map(record => record.id));
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  assert.deepEqual(seen, summaries.map(record => record.id));
  await assert.rejects(() => registry.search("tracker", { limit: 100, cursor: "other:100" }), /Invalid Tracker cursor/);
  await assert.rejects(() => registry.search("tracker", { limit: 100, cursor: "tracker:9007199254740992" }), /Invalid Tracker cursor/);
});

function trackerTestRegistry() {
  const tracker = { ...parseNewTracker({ name: "One" }), id: 1, createdAt, updatedAt: createdAt };
  const children = { fields: [{ id: 11 }], entries: [{ id: 12 }], goals: [{ id: 13 }], reminders: [{ id: 14 }] };
  const writes: Array<{ action: string; input: object }> = [];
  const registry = createResourceRegistry({ ...fakeOperations().operations, tracker: {
    async search() { return []; }, async get(id) { return id === 1 ? { tracker, ...children, stats: {}, insights: {} } : null; },
    async create() { return tracker; }, async update() { return tracker; }, async delete() { return true; },
    async createField(input) { writes.push({ action: "create_field", input }); return input; },
    async createEntry(input) { writes.push({ action: "create_entry", input }); return input; },
    async createGoal(input) { writes.push({ action: "create_goal", input }); return input; },
    async createReminder(input) { writes.push({ action: "create_reminder", input }); return input; },
    async updateEntry(id, input) { writes.push({ action: "update_entry", input: { id, ...input } }); return input; },
    async deleteField(id) { writes.push({ action: "delete_field", input: { id } }); return true; },
    async deleteEntry(id) { writes.push({ action: "delete_entry", input: { id } }); return true; },
    async deleteGoal(id) { writes.push({ action: "delete_goal", input: { id } }); return true; },
    async deleteReminder(id) { writes.push({ action: "delete_reminder", input: { id } }); return true; },
  } });
  return { registry, writes };
}

test("Tracker actions persist real Goal and Reminder fields and reject ignored or conflicting inputs", async () => {
  const { registry, writes } = trackerTestRegistry();
  const goal = await registry.action("tracker", { id: 1, action: "create_goal", data: { period_type: "custom", custom_period: "Quarter", target_value: 4 } });
  assert.equal(goal.custom_period, "Quarter"); assert.equal(goal.target_value, 4);
  for (const key of ["name", "field_id", "period_start", "period_end"]) {
    await assert.rejects(() => registry.action("tracker", { id: 1, action: "create_goal", data: { [key]: "ignored before" } }), /does not accept/);
  }
  const reminder = await registry.action("tracker", { id: 1, action: "create_reminder", data: { reminder_mode: "standard", configured_time: "08:15", period_days: 7, anchor_date: "2026-10-01", timezone: "UTC" } });
  assert.equal(reminder.reminder_mode, "standard"); assert.equal(reminder.configured_time, "08:15");
  assert.equal(reminder.period_days, 7); assert.equal(reminder.timezone, "UTC");
  assert.equal(reminder.next_due_at, "2026-10-01T08:15:00.000Z");
  const legacy = await registry.action("tracker", { id: 1, action: "create_reminder", data: { reminder_type: "interval", time_of_day: "09:30", interval_days: 3, anchor_date: "2026-10-01", timezone: "UTC" } });
  assert.equal(legacy.reminder_mode, "missing"); assert.equal(legacy.next_due_at, "2026-10-03T09:30:00.000Z");
  await assert.rejects(() => registry.action("tracker", { id: 1, action: "create_reminder", data: { days_of_week: [1, 2] } }), /does not accept/);
  await assert.rejects(() => registry.action("tracker", { id: 1, action: "create_reminder", data: { reminder_type: "unknown" } }), /invalid/);
  await assert.rejects(() => registry.action("tracker", { id: 1, action: "create_reminder", data: { reminder_mode: "standard", reminder_type: "interval" } }), /conflicts/);
  await assert.rejects(() => registry.action("tracker", { id: 1, action: "create_reminder", data: { enabled: "false" } }), /must be boolean/);
  await assert.rejects(() => registry.action("tracker", { id: 1, action: "create_field", data: {} }), /requires data.name/);
  assert.equal(writes.length, 3);
});

test("Tracker update and deletion cannot mutate children through the wrong parent", async () => {
  const { registry, writes } = trackerTestRegistry();
  for (const [action, id] of [["delete_field", 11], ["delete_entry", 12], ["delete_goal", 13], ["delete_reminder", 14]] as const) {
    await assert.rejects(() => registry.action("tracker", { id: 2, action, data: { child_id: id } }), /not found in this Tracker/);
    await assert.rejects(() => registry.action("tracker", { id: 1, action, data: { child_id: 999 } }), /not found in this Tracker/);
    await registry.action("tracker", { id: 1, action, data: { child_id: id } });
  }
  await assert.rejects(() => registry.action("tracker", { id: 2, action: "update_entry", data: { entry_id: 12, note: "wrong parent" } }), /not found in this Tracker/);
  await registry.action("tracker", { id: 1, action: "update_entry", data: { entry_id: 12, note: "correct parent" } });
  assert.equal(writes.length, 5);
});

test("Cat record schema and validation follow the selected kind", async () => {
  const records = new Map<number, object>();
  const registry = createResourceRegistry({ ...fakeOperations().operations, catRecord: {
    async search() { return []; }, async get(kind, id) { return records.get(id) ?? null; },
    async create(kind, input) { const record = { ...input, id: 1 }; records.set(1, record); return record; },
    async update(kind, id, input) { const record = { ...input, id }; records.set(id, record); return record; }, async delete() { return true; },
  } });
  const schema = registry.schema("cat_record");
  assert.equal(schema.fields.details.read_only, true);
  assert.ok(schema.field_variants?.medication.required_fields.includes("started_at"));
  const measurement = await registry.create("cat_record", { kind: "measurement", pet_id: 1, occurred_at: "2026-10-01T04:00:00Z", occurred_has_explicit_time: false, measurement_type: "weight", value: 4, unit: "kg" });
  assert.equal(measurement.id, "measurement:1"); assert.equal(measurement.occurred_has_explicit_time, false);
  assert.equal((await registry.update("cat_record", "measurement:1", { value: 4.2 })).value, 4.2);
  await assert.rejects(() => registry.create("cat_record", { kind: "measurement", pet_id: 1, diagnosis: "ignored before" }), /does not accept: diagnosis/);
  await assert.rejects(() => registry.update("cat_record", "measurement:1", { dose: "ignored before" }), /does not accept: dose/);
});

const createdAt = "2026-08-29T00:00:00Z";
function fakeOperations() {
  const inbox: InboxItem[] = [];
  const tasks: Task[] = [];
  const chronicles: ChronicleEntry[] = [];
  const memos: Memo[] = [];
  const diary: LuciusDiaryEntry[] = [];
  const cases: LuciusCase[] = [];
  const luciusState: LuciusState = { status: "quiet", mood: "composed", updatedAt: null };
  const projects: Project[] = [];
  const projectItems: ProjectItem[] = [];
  const memoryEntities: MemoryEntity[] = [];
  const memoryFacts: MemoryFact[] = [];
  const memorySources: MemorySource[] = [];
  let nextInbox = 0, nextTask = 0, nextChronicle = 0, nextMemo = 0, nextDiary = 0, nextCase = 0, nextProject = 0, nextProjectItem = 0;
  let nextMemoryId = 0;
  const memoryId = () => `00000000-0000-4000-8000-${String(++nextMemoryId).padStart(12,"0")}`;
  const remove = <T extends { id: number }>(items: T[], id: number) => { const index = items.findIndex((item) => item.id === id); if (index < 0) return false; items.splice(index, 1); return true; };
  const operations: ResourceRegistryOperations = {
    memoryEntity: {
      async search({query,entityType,status,includeMerged,limit=100}) { const needle=query?.toLocaleLowerCase(); return memoryEntities.filter(item=>(includeMerged||status||item.status!=="merged")&&(!status||item.status===status)&&(!entityType||item.entityType===entityType)&&(!needle||item.canonicalName.toLocaleLowerCase().includes(needle)||item.aliases.some(alias=>alias.toLocaleLowerCase().includes(needle)))).slice(0,limit); },
      async get(id) { const entity=memoryEntities.find(item=>item.id===id); return entity?{entity,facts:memoryFacts.filter(fact=>fact.subjectEntityId===id||fact.objectEntityId===id)}:null; },
      async create(input) { const item:MemoryEntity={...input,id:memoryId(),status:"active",mergedIntoEntityId:null,createdAt,updatedAt:createdAt};memoryEntities.push(item);return item; },
      async update(id,input) { const item=memoryEntities.find(entry=>entry.id===id&&entry.status!=="merged");if(!item)return null;Object.assign(item,input,{updatedAt:createdAt});return item; },
      async setArchived(id,archived) { const item=memoryEntities.find(entry=>entry.id===id&&entry.status!=="merged");if(!item)return null;item.status=archived?"archived":"active";return item; },
      async merge(sourceId,targetId) { const source=memoryEntities.find(item=>item.id===sourceId&&item.status==="active"),target=memoryEntities.find(item=>item.id===targetId&&item.status==="active");if(!source||!target||source===target)return null;const changed=new Set<string>();for(const fact of memoryFacts){if(fact.subjectEntityId===sourceId){fact.subjectEntityId=targetId;changed.add(fact.id);}if(fact.objectEntityId===sourceId){fact.objectEntityId=targetId;changed.add(fact.id);}if(fact.perspectiveEntityId===sourceId){fact.perspectiveEntityId=targetId;changed.add(fact.id);}}source.status="merged";source.mergedIntoEntityId=targetId;target.aliases=[...new Set([...target.aliases,...source.aliases,source.canonicalName])];return{entity:target,redirectedFacts:changed.size,selfLoops:memoryFacts.filter(f=>f.subjectEntityId===targetId&&f.objectEntityId===targetId).length}; },
    },
    memoryFact: {
      async search({entityId,direction="both",predicate,perspectiveEntityId,status,validOn,limit=100}) { return memoryFacts.filter(item=>(!entityId||(direction!=="in"&&item.subjectEntityId===entityId)||(direction!=="out"&&item.objectEntityId===entityId))&&(!predicate||item.predicate===predicate)&&(perspectiveEntityId===undefined||item.perspectiveEntityId===perspectiveEntityId)&&(!status||item.status===status)&&(!validOn||(!item.validFrom||item.validFrom<=validOn)&&(!item.validTo||item.validTo>=validOn))).slice(0,limit); },
      async get(id) { const fact=memoryFacts.find(item=>item.id===id);return fact?{fact,sources:memorySources.filter(source=>source.factId===id)}:null; },
      async create(input) { const item:MemoryFact={...input,id:memoryId(),status:"active",invalidatedAt:null,invalidationReason:null,createdAt,updatedAt:createdAt};memoryFacts.push(item);return item; },
      async update(id,input) { const item=memoryFacts.find(entry=>entry.id===id);if(!item)return null;Object.assign(item,input);return item; },
      async invalidate(id,reason) { const item=memoryFacts.find(entry=>entry.id===id&&entry.status==="active");if(!item)return null;item.status="invalidated";item.invalidatedAt=createdAt;item.invalidationReason=reason;return item; },
      async restore(id) { const item=memoryFacts.find(entry=>entry.id===id&&entry.status==="invalidated");if(!item)return null;item.status="active";item.invalidatedAt=null;item.invalidationReason=null;return item; },
    },
    memorySource: {
      async search({factId,sourceResource,sourceRecordId,limit=100}) { return memorySources.filter(item=>(!factId||item.factId===factId)&&(!sourceResource||item.sourceResource===sourceResource)&&(!sourceRecordId||item.sourceRecordId===sourceRecordId)).slice(0,limit); },
      async get(id) { return memorySources.find(item=>item.id===id)??null; },
      async create(input) { const item:MemorySource={...input,id:memoryId(),createdAt,updatedAt:createdAt};memorySources.push(item);return item; },
      async update(id,input) { const item=memorySources.find(entry=>entry.id===id);if(!item)return null;Object.assign(item,input);return item; },
      async delete(id) { const index=memorySources.findIndex(item=>item.id===id);if(index<0)return false;memorySources.splice(index,1);return true; },
    },
    inbox: {
      async search({ query, status = "inbox", limit = 20 }) { const needle = query?.toLocaleLowerCase(); return inbox.filter((item) => (status === "all" || item.status === status) && (!needle || item.content.toLocaleLowerCase().includes(needle))).slice(0, limit); },
      async get(id) { return inbox.find((item) => item.id === id) ?? null; },
      async create(input) { const item: InboxItem = { ...input, id: ++nextInbox, status: "inbox", processedAt: null, convertedType: null, convertedId: null, createdAt, updatedAt: createdAt }; inbox.push(item); return item; },
      async update(id, patch) { const item = inbox.find((entry) => entry.id === id); if (!item) return null; Object.assign(item, patch, { updatedAt: "2026-08-30T00:00:00Z" }); return item; },
      async delete(id) { return remove(inbox, id); },
      async markProcessed(id) { const item = inbox.find((entry) => entry.id === id); if (!item) return null; Object.assign(item, { status: "processed", processedAt: "2026-08-30T00:00:00Z", updatedAt: "2026-08-30T00:00:00Z" }); return item; },
      async archive(id) { const item = inbox.find((entry) => entry.id === id); if (!item) return null; Object.assign(item, { status: "archived", updatedAt: "2026-08-30T00:00:00Z" }); return item; },
      async restore(id) { const item = inbox.find((entry) => entry.id === id); if (!item) return null; Object.assign(item, { status: "inbox", processedAt: null, updatedAt: "2026-08-30T00:00:00Z" }); return item; },
    },
    task: {
      async search(status = "all") { return tasks.filter((item) => status === "all" || (status === "done") === item.completed); },
      async get(id) { return tasks.find((item) => item.id === id) ?? null; },
      async create(input) { const item: Task = { ...input, id: ++nextTask, completed: false, completedAt:null, reminderId: null, createdAt, updatedAt: createdAt }; tasks.push(item); return item; },
      async update(id, patch) { const item = tasks.find((entry) => entry.id === id); if (!item) return null; Object.assign(item, patch, { updatedAt: "2026-08-30T00:00:00Z" }); return item; },
      async delete(id) { return remove(tasks, id); },
    },
    chronicle: {
      async search({ query, limit = 20 }) { const needle = query?.toLocaleLowerCase(); return chronicles.filter((item) => !needle || item.title.toLocaleLowerCase().includes(needle) || item.contentMd.toLocaleLowerCase().includes(needle)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, limit); },
      async get(id) { return chronicles.find((item) => item.id === id) ?? null; },
      async create(input) { const item: ChronicleEntry = { ...input, id: ++nextChronicle, createdAt, updatedAt: createdAt }; chronicles.push(item); return item; },
      async update(id, patch) { const item = chronicles.find((entry) => entry.id === id); if (!item) return null; Object.assign(item, patch, { updatedAt: "2026-08-30T00:00:00Z" }); return item; },
      async delete(id) { return remove(chronicles, id); },
    },
    memo: {
      async search({ query, tag, type, status, limit = 20 }) { const needle = query?.toLocaleLowerCase(); return memos.filter((item) => (!needle || item.title.toLocaleLowerCase().includes(needle) || item.content.toLocaleLowerCase().includes(needle)) && (!tag || item.tags.includes(tag)) && (!type || item.type === type) && (!status || item.status === status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id).slice(0, limit); },
      async get(id) { return memos.find((item) => item.id === id) ?? null; },
      async create(input) { const item: Memo = { ...input, id: ++nextMemo, createdAt, updatedAt: createdAt }; memos.push(item); return item; },
      async update(id, patch) { const item = memos.find((entry) => entry.id === id); if (!item) return null; Object.assign(item, patch, { updatedAt: "2026-08-30T00:00:00Z" }); return item; },
      async delete(id) { return remove(memos, id); },
    },
    luciusDiary: {
      async search({ query, tag, limit = 20 }) { const needle = query?.toLocaleLowerCase(); return diary.filter((item) => (!needle || item.content.toLocaleLowerCase().includes(needle)) && (!tag || item.tags.includes(tag))).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, limit); },
      async get(id) { return diary.find((item) => item.id === id) ?? null; },
      async create(input) { const item: LuciusDiaryEntry = { ...input, id: ++nextDiary, createdAt, updatedAt: createdAt }; diary.push(item); return item; },
      async update(id, patch) { const item = diary.find((entry) => entry.id === id); if (!item) return null; Object.assign(item, patch, { updatedAt: "2026-08-30T00:00:00Z" }); return item; },
      async delete(id) { return remove(diary, id); },
    },
    luciusCase: {
      async search({ query, errorType, severity, status, currentOnly, limit = 20 }) { const needle = query?.toLocaleLowerCase(); return cases.filter((item) => (!needle || item.title.toLocaleLowerCase().includes(needle) || item.cause.toLocaleLowerCase().includes(needle) || item.mandatoryRule.toLocaleLowerCase().includes(needle)) && (!errorType || item.errorType === errorType) && (!severity || item.severity === severity) && (!status || item.status === status) && (!currentOnly || item.status === "serving" || item.status === "probation")).sort((a, b) => b.latestOccurredDate.localeCompare(a.latestOccurredDate) || b.id - a.id).slice(0, limit); },
      async get(id) { return cases.find((item) => item.id === id) ?? null; },
      async create(input) { const item: LuciusCase = { ...input, id: ++nextCase, createdAt, updatedAt: createdAt }; cases.push(item); return item; },
      async update(id, patch) { const item = cases.find((entry) => entry.id === id); if (!item) return null; Object.assign(item, patch, { updatedAt: "2026-08-30T00:00:00Z" }); return item; },
      async delete(id) { return remove(cases, id); },
      async recordRecurrence(id, occurredDate = "2026-08-31") { const item = cases.find((entry) => entry.id === id); if (!item) return null; const interval = Math.round((Date.parse(`${occurredDate}T00:00:00Z`) - Date.parse(`${item.latestOccurredDate}T00:00:00Z`)) / 86400000) || null; Object.assign(item, { occurrenceCount: item.occurrenceCount + 1, latestOccurredDate: occurredDate, recurrenceIntervalDays: interval, isRecurrence: true, consecutiveCorrectCount: 0, updatedAt: "2026-08-31T00:00:00Z" }); return item; },
    },
    luciusState: {
      async get() { return luciusState; },
      async update(input) { Object.assign(luciusState, input, { updatedAt: "2026-09-01T14:41:00Z" }); return luciusState; },
    },
    project: {
      async search({ query, status, limit = 20 }) { return projects.filter((item) => (!query || item.name.includes(query)) && (!status || item.status === status)).slice(0, limit); },
      async get(id) { return projects.find((item) => item.id === id) ?? null; },
      async create(input) { const item:Project={...input,id:++nextProject,doingCount:0,toSolveCount:0,createdAt,updatedAt:createdAt};projects.push(item);return item; },
      async update(id,patch){const item=projects.find((entry)=>entry.id===id);if(!item)return null;Object.assign(item,patch,{updatedAt:"2026-08-30T00:00:00Z"});return item;},
    },
    projectItem: {
      async search({ query, projectId, project, status, type, module, limit = 20 }) { return projectItems.filter((item)=>(!query||item.title.includes(query)||item.description?.includes(query)||item.resolution?.includes(query))&&(!projectId||item.projectId===projectId)&&(!project||item.projectName===project)&&(!status||item.status===status)&&(!type||item.type===type)&&(!module||item.module===module)).slice(0,limit); },
      async get(id){return projectItems.find((item)=>item.id===id)??null;},
      async create(input){const owner=projects.find((item)=>item.id===input.projectId);const item:ProjectItem={...input,id:++nextProjectItem,projectName:owner?.name,createdAt,startedAt:null,completedAt:input.status==="done"||input.status==="verified"?createdAt:null,verifiedAt:input.status==="verified"?createdAt:null,updatedAt:createdAt};projectItems.push(item);return item;},
      async update(id,patch){const item=projectItems.find((entry)=>entry.id===id);if(!item)return null;Object.assign(item,patch,{updatedAt:"2026-08-30T00:00:00Z"});if(patch.status==="done"&&!item.completedAt)item.completedAt=item.updatedAt;if(patch.status==="verified"&&!item.verifiedAt){item.completedAt??=item.updatedAt;item.verifiedAt=item.updatedAt;}return item;},
    },
    relationPerson:{async search(){return[];},async get(){return null;},async create(){throw new Error("unused");},async update(){return null;}},
    relationEvent:{async search(){return[];},async get(){return null;},async create(){throw new Error("unused");},async update(){return null;},async delete(){return false;},async settle(){throw new Error("unused");}},
    personNote:{async search(){return[];},async get(){return null;},async create(){throw new Error("unused");},async update(){return null;},async delete(){return false;}},
  };
  return { operations, inbox, tasks, chronicles, memos, diary, cases, memoryEntities, memoryFacts, memorySources };
}

test("registry exposes long-term memory and project resources without changing generic tools", () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  assert.deepEqual(registry.resources().map((entry) => entry.resource), ["memory_entity", "memory_fact", "memory_source", "inbox", "task", "memo", "chronicle", "lucius_diary", "lucius_case", "lucius_state", "project", "project_item", "relation_person", "relation_event", "person_note"]);
  assert.deepEqual(registry.resources().find((entry) => entry.resource === "inbox")?.capabilities, ["search", "get", "create", "update", "delete", "action"]);
  assert.deepEqual(registry.resources().find((entry) => entry.resource === "chronicle")?.capabilities, ["search", "get", "create", "update", "delete"]);
  assert.deepEqual(registry.resources().find((entry) => entry.resource === "lucius_case")?.capabilities, ["search", "get", "create", "update", "delete", "action"]);
  assert.deepEqual(registry.resources().find((entry) => entry.resource === "lucius_state")?.capabilities, ["get", "update"]);
  assert.deepEqual(registry.schema("chronicle").required_fields, ["date", "title", "content_md"]);
  assert.deepEqual(registry.schema("chronicle").writable_fields, ["date", "title", "content_md", "source"]);
  assert.deepEqual(registry.schema("chronicle").searchable_fields, ["title", "content_md"]);
  assert.deepEqual(registry.schema("lucius_case").supported_actions, ["record_recurrence"]);
  assert.deepEqual(registry.schema("inbox").supported_actions, ["mark_processed", "archive", "restore"]);
  assert.deepEqual(registry.schema("inbox").writable_fields, ["content"]);
  assert.equal(registry.schema("memory_fact").fields.object_value.type,"json");
  assert.equal(registry.schema("memory_fact").fields.confidence.type,"number");
  assert.ok(registry.schema("relation_person").writable_fields.includes("closeness_rank"));
  assert.ok(registry.schema("relation_person").writable_fields.includes("relationship_status"));
  assert.equal(registry.schema("relation_person").fields.last_met_at.read_only, true);
  assert.match(registry.schema("relation_person").validation_rules.join(" "), /new events never change/i);
  assert.match(registry.schema("memo").validation_rules.join(" "), /status=active/);
  assert.match(registry.schema("project_item").validation_rules.join(" "), /never automatically promoted to verified/);
  assert.throws(() => registry.schema("media"), /Unknown resource/);
});

test("reminder registry can discover subscription-owned reminder projections", async () => {
  const {operations}=fakeOperations();
  const targets:Array<string|undefined>=[];
  operations.reminder={
    async search(input){targets.push(input.targetType);return[];},
    async create(){throw new Error("unused");},
    async update(){return null;},
    async delete(){return false;},
    async complete(){throw new Error("unused");},
    async skip(){throw new Error("unused");},
    async snooze(){return null;},
  };
  const registry=createResourceRegistry(operations);
  assert.ok(registry.schema("reminder").fields.target_type.enum?.includes("subscription"));
  await registry.search("reminder",{filters:{target_type:"subscription"},limit:20});
  assert.deepEqual(targets,["subscription"]);
});

test("Memory Graph resources preserve lifecycle, provenance, and immutable assertion shape", async () => {
  const registry=createResourceRegistry(fakeOperations().operations);
  const eva=await registry.create("memory_entity",{canonical_name:"Eva",entity_type:"identity",aliases:["EvaOrbit"]});
  const project=await registry.create("memory_entity",{canonical_name:"EvaOrbit",entity_type:"project",aliases:["Orbit"]});
  assert.equal(typeof eva.id,"string");
  assert.deepEqual((await registry.search("memory_entity",{query:"orbit",filters:{},limit:20})).items.map(item=>item.id),[eva.id,project.id]);
  const fact=await registry.create("memory_fact",{subject_entity_id:eva.id,predicate:"maintains",object_entity_id:project.id,perspective_entity_id:eva.id,confidence:0.9,importance:5,valid_from:"2026-09-01"});
  const source=await registry.create("memory_source",{fact_id:fact.id,source_resource:"external",source_record_id:"0007",source_url:"https://example.com/source"});
  assert.equal(source.source_record_id,"0007");
  assert.deepEqual((await registry.search("memory_fact",{filters:{entity_id:project.id,direction:"in",predicate:"maintains",status:"active",valid_on:"2026-09-07"},limit:20})).items.map(item=>item.id),[fact.id]);
  assert.deepEqual((await registry.search("memory_source",{filters:{source_resource:"external",source_record_id:"0007"},limit:20})).items.map(item=>item.id),[source.id]);
  await assert.rejects(()=>registry.update("memory_fact",fact.id as string,{predicate:"owns"}),/does not accept: predicate/);
  assert.equal((await registry.action("memory_fact",{id:fact.id as string,action:"invalidate",data:{reason:"corrected"}})).status,"invalidated");
  assert.equal((await registry.action("memory_fact",{id:fact.id as string,action:"restore",data:{}})).status,"active");
  const merged=await registry.action("memory_entity",{id:eva.id as string,action:"merge",data:{target_entity_id:project.id}});
  assert.equal(merged.redirected_facts,1);
  assert.equal((await registry.get("memory_entity",eva.id as string)).merged_into_entity_id,project.id);
  const factDetail=await registry.get("memory_fact",fact.id as string);
  assert.equal((factDetail.sources as Array<Record<string,unknown>>)[0].id,source.id);
  await assert.rejects(()=>registry.delete("memory_fact",fact.id as string),/does not support delete/);
  await assert.rejects(()=>registry.search("memory_source",{filters:{source_record_id:7},limit:20}),/opaque string/);
});

test("optional Web API resources are exposed when production operations are registered", async () => {
  const base=fakeOperations().operations;
  const posts:LuciusPost[]=[];
  const comments:LuciusPostComment[]=[];
  const registry=createResourceRegistry({...base,luciusPost:{
    async search({limit=20}){return posts.slice(0,limit);},
    async get(id){return posts.find(item=>item.id===id)??null;},
    async create(input){const item={...input,id:posts.length+1,createdAt,updatedAt:createdAt};posts.unshift(item);return item;},
    async update(id,input){const item=posts.find(post=>post.id===id);if(!item)return null;Object.assign(item,input,{updatedAt:"2026-09-02T01:00:00Z"});return item;},
    async delete(id){const index=posts.findIndex(post=>post.id===id);if(index<0)return false;posts.splice(index,1);return true;},
  },luciusPostComment:{
    async search({postId,author,limit=20}){return comments.filter(item=>(!postId||item.postId===postId)&&(!author||item.author===author)).slice(0,limit);},
    async get(id){return comments.find(item=>item.id===id)??null;},
    async create(input){const item:LuciusPostComment={...input,id:comments.length+1,createdAt,updatedAt:createdAt};comments.push(item);return item;},
    async update(id,input){const item=comments.find(comment=>comment.id===id);if(!item)return null;Object.assign(item,input,{updatedAt:"2026-09-02T01:00:00Z"});return item;},
    async delete(id){const index=comments.findIndex(comment=>comment.id===id);if(index<0)return false;comments.splice(index,1);return true;},
  }});
  assert.ok(registry.resources().some(item=>item.resource==="lucius_post"));
  assert.ok(registry.resources().some(item=>item.resource==="lucius_post_comment"));
  assert.ok(!registry.resources().some(item=>item.resource==="memory"));
  const created=await registry.create("lucius_post",{content:"The room is quiet.",published_at:"2026-09-02T00:00:00Z"});
  assert.equal(created.content,"The room is quiet.");
  assert.equal((await registry.get("lucius_post",created.id as number)).published_at,"2026-09-02T00:00:00.000Z");
  assert.equal((await registry.update("lucius_post",created.id as number,{content:"Still quiet."})).content,"Still quiet.");
  const comment=await registry.create("lucius_post_comment",{post_id:created.id,author:"lucius",content:"I heard you."});
  assert.equal(comment.author,"lucius");
  assert.deepEqual((await registry.search("lucius_post_comment",{filters:{post_id:created.id,author:"lucius"},limit:20})).items.map(item=>item.id),[comment.id]);
  assert.equal((await registry.update("lucius_post_comment",comment.id as number,{content:"Still listening."})).content,"Still listening.");
  await assert.rejects(()=>registry.update("lucius_post_comment",comment.id as number,{author:"user"}),/does not accept: author/);
  assert.deepEqual(await registry.delete("lucius_post_comment",comment.id as number),{deleted:true,id:comment.id});
  assert.deepEqual(await registry.delete("lucius_post",created.id as number),{deleted:true,id:created.id});
});

test("food place and dish resources expose safe generic CRUD",async()=>{
  const base=fakeOperations().operations,places:FoodPlace[]=[],dishes:FoodDish[]=[];
  const registry=createResourceRegistry({...base,foodPlace:{
    async search(query="",options={}){return places.filter(item=>(!query||item.name.includes(query))&&(!options.status||item.status===options.status)).slice(0,options.limit??20);},
    async get(id){return places.find(item=>item.id===id)??null;},
    async create(input){const item:FoodPlace={...input,id:places.length+1,archivedAt:null,dishCount:0,visitCount:0,lastVisitedAt:null,createdAt,updatedAt:createdAt};places.push(item);return item;},
    async update(id,input){const item=places.find(entry=>entry.id===id);if(!item)return null;Object.assign(item,input);return item;},
    async delete(id){const index=places.findIndex(item=>item.id===id);if(index<0)return null;places.splice(index,1);return{id,action:"deleted" as const};},
  },foodDish:{
    async search(query="",options={}){return dishes.filter(item=>(!query||item.name.includes(query))&&(!options.foodPlaceId||item.foodPlaceId===options.foodPlaceId)).slice(0,options.limit??20);},
    async get(id){return dishes.find(item=>item.id===id)??null;},
    async create(input){const item:FoodDish={...input,id:dishes.length+1,archivedAt:null,eatCount:0,lastEatenAt:null,createdAt,updatedAt:createdAt};dishes.push(item);return item;},
    async update(id,input){const item=dishes.find(entry=>entry.id===id);if(!item)return null;Object.assign(item,input);return item;},
    async delete(id){const index=dishes.findIndex(item=>item.id===id);if(index<0)return false;dishes.splice(index,1);return true;},
  }});
  assert.deepEqual(registry.resources().slice(-2).map(item=>item.resource),["food_place","food_dish"]);
  const place=await registry.create("food_place",{name:"某某米线",branch:"天府和悦店",city:"成都",location:"高新区",category:"米线",rating:"love",status:"frequent"});
  assert.equal(place.city,"成都");assert.equal(place.location,"高新区");
  assert.equal((await registry.update("food_place",place.id as number,{city:"重庆",location:""})).city,"重庆");
  const dish=await registry.create("food_dish",{food_place_id:place.id,name:"番茄米线",rating:"good",recommended:true});
  assert.equal(dish.food_place_id,place.id);assert.equal(dish.recommended,true);
  assert.deepEqual((await registry.search("food_dish",{filters:{food_place_id:place.id,recommended:true},limit:20})).items.map(item=>item.id),[dish.id]);
  assert.equal((await registry.update("food_place",place.id as number,{status:"paused"})).status,"paused");
  assert.deepEqual(await registry.delete("food_dish",dish.id as number),{deleted:true,id:dish.id});
  await assert.rejects(()=>registry.create("food_place",{name:"Bad",postcode:"not supported"}),/does not accept: postcode/);
});

test("Lucius state is a single explicit MCP-updatable display resource", async () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  assert.equal((await registry.get("lucius_state", "current")).status, "quiet");
  const updated = await registry.update("lucius_state", "current", { status: "resting", mood: "composed" });
  assert.equal("current_note" in updated, false);
  await assert.rejects(() => registry.update("lucius_state", "current", { current_note: "retired" }), /does not accept/);
  assert.equal(updated.updated_at, "2026-09-01T14:41:00Z");
  await assert.rejects(() => registry.get("lucius_state", "other"), /id must be current/);
  await assert.rejects(() => registry.update("lucius_state", "current", { affection: 91 }), /does not accept/);
});

test("generic Inbox searches current and historical items while lifecycle changes stay actions", async () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  const first = await registry.create("inbox", { content: "整理 Reacher 观后感" });
  const second = await registry.create("inbox", { content: "给项目补一条需求" });
  assert.equal(first.source, "chatgpt");
  assert.deepEqual((await registry.search("inbox", { query: "Reacher", filters: {}, limit: 20 })).items.map((item) => item.id), [first.id]);
  const processed = await registry.action("inbox", { id: first.id as number, action: "mark_processed", data: {} });
  assert.equal(processed.status, "processed");
  assert.deepEqual((await registry.search("inbox", { query: "Reacher", filters: {}, limit: 20 })).items, []);
  assert.deepEqual((await registry.search("inbox", { query: "Reacher", filters: { status: "all" }, limit: 20 })).items.map((item) => item.id), [first.id]);
  const edited = await registry.update("inbox", second.id as number, { content: "给 EvaOrbit 项目补一条需求" });
  assert.equal(edited.status, "inbox");
  await assert.rejects(() => registry.update("inbox", second.id as number, { status: "archived" }), /does not accept: status/);
  assert.equal((await registry.action("inbox", { id: first.id as number, action: "archive", data: {} })).status, "archived");
  assert.equal((await registry.action("inbox", { id: first.id as number, action: "restore", data: {} })).status, "inbox");
  assert.deepEqual(await registry.delete("inbox", second.id as number), { deleted: true, id: second.id });
});

test("generic Task CRUD keeps completion as explicit actions", async () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  const first = await registry.create("task", { title: "恢复 Task", notes: "接回 MCP", due_date: "2026-09-15", due_time: "09:30", priority: "high", tags: ["eo"] });
  const second = await registry.create("task", { title: "整理页面", priority: "low" });
  assert.equal(first.status, "open");
  assert.equal(first.due_time, "09:30");
  assert.deepEqual((await registry.search("task", { query: "MCP", filters: { status: "open", priority: "high" }, limit: 20 })).items.map((item) => item.id), [first.id]);
  assert.equal((await registry.update("task", second.id as number, { due_date: "2026-09-16" })).due_date, "2026-09-16");
  assert.equal((await registry.action("task", { id: first.id as number, action: "complete", data: {} })).status, "done");
  assert.equal((await registry.action("task", { id: first.id as number, action: "reopen", data: {} })).status, "open");
  await assert.rejects(() => registry.update("task", first.id as number, { status: "done" }), /does not accept: status/);
  assert.deepEqual(await registry.delete("task", second.id as number), { deleted: true, id: second.id });
});

test("project items remain durable and Done stays distinct from Verified", async () => {
  const registry=createResourceRegistry(fakeOperations().operations);
  const project=await registry.create("project",{name:"EvaOrbit"});
  const issue=await registry.create("project_item",{project_id:project.id,title:"Compact Projects",type:"feature"});
  assert.equal(issue.status,"to_solve");
  const done=await registry.update("project_item",issue.id as number,{status:"done",resolution:"Implemented"});
  assert.equal(done.status,"done");assert.equal(done.verified_at,null);assert.ok(done.completed_at);
  const verified=await registry.update("project_item",issue.id as number,{status:"verified"});
  assert.equal(verified.status,"verified");assert.ok(verified.verified_at);
  assert.deepEqual((await registry.search("project_item",{filters:{project:"EvaOrbit",status:"verified"},limit:20})).items.map((item)=>item.id),[issue.id]);
});

test("generic Memo CRUD defaults search to active and keeps historical states separate", async () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  const active = await registry.create("memo", { title: "Current rule", content: "Use the preferred name", type: "basic", tags: ["rule"] });
  const archived = await registry.create("memo", { title: "Old rule", content: "No longer current", type: "note", status: "archived", tags: ["rule"] });
  assert.deepEqual((await registry.search("memo", { query: "rule", filters: {}, limit: 20 })).items.map((item) => item.id), [active.id]);
  assert.deepEqual((await registry.search("memo", { query: "rule", filters: { status: "archived" }, limit: 20 })).items.map((item) => item.id), [archived.id]);
  const updated = await registry.update("memo", active.id as number, { title: "Current rule patched" });
  assert.equal(updated.content, "Use the preferred name");
  assert.equal((await registry.get("memo", active.id as number)).title, "Current rule patched");
  assert.deepEqual(await registry.delete("memo", archived.id as number), { deleted: true, id: archived.id });
});

test("existing Generic Chronicle CRUD remains unchanged", async () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  const created = await registry.create("chronicle", { date: "2026-08-29", title: "Inspector entry", content_md: "# Original\n\nKeep this body.", source: "manual" });
  assert.deepEqual((await registry.search("chronicle", { query: "Keep this", limit: 20 })).items.map((item) => item.id), [created.id]);
  const updated = await registry.update("chronicle", created.id as number, { title: "Inspector entry patched" });
  assert.equal(updated.content_md, "# Original\n\nKeep this body.");
  assert.equal((await registry.get("chronicle", created.id as number)).date, "2026-08-29");
  assert.deepEqual(await registry.delete("chronicle", created.id as number), { deleted: true, id: created.id });
});

test("generic Lucius Diary supports search, get, PATCH and delete", async () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  const created = await registry.create("lucius_diary", { date: "2026-08-29", content: "今天修正了误解", tags: ["修正"] });
  assert.deepEqual((await registry.search("lucius_diary", { query: "误解", filters: { tag: "修正" }, limit: 20 })).items.map((item) => item.id), [created.id]);
  const updated = await registry.update("lucius_diary", created.id as number, { content: "今天修正了一个误解" });
  assert.deepEqual(updated.tags, ["修正"]);
  assert.equal((await registry.get("lucius_diary", created.id as number)).content, "今天修正了一个误解");
  assert.deepEqual(await registry.delete("lucius_diary", created.id as number), { deleted: true, id: created.id });
});

test("generic Lucius Case CRUD and record_recurrence calculate derived state server-side", async () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  const created = await registry.create("lucius_case", { title: "称呼错误", error_type: "naming", severity: "moderate", status: "serving", trigger_scenes: ["长对话"], cause: "遗漏 Memo", correct_behavior: "先查 Memo", mandatory_rule: "不得猜测称呼", first_occurred_date: "2026-08-20", latest_occurred_date: "2026-08-25", occurrence_count: 2, consecutive_correct_count: 4 });
  assert.deepEqual((await registry.search("lucius_case", { query: "称呼", filters: { current_only: true }, limit: 20 })).items.map((item) => item.id), [created.id]);
  const patched = await registry.update("lucius_case", created.id as number, { punishment: "复查规则" });
  assert.equal(patched.occurrence_count, 2);
  const recurrence = await registry.action("lucius_case", { id: created.id as number, action: "record_recurrence", data: { occurred_date: "2026-08-29" } });
  assert.equal(recurrence.occurrence_count, 3);
  assert.equal(recurrence.latest_occurred_date, "2026-08-29");
  assert.equal(recurrence.recurrence_interval_days, 4);
  assert.equal(recurrence.is_recurrence, true);
  assert.equal(recurrence.consecutive_correct_count, 0);
  assert.equal((await registry.get("lucius_case", created.id as number)).occurrence_count, 3);
  assert.deepEqual(await registry.delete("lucius_case", created.id as number), { deleted: true, id: created.id });
});

test("registry rejects table names, invalid filters and client-calculated recurrence fields", async () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  await assert.rejects(() => registry.create("memo", { title: "Bad", content: "Body", table: "memos" }), /does not accept: table/);
  await assert.rejects(() => registry.search("memo", { filters: { status: "all" }, limit: 20 }), /status filter is invalid/);
  await assert.rejects(() => registry.update("lucius_diary", 1, {}), /没有可更新/);
  await assert.rejects(() => registry.action("lucius_case", { id: 1, action: "record_recurrence", data: { occurrence_count: 9 } }), /does not accept: occurrence_count/);
  await assert.rejects(() => registry.action("chronicle", { action: "resolve", data: {} }), /does not support action/);
});

test("production registry delegates every write and action to existing business services", () => {
  const source = readFileSync(new URL("./mcp/resource-registry.server.ts", import.meta.url), "utf8");
  assert.match(source, /delete: deleteChronicleEntry/);
  assert.match(source, /memo: \{ search: listMemos, get: getMemo, create: createMemo, update: updateMemo, delete: deleteMemo \}/);
  assert.match(source, /recordRecurrence: recordLuciusCaseRecurrence/);
  assert.match(source, /luciusPost: \{ search: listLuciusPosts, get: getLuciusPost, create: createLuciusPost, update: updateLuciusPost, delete: deleteLuciusPost \}/);
  assert.match(source, /luciusPostComment: \{ search: listLuciusPostComments, get: getLuciusPostComment, create: createLuciusPostComment, update: updateLuciusPostComment, delete: deleteLuciusPostComment \}/);
  assert.match(source, /healthRecord: \{ search: listHealthRecords/);
  assert.match(source, /trainingLog: \{ search: listTrainingLogs/);
  assert.match(source, /mediaSeries: \{ search: listMediaSeries/);
  assert.match(source, /catRecord: \{ search: catTimeline/);
  assert.match(source, /reminder: \{ search: listReminders/);
  assert.match(source, /memoryEntity:\{search:listMemoryEntities/);
  assert.match(source, /memoryFact:\{search:listMemoryFacts/);
  assert.match(source, /memorySource:\{search:listMemorySources/);
  assert.match(source, /task: \{ search: listTasks, get: getTask, create: createTask, update: updateTask, delete: deleteTask \}/);
  assert.doesNotMatch(source, /services\/memory["']|\bmemory:\s*\{/i);
  assert.match(source, /inbox: \{ search: searchInbox, get: getInbox, create: createInbox, update: updateInbox, delete: deleteInbox, markProcessed: markInboxProcessed, archive: archiveInbox, restore: restoreInbox \}/);
  assert.doesNotMatch(source, /\.from\(|DELETE FROM|INSERT INTO|UPDATE\s+\w+/i);
});

test("recurrence migration provides an authenticated atomic server operation", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202608290005_lucius_case_recurrence.sql", import.meta.url), "utf8");
  assert.match(sql, /occurrence_count = occurrence_count \+ 1/);
  assert.match(sql, /latest_occurred_date = p_occurred_date/);
  assert.match(sql, /recurrence_interval_days = nullif\(p_occurred_date - previous_date, 0\)/);
  assert.match(sql, /is_recurrence = true/);
  assert.match(sql, /consecutive_correct_count = 0/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /grant execute .* to authenticated/);
  assert.doesNotMatch(sql, /service_role|security definer/i);
});
