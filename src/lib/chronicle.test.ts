import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chronicleExcerpt, createChronicleWithRepository, deleteChronicleWithRepository, getChronicleWithRepository, listChronicleWithRepository, updateChronicleWithRepository } from "./chronicle.ts";
import type { ChronicleEntryPatch, ChronicleListInput, EvaOrbitRepository, NewChronicleEntry } from "./repositories/types.ts";
import type { ChronicleEntry } from "./types.ts";
import { parseChronicleEntryPatch, parseNewChronicleEntry } from "./validation.ts";

function fakeChronicleRepository() {
  let nextId = 0;
  const entries: ChronicleEntry[] = [];
  const repository = {
    async listChronicleEntries(input: ChronicleListInput = {}) {
      const query = input.query?.toLocaleLowerCase();
      return entries
        .filter((entry) => !query || entry.title.toLocaleLowerCase().includes(query) || entry.contentMd.toLocaleLowerCase().includes(query))
        .sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id)
        .slice(0, input.limit ?? 100);
    },
    async getChronicleEntry(id: number) { return entries.find((entry) => entry.id === id) ?? null; },
    async createChronicleEntry(input: NewChronicleEntry) {
      const entry = { ...input, id: ++nextId, createdAt: "2026-08-29T00:00:00Z", updatedAt: "2026-08-29T00:00:00Z" };
      entries.push(entry);
      return entry;
    },
    async updateChronicleEntry(id: number, input: ChronicleEntryPatch) {
      const entry = entries.find((item) => item.id === id);
      if (!entry) return null;
      Object.assign(entry, input, { updatedAt: "2026-08-29T01:00:00Z" });
      return entry;
    },
    async deleteChronicleEntry(id: number) {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) return false;
      entries.splice(index, 1);
      return true;
    },
  } as unknown as EvaOrbitRepository;
  return { repository, entries };
}

test("validates Chronicle date-only, source and Markdown without rewriting it", () => {
  const parsed = parseNewChronicleEntry({ date: "2026-08-29", title: "  First orbit  ", contentMd: "\n# Heading\n\nBody  \n", source: "chatgpt" });
  assert.equal(parsed.title, "First orbit");
  assert.equal(parsed.contentMd, "\n# Heading\n\nBody  \n");
  assert.equal(parsed.source, "chatgpt");
  assert.equal(parseChronicleEntryPatch({ source: "manual" }).source, "manual");
  assert.throws(() => parseNewChronicleEntry({ date: "2026-02-30", title: "X", contentMd: "Body" }));
  assert.throws(() => parseNewChronicleEntry({ date: "2026-08-29", title: "X", contentMd: "Body", source: "ai" }));
  assert.throws(() => parseChronicleEntryPatch({}));
});

test("supports multiple entries per day, CRUD, title/body search and date-desc ordering", async () => {
  const { repository } = fakeChronicleRepository();
  const first = await createChronicleWithRepository(repository, { date: "2026-08-29", title: "Morning", contentMd: "Coffee notes", source: "manual" });
  const second = await createChronicleWithRepository(repository, { date: "2026-08-29", title: "Evening", contentMd: "A quiet walk", source: "manual" });
  await createChronicleWithRepository(repository, { date: "2026-08-28", title: "Earlier", contentMd: "Archive", source: "chatgpt" });
  assert.deepEqual((await listChronicleWithRepository(repository)).map((entry) => entry.title), ["Evening", "Morning", "Earlier"]);
  assert.deepEqual((await listChronicleWithRepository(repository, { query: "coffee" })).map((entry) => entry.id), [first.id]);
  assert.deepEqual((await listChronicleWithRepository(repository, { query: "Even" })).map((entry) => entry.id), [second.id]);
  assert.equal((await updateChronicleWithRepository(repository, first.id, { title: "First coffee" }))?.title, "First coffee");
  assert.equal((await getChronicleWithRepository(repository, first.id))?.title, "First coffee");
  assert.equal(await deleteChronicleWithRepository(repository, second.id), true);
  assert.equal(await getChronicleWithRepository(repository, second.id), null);
});

test("keeps previews compact and Markdown rendering explicitly safe", () => {
  assert.equal(chronicleExcerpt("# Heading\n\nA [safe link](https://example.com) with **detail**."), "Heading A safe link with detail.");
  const component = readFileSync(new URL("../components/markdown-message.tsx", import.meta.url), "utf8");
  assert.match(component, /skipHtml/);
  assert.match(component, /urlTransform=\{safeMarkdownUrl\}/);
  assert.match(component, /protocol === "http:"/);
  assert.doesNotMatch(component, /rehypeRaw|dangerouslySetInnerHTML/);
});

test("migration preserves ownership, source constraints and non-unique dates", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/202608290003_chronicle.sql", import.meta.url), "utf8");
  assert.match(sql, /date date not null/);
  assert.match(sql, /source in \('manual', 'chatgpt'\)/);
  assert.match(sql, /order|date desc/i);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth\.uid\(\).*user_id/s);
  assert.match(sql, /to authenticated/);
  assert.doesNotMatch(sql, /unique\s*\(\s*user_id\s*,\s*date\s*\)/i);
  assert.doesNotMatch(sql, /grant all|service_role/i);
});
