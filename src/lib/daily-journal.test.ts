import assert from "node:assert/strict";
import test from "node:test";
import { parseDailyJournalEntryPatch, parseNewDailyJournalEntry } from "./validation.ts";

test("daily journal keeps date-only records and optional mood", () => {
  assert.deepEqual(parseNewDailyJournalEntry({ date: "2026-10-01", content: "  想到就写。  ", moodScore: 1 }), { date: "2026-10-01", content: "想到就写。", moodScore: 1 });
  assert.equal(parseNewDailyJournalEntry({ date: "2026-10-01", content: "无心情" }).moodScore, null);
  assert.deepEqual(parseDailyJournalEntryPatch({ moodScore: null }), { date: undefined, content: undefined, moodScore: null });
  assert.throws(() => parseNewDailyJournalEntry({ date: "2026-10-01", content: "x", moodScore: 3 }));
});
