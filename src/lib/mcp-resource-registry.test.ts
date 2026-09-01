import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createResourceRegistry, type ResourceRegistryOperations } from "./mcp/resource-registry.ts";
import type { ChronicleEntry, InboxItem, LuciusCase, LuciusDiaryEntry, LuciusState, Memo, Project, ProjectItem } from "./types.ts";

const createdAt = "2026-08-29T00:00:00Z";
function fakeOperations() {
  const inbox: InboxItem[] = [];
  const chronicles: ChronicleEntry[] = [];
  const memos: Memo[] = [];
  const diary: LuciusDiaryEntry[] = [];
  const cases: LuciusCase[] = [];
  const luciusState: LuciusState = { currentNote: "", status: "quiet", mood: "composed", updatedAt: null };
  const projects: Project[] = [];
  const projectItems: ProjectItem[] = [];
  let nextInbox = 0, nextChronicle = 0, nextMemo = 0, nextDiary = 0, nextCase = 0, nextProject = 0, nextProjectItem = 0;
  const remove = <T extends { id: number }>(items: T[], id: number) => { const index = items.findIndex((item) => item.id === id); if (index < 0) return false; items.splice(index, 1); return true; };
  const operations: ResourceRegistryOperations = {
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
  return { operations, inbox, chronicles, memos, diary, cases };
}

test("registry exposes long-term memory and project resources without changing generic tools", () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  assert.deepEqual(registry.resources().map((entry) => entry.resource), ["inbox", "memo", "chronicle", "lucius_diary", "lucius_case", "lucius_state", "project", "project_item", "relation_person", "relation_event", "person_note"]);
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
  assert.ok(registry.schema("relation_person").writable_fields.includes("closeness_rank"));
  assert.ok(registry.schema("relation_person").writable_fields.includes("relationship_status"));
  assert.equal(registry.schema("relation_person").fields.last_met_at.read_only, true);
  assert.match(registry.schema("relation_person").validation_rules.join(" "), /new events never change/i);
  assert.match(registry.schema("memo").validation_rules.join(" "), /status=active/);
  assert.match(registry.schema("project_item").validation_rules.join(" "), /never automatically promoted to verified/);
  assert.throws(() => registry.schema("media"), /Unknown resource/);
});

test("Lucius state is a single explicit MCP-updatable display resource", async () => {
  const registry = createResourceRegistry(fakeOperations().operations);
  assert.equal((await registry.get("lucius_state", "current")).status, "quiet");
  const updated = await registry.update("lucius_state", "current", { current_note: "I remember today.", status: "resting", mood: "composed" });
  assert.equal(updated.current_note, "I remember today.");
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
