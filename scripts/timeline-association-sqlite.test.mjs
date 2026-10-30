import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('Timeline rules persist with CAS, migrate existing preferences, preserve Food and statistics, and share daily/month/native projection',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'eo-timeline-association-'));
 const run=program=>{
  const result=spawnSync(process.execPath,['--conditions=react-server','--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',program],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,NODE_ENV:'development',EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'test.db'),VERCEL:''}});
  assert.equal(result.status,0,result.stderr||result.stdout);return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
 };
 try {
  run(`const db=await import('./src/lib/db.ts');db.updateAppearancePreferences({appearanceMode:'dark',colorTheme:'powderblue',uiLanguage:'en',chineseFont:'canger',englishFont:'zen'});const {DatabaseSync}=await import('node:sqlite');const connection=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);connection.exec('ALTER TABLE ui_preferences DROP COLUMN timeline_association;DELETE FROM migrations WHERE version=93;');connection.close();console.log('{}');`);
  const result=run(`
   const assert=(await import('node:assert/strict')).default;
   const db=await import('./src/lib/db.ts'),service=await import('./src/lib/services/timeline-association.ts'),timeline=await import('./src/lib/services/timeline.ts'),home=await import('./src/lib/services/home-day.ts');
   const {withHomeReadOnlyRepository}=await import('./src/lib/repositories/index.ts');
   const {parseNewTracker,parseNewTrackerEntry,parseNewFoodLog}=await import('./src/lib/validation.ts');
   const tracker=db.createTracker(parseNewTracker({name:'Shower',icon:'circle',timeType:'point'}));
   const calendar=db.createCalendarEvent({title:'洗香香',notes:'original calendar',startAt:'2026-10-31T15:40:00.000Z',endAt:'2026-10-31T16:00:00.000Z',isAllDay:false,timezone:'Asia/Shanghai',location:'home',status:'confirmed'});
   const entry=db.createTrackerEntry(parseNewTrackerEntry({trackerId:tracker.id,occurredAt:'2026-10-31T16:00:00.000Z',values:{},note:'original entry'}));
   const meal=db.createCalendarEvent({title:'午餐',notes:'original meal',startAt:'2026-10-31T04:00:00.000Z',endAt:'2026-10-31T04:30:00.000Z',isAllDay:false,timezone:'Asia/Shanghai',location:'',status:'confirmed'});
   db.createFoodLog(parseNewFoodLog({title:'rice',mealType:'lunch',occurredAt:'2026-10-31T04:40:00.000Z'}));
   const before=await home.getHomeDayOverview('2026-10-31',{readOnly:true}),rawBefore=JSON.stringify([db.getTrackerEntry(entry.id),db.getCalendarEvent(calendar.id),db.listFoodLogs()]);
   const rule={id:'shower',type:'calendar_tracker',name:'Shower',enabled:true,calendarTitle:'洗香香',titleMatch:'exact',trackerId:tracker.id,timeMatch:'near_end',toleranceMinutes:5};
   const original=db.getTimelineAssociation();const saved=await service.saveTimelineAssociation({...original,rules:[rule]});
   await assert.rejects(()=>service.saveTimelineAssociation({...original,rules:[rule]}),/关联规则已在其他页面更新/);
   await assert.rejects(()=>service.saveTimelineAssociation({...saved,rules:[{...rule,trackerId:99999}]}));
   const day=await home.getHomeDayOverview('2026-10-31',{readOnly:true}),next=await withHomeReadOnlyRepository(()=>home.getHomeDayOverview('2026-11-01',{readOnly:true}));
   const october=await timeline.getTimelineMonthSummary('2026-10',{readOnly:true}),november=await withHomeReadOnlyRepository(()=>timeline.getTimelineMonthSummary('2026-11',{readOnly:true}));
   assert.equal(day.events.filter(e=>e.association).length,1);assert.equal(next.events.filter(e=>e.association).length,1);
   assert.equal(october.days['2026-10-31'].count,day.events.length);assert.equal(november.days['2026-11-01'].count,next.events.length);
   assert.equal((await timeline.listTimeline({date:'2026-11-01'})).filter(e=>e.association).length,1);
   assert.deepEqual(before.events.filter(e=>e.sourceType==='food'),day.events.filter(e=>e.sourceType==='food'));
   assert.deepEqual(day.events.find(e=>e.association).association.entry,entry);
   const staleStats=(await import('./src/lib/services/tracker.ts')).getTrackerDetail;
   assert.equal((await staleStats(tracker.id)).stats.total,1);
   assert.equal(rawBefore,JSON.stringify([db.getTrackerEntry(entry.id),db.getCalendarEvent(calendar.id),db.listFoodLogs()]));
   const disabled=await service.saveTimelineAssociation({...saved,rules:[{...rule,enabled:false}]});
   assert.equal((await timeline.getDailyTimelineOverview('2026-11-01',{readOnly:true})).events.filter(e=>e.association).length,0);
   await service.saveTimelineAssociation({...disabled,rules:[]});
   console.log(JSON.stringify({rules:db.getTimelineAssociation(),appearance:db.getUiPreferences().colorTheme,rawUnchanged:rawBefore===JSON.stringify([db.getTrackerEntry(entry.id),db.getCalendarEvent(calendar.id),db.listFoodLogs()])}));
  `);
  assert.equal(result.rules.rules.length,0);assert.equal(result.rules.revision,3);assert.equal(result.appearance,'powderblue');assert.equal(result.rawUnchanged,true);
  assert.deepEqual(run(`const db=await import('./src/lib/db.ts');console.log(JSON.stringify(db.getTimelineAssociation()));`),result.rules);
 } finally {rmSync(directory,{recursive:true,force:true});}
});
