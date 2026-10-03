import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { parseDailyJournalEntryPatch, parseNewDailyJournalEntry } from "./validation.ts";
import { journalEmotions, journalMoodLabel } from "./journal-emotions.ts";

test("named emotions stay distinct without inventing numeric mood scores", () => {
  assert.equal(journalEmotions.length,12);
  assert.equal(new Set(journalEmotions.map(option=>option.value)).size,12);
  for (const {value:emotion,zh} of journalEmotions) {
    const entry=parseNewDailyJournalEntry({date:"2026-10-04",content:"记一点",emotion});
    assert.equal(entry.emotion,emotion);
    assert.equal(entry.moodScore,null);
    assert.equal(journalMoodLabel(entry)?.zh,zh);
    assert.equal(parseDailyJournalEntryPatch({emotion}).emotion,emotion);
  }
  assert.equal(parseDailyJournalEntryPatch({content:"只改文字"}).emotion,undefined);
  assert.equal(parseDailyJournalEntryPatch({emotion:null}).emotion,null);
  for (const emotion of ["", "unknown", 0, true, ["sad","angry"]]) {
    assert.throws(()=>parseNewDailyJournalEntry({date:"2026-10-04",content:"x",emotion}));
    assert.throws(()=>parseDailyJournalEntryPatch({emotion}));
  }
  assert.equal(journalMoodLabel({moodScore:-2})?.zh,"很低落");
  assert.equal(journalMoodLabel({emotion:"angry",moodScore:-2})?.zh,"生气");
  assert.equal(journalMoodLabel({moodScore:null}),undefined);
});

test("emotion migration preserves historical mood and diary flags", () => {
  const source=readFileSync(new URL("./db.ts",import.meta.url),"utf8");
  const migration=source.match(/if \(!hasV65\) database.exec\(`([\s\S]*?)`\);/)![1];
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE migrations(version INTEGER PRIMARY KEY); CREATE TABLE daily_journal_entries(id INTEGER PRIMARY KEY,content TEXT,mood_score INTEGER,has_full_diary INTEGER); INSERT INTO daily_journal_entries VALUES(1,'old note',-2,1);");
    for(let attempt=0;attempt<2;attempt++) if(!db.prepare("SELECT 1 FROM migrations WHERE version=65").get()) db.exec(migration);
    assert.deepEqual({...db.prepare("SELECT * FROM daily_journal_entries").get()},{id:1,content:"old note",mood_score:-2,has_full_diary:1,emotion:null});
    for(const {value} of journalEmotions) {
      db.prepare("UPDATE daily_journal_entries SET emotion=?").run(value);
      assert.equal(db.prepare("SELECT emotion FROM daily_journal_entries").get()!.emotion,value);
    }
    assert.throws(()=>db.prepare("UPDATE daily_journal_entries SET emotion='unknown'").run());
    db.prepare("UPDATE daily_journal_entries SET emotion=NULL").run();
    assert.equal(db.prepare("SELECT emotion FROM daily_journal_entries").get()!.emotion,null);
    const sql=readFileSync(new URL("../../supabase/migrations/202610040002_daily_journal_emotion.sql",import.meta.url),"utf8");
    assert.match(sql,/ADD COLUMN IF NOT EXISTS emotion text/);
    for(const {value} of journalEmotions) assert.ok(sql.includes(`'${value}'`));
  } finally { db.close(); }
});

test("daily journal keeps date-only records and optional mood", () => {
  assert.deepEqual(parseNewDailyJournalEntry({ date: "2026-10-01", content: "  想到就写。  ", moodScore: 1 }), { date: "2026-10-01", content: "想到就写。", moodScore: 1, energyLevel: null, hasFullDiary: false, emotion: null });
  assert.equal(parseNewDailyJournalEntry({ date: "2026-10-01", content: "无心情" }).moodScore, null);
  assert.deepEqual(parseDailyJournalEntryPatch({ moodScore: null }), { date: undefined, content: undefined, moodScore: null, energyLevel: undefined, hasFullDiary: undefined, emotion: undefined });
  assert.throws(() => parseNewDailyJournalEntry({ date: "2026-10-01", content: "x", moodScore: 3 }));
});

test("full diary is a manual boolean marker and omitted patches preserve it", () => {
  assert.equal(parseNewDailyJournalEntry({date:"2026-10-04",content:"记一点"}).hasFullDiary, false);
  for (const hasFullDiary of [true,false]) {
    assert.equal(parseNewDailyJournalEntry({date:"2026-10-04",content:"记一点",hasFullDiary}).hasFullDiary,hasFullDiary);
    assert.equal(parseDailyJournalEntryPatch({hasFullDiary}).hasFullDiary,hasFullDiary);
  }
  assert.equal(parseDailyJournalEntryPatch({content:"只改文字"}).hasFullDiary,undefined);
  for (const hasFullDiary of [null,0,1,"true",""]) {
    assert.throws(() => parseNewDailyJournalEntry({date:"2026-10-04",content:"x",hasFullDiary}));
    assert.throws(() => parseDailyJournalEntryPatch({hasFullDiary}));
  }
});

test("full diary migration preserves old entries and runs once", () => {
  const source=readFileSync(new URL("./db.ts",import.meta.url),"utf8");
  const migration=source.match(/if \(!hasV64\) database.exec\(`([\s\S]*?)`\);/)![1];
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE migrations(version INTEGER PRIMARY KEY); CREATE TABLE daily_journal_entries(id INTEGER PRIMARY KEY,content TEXT); INSERT INTO daily_journal_entries VALUES(1,'old note');");
    for(let attempt=0;attempt<2;attempt++) if(!db.prepare("SELECT 1 FROM migrations WHERE version=64").get()) db.exec(migration);
    assert.deepEqual({...db.prepare("SELECT * FROM daily_journal_entries").get()},{id:1,content:"old note",has_full_diary:0});
    db.prepare("UPDATE daily_journal_entries SET has_full_diary=1").run();
    assert.equal(db.prepare("SELECT has_full_diary FROM daily_journal_entries").get()!.has_full_diary,1);
    assert.throws(()=>db.prepare("UPDATE daily_journal_entries SET has_full_diary=2").run());
    db.prepare("UPDATE daily_journal_entries SET has_full_diary=0").run();
    assert.equal(db.prepare("SELECT has_full_diary FROM daily_journal_entries").get()!.has_full_diary,0);
    const sql=readFileSync(new URL("../../supabase/migrations/202610040001_daily_journal_full_diary.sql",import.meta.url),"utf8");
    assert.match(sql,/ADD COLUMN IF NOT EXISTS has_full_diary boolean NOT NULL DEFAULT false/);
  } finally {db.close();}
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
