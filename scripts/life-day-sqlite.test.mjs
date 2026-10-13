import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("life-day settings migrate safely, persist, and drive routine completion through the reminder service", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "eo-life-day-"));
  const run = program => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href, "--input-type=module", "--eval", program], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: path.join(directory, "test.db"), VERCEL: "" },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  };
  try {
    run(`const db=await import('./src/lib/db.ts');
      db.updateAppearancePreferences({appearanceMode:'dark',colorTheme:'powderblue',uiLanguage:'en',chineseFont:'canger',englishFont:'zen'});
      const {DatabaseSync}=await import('node:sqlite');const connection=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      connection.exec('ALTER TABLE ui_preferences DROP COLUMN life_day_start; DELETE FROM migrations WHERE version=79;');connection.close();console.log('{}');`);
    const result = run(`
      const db=await import('./src/lib/db.ts'),service=await import('./src/lib/services/life-day.ts'),routines=await import('./src/lib/services/cat-routine.ts'),reminders=await import('./src/lib/services/reminder.ts');
      const defaultTime=await service.getLifeDayStart();
      const saved=await service.updateLifeDayStart('08:30');
      let rejected=0;for(const value of ['24:00','8:30',null,'09:60']){try{await service.updateLifeDayStart(value);}catch{rejected++;}}
      const item=await routines.createCatRoutine({scope:'household',petId:null,title:'上药',intervalValue:1,intervalUnit:'day',recurrenceMode:'completion',anchorDate:'2026-10-12',firstDueDate:'2026-10-12',nextDueDate:'2026-10-12',configuredReminderTime:'23:00',timezone:'Asia/Shanghai',firstDueAt:'2026-10-12T15:00:00.000Z',nextDueAt:'2026-10-12T15:00:00.000Z',lastCompletedAt:null,reminderLeadMinutes:0,repeatWhileOverdue:true,notes:'',enabled:true,reminderId:null});
      await reminders.snoozeReminder(item.reminderId,'custom','2026-10-12T17:00:00Z',new Date('2026-10-12T15:01:00Z'));
      await reminders.completeReminder(item.reminderId,new Date('2026-10-12T17:00:00Z'));
      const {DatabaseSync}=await import('node:sqlite');const connection=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      const occurrence=connection.prepare('SELECT scheduled_for,acted_at FROM reminder_occurrences WHERE reminder_id=?').get(item.reminderId);connection.close();
      const before=await service.getRecurrenceCompletionDate(new Date('2026-10-12T23:00:00Z'),'2026-10-12T15:00:00Z','Asia/Shanghai');
      db.createCalendarEvent({title:'😴 主睡眠',notes:'',startAt:'2026-10-12T13:00:00Z',endAt:'2026-10-12T20:00:00Z',isAllDay:false,timezone:'Asia/Shanghai',location:'',status:'confirmed'});
      const after=await service.getRecurrenceCompletionDate(new Date('2026-10-12T23:00:00Z'),'2026-10-12T15:00:00Z','Asia/Shanghai');
      const projection=db.getReminder(item.reminderId);
      console.log(JSON.stringify({defaultTime,saved,rejected,before,after,occurrence,next:projection.nextDueAt,snoozed:projection.snoozedUntil,lastNotified:projection.lastNotifiedAt,appearance:db.getUiPreferences().appearanceMode}));
    `);
    assert.equal(result.defaultTime, "06:00");
    assert.equal(result.saved.fallbackTime, "08:30");
    assert.equal(result.rejected, 4);
    assert.equal(result.before, "2026-10-12");
    assert.equal(result.after, "2026-10-13");
    assert.equal(result.next, "2026-10-13T15:00:00.000Z");
    assert.equal(result.occurrence.scheduled_for, "2026-10-12T15:00:00.000Z");
    assert.equal(result.occurrence.acted_at, "2026-10-12T17:00:00.000Z");
    assert.equal(result.snoozed, null);
    assert.equal(result.lastNotified, null);
    assert.equal(result.appearance, "dark");
    assert.equal(run(`const db=await import('./src/lib/db.ts');console.log(JSON.stringify(db.getLifeDayStart()));`), "08:30");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
