import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { parseDailyJournalEntryPatch, parseNewDailyJournalEntry } from "./validation.ts";

test("daily journal keeps date-only records and optional mood", () => {
  assert.deepEqual(parseNewDailyJournalEntry({ date: "2026-10-01", content: "  想到就写。  ", moodScore: 1 }), { date: "2026-10-01", content: "想到就写。", moodScore: 1, energyLevel: null });
  assert.equal(parseNewDailyJournalEntry({ date: "2026-10-01", content: "无心情" }).moodScore, null);
  assert.deepEqual(parseDailyJournalEntryPatch({ moodScore: null }), { date: undefined, content: undefined, moodScore: null, energyLevel: undefined });
  assert.throws(() => parseNewDailyJournalEntry({ date: "2026-10-01", content: "x", moodScore: 3 }));
});

test("energy is optional, independently editable and explicitly clearable", () => {
  assert.equal(parseNewDailyJournalEntry({ date: "2026-10-01", content: "无精力记录" }).energyLevel, null);
  for (const energyLevel of [1, 2, 3]) {
    assert.equal(parseNewDailyJournalEntry({ date: "2026-10-01", content: "开心但累", moodScore: 2, energyLevel }).energyLevel, energyLevel);
    assert.equal(parseDailyJournalEntryPatch({ energyLevel }).energyLevel, energyLevel);
  }
  assert.equal(parseDailyJournalEntryPatch({ energyLevel: null }).energyLevel, null);
  assert.equal(parseDailyJournalEntryPatch({ content: "只改文字" }).energyLevel, undefined);
  for (const energyLevel of [0, 4, 1.5, "2", true]) {
    assert.throws(() => parseNewDailyJournalEntry({ date: "2026-10-01", content: "x", energyLevel }));
    assert.throws(() => parseDailyJournalEntryPatch({ energyLevel }));
  }
});

test("SQLite energy migration preserves existing notes and runs only once", () => {
  const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const migration = source.match(/if \(!hasV58\) database.exec\(`([\s\S]*?)`\);/)![1];
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE migrations(version INTEGER PRIMARY KEY); CREATE TABLE daily_journal_entries(id INTEGER PRIMARY KEY,content TEXT,mood_score INTEGER); INSERT INTO daily_journal_entries VALUES(1,'old note',2);");
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!db.prepare("SELECT 1 FROM migrations WHERE version=58").get()) db.exec(migration);
    }
    const row = db.prepare("SELECT * FROM daily_journal_entries").get()!;
    assert.equal(row.content, "old note");
    assert.equal(row.mood_score, 2);
    assert.equal(row.energy_level, null);
    db.prepare("UPDATE daily_journal_entries SET energy_level=?").run(1);
    assert.equal(db.prepare("SELECT energy_level FROM daily_journal_entries").get()!.energy_level, 1);
    assert.throws(() => db.prepare("UPDATE daily_journal_entries SET energy_level=?").run(4));
    db.prepare("UPDATE daily_journal_entries SET energy_level=NULL").run();
    assert.equal(db.prepare("SELECT energy_level FROM daily_journal_entries").get()!.energy_level, null);
  } finally { db.close(); }
});
