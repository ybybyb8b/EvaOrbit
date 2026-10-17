import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("one-time cat and household care leaves a completion record and a retry does not duplicate it", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "eo-cat-care-"));
  try {
    const program = `
      const assert = (await import('node:assert/strict')).default;
      const cats = await import('./src/lib/services/cats.ts');
      const reminders = await import('./src/lib/services/reminder.ts');
      const parse = await import('./src/lib/cats-validation.ts');
      const db = await import('./src/lib/db.ts');
      const pet = await cats.createPet(parse.parsePet({name:'Test cat'}));
      for (const targetType of ['cat','cat_household']) {
        const reminder = await reminders.createReminder(parse.parseReminder({title:'One-time care',targetType,targetId:targetType==='cat'?pet.id:null,scheduleType:'one_time',nextDueAt:'2026-10-01T04:00:00Z',dueHasExplicitTime:false}));
        const completed = await reminders.completeReminder(reminder.id,new Date('2026-10-17T10:30:00Z'));
        assert.equal(completed.status,'completed');
        await reminders.completeReminder(reminder.id,new Date('2026-10-17T10:31:00Z'));
        const events = db.listCatEvents(targetType==='cat'?pet.id:null).filter(item=>item.sourceType==='reminder'&&item.sourceId===reminder.id);
        assert.equal(events.length,1);
        assert.equal(events[0].occurredAt,'2026-10-17T10:30:00.000Z');
        assert.equal(events[0].occurredHasExplicitTime,true);
        assert.equal(events[0].eventType,targetType==='cat'?'care':'cleaning');
      }
      const course = await reminders.createReminder(parse.parseReminder({title:'Medication',targetType:'cat',targetId:pet.id,scheduleType:'course',nextDueAt:'2026-10-17T09:00:00Z',intervalValue:12,intervalUnit:'hour'}));
      await reminders.completeReminder(course.id,new Date('2026-10-17T10:30:00Z'));
      assert.equal(db.listCatEvents(pet.id).filter(item=>item.sourceId===course.id&&item.sourceType==='reminder').length,0);
    `;
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href, "--input-type=module", "--eval", program], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_ENV: "development", VERCEL: "", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "test.db") },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
