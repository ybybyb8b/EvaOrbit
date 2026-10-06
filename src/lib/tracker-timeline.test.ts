import assert from 'node:assert/strict';
import test from 'node:test';
import { groupTrackerTimeline, matchesTrackerSearch } from './tracker-timeline.ts';

test('Timeline groups Shanghai calendar days, sorts instants, and searches content without internal field keys', () => {
  const record = (id:number, occurredAt:string) => ({id,occurredAt,note:'Quiet visit',values:{privateKey:{startAt:'2026-10-06T00:00:00Z',endAt:'2026-10-06T01:30:00Z',durationMinutes:90},zero:0,flag:false,choices:['Garden','Tea']}});
  const entries = [record(1,'2026-10-05T15:30:00Z'),record(2,'2026-10-05T17:00:00Z'),record(3,'2026-10-05T16:00:00Z')];
  assert.deepEqual(groupTrackerTimeline(entries).map(g=>[g.date,g.entries.map(e=>e.id)]),[['2026-10-06',[2,3]],['2026-10-05',[1]]]);
  assert.deepEqual(entries.map(e=>e.id),[1,2,3]);
  for (const query of [' GARDEN ','quiet','90','false','0']) assert.equal(matchesTrackerSearch(entries[0],query),true);
  assert.equal(matchesTrackerSearch(entries[0],'privateKey'),false);
  assert.equal(matchesTrackerSearch(entries[0],'missing'),false);
});
