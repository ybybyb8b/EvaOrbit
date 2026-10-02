import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("calendar rules migrate existing SQLite settings, persist across both entry points, reject stale saves and reinterpret history", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "eo-calendar-rules-")), databasePath = path.join(directory, "test.db");
  const run = program => {
    const loader = pathToFileURL(path.join(process.cwd(), "scripts/typescript-test-loader.mjs")).href;
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-loader", loader, "--input-type=module", "--eval", program], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_ENV: "development", EVAORBIT_DATA_BACKEND: "sqlite", EVAORBIT_SQLITE_PATH: databasePath, VERCEL: "" } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  };
  try {
    run(`const db=await import('./src/lib/db.ts');
      db.updateAppearancePreferences({appearanceMode:'dark',colorTheme:'powderblue',uiLanguage:'en',chineseFont:'canger',englishFont:'zen'});
      db.createCalendarEvent({title:'📚 999h',notes:'原始评论',startAt:'2026-10-01T04:00:00.000Z',endAt:'2026-10-01T04:30:00.000Z',isAllDay:false,timezone:'Asia/Shanghai',location:'家',status:'confirmed'});
      const {DatabaseSync}=await import('node:sqlite');const connection=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      connection.exec('ALTER TABLE ui_preferences DROP COLUMN calendar_interpretation; DELETE FROM migrations WHERE version=61;');connection.close();console.log('{}');`);
    const result = run(`const db=await import('./src/lib/db.ts');const service=await import('./src/lib/services/calendar-interpretation.ts');const home=await import('./src/lib/services/home-day.ts');
      const before=db.getUiPreferences(),settings=db.getCalendarInterpretation();settings.categories.push({id:'reading',name:'阅读',kind:'activity'});settings.rules.push({id:'books',prefix:'📚',categoryId:'reading',enabled:true,includeInSummary:true});
      const saved=await service.saveCalendarInterpretation(settings);let stale=false,invalid=false;
      const {ConflictError}=await import('./src/lib/errors.ts');const {ValidationError}=await import('./src/lib/validation.ts');
      try{await service.saveCalendarInterpretation(settings);}catch(error){stale=error instanceof ConflictError;}
      try{await service.saveCalendarInterpretation({...saved,rules:[...saved.rules,{id:'overlap',prefix:'📚 study',categoryId:'reading',enabled:true,includeInSummary:true}]});}catch(error){invalid=error instanceof ValidationError;}
      const overview=await service.getCalendarInterpretationOverview(),day=await home.getHomeDayOverview('2026-10-01');
      console.log(JSON.stringify({before,saved,stale,invalid,overviewRevision:overview.settings.revision,dayRevision:day.calendarInterpretation.revision,reading:day.activities.find(item=>item.category==='reading'),notes:day.activityRecords[0].notes,event:db.getCalendarEvent(1)}));`);
    assert.equal(result.before.colorTheme, "powderblue");
    assert.equal(result.before.appearanceMode, "dark");
    assert.equal(result.saved.revision, 1);
    assert.equal(result.overviewRevision, result.dayRevision);
    assert.equal(result.reading.durationMinutes, 30);
    assert.equal(result.notes, "原始评论");
    assert.equal(result.event.title, "📚 999h");
    assert.equal(result.stale, true);
    assert.equal(result.invalid, true);
    const reopened = run(`const db=await import('./src/lib/db.ts');console.log(JSON.stringify(db.getCalendarInterpretation()));`);
    assert.deepEqual(reopened, result.saved);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
