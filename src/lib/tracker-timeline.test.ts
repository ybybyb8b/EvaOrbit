import assert from 'node:assert/strict';
import test from 'node:test';
import { entryMatchesField, entryMatchesPeriod, groupTrackerTimeline, matchesTrackerSearch, orderedTrackerValues } from './tracker-timeline.ts';
import type { TrackerField } from './types.ts';

test('Timeline groups Shanghai calendar days, sorts instants, and searches content without internal field keys', () => {
  const record = (id:number, occurredAt:string) => ({id,occurredAt,note:'Quiet visit',values:{privateKey:{startAt:'2026-10-06T00:00:00Z',endAt:'2026-10-06T01:30:00Z',durationMinutes:90},zero:0,flag:false,choices:['Garden','Tea']}});
  const entries = [record(1,'2026-10-05T15:30:00Z'),record(2,'2026-10-05T17:00:00Z'),record(3,'2026-10-05T16:00:00Z')];
  assert.deepEqual(groupTrackerTimeline(entries).map(g=>[g.date,g.entries.map(e=>e.id)]),[['2026-10-06',[2,3]],['2026-10-05',[1]]]);
  assert.deepEqual(entries.map(e=>e.id),[1,2,3]);
  for (const query of [' GARDEN ','quiet','90','false','0']) assert.equal(matchesTrackerSearch(entries[0],query),true);
  assert.equal(matchesTrackerSearch(entries[0],'privateKey'),false);
  assert.equal(matchesTrackerSearch(entries[0],'missing'),false);
});

test('Timeline values follow configured property order across missing and legacy values', () => {
  const fields = [{id:1,key:'amount',sortOrder:0},{id:2,key:'bristol',sortOrder:1},{id:3,key:'pain',sortOrder:2}];
  const values = {pain:false,bristol:'5型',amount:0,empty:[],missing:null};
  assert.deepEqual(orderedTrackerValues(values,fields),[['amount',0],['bristol','5型'],['pain',false]]);
  assert.deepEqual(orderedTrackerValues({pain:false,'2':'5型'},fields),[['2','5型'],['pain',false]]);
  assert.deepEqual(Object.keys(values),['pain','bristol','amount','empty','missing']);
});

test('local UUID records use the same day groups and field filters as server records', () => {
  const base = {occurredAt:'2026-10-05T16:00:00Z',note:'',values:{amount:0,flag:false,choices:['Tea'],legacy:'kept'}};
  const local = [{...base,id:'b'}, {...base,id:'a'}];
  assert.deepEqual(groupTrackerTimeline(local).map(group=>[group.date,group.entries.map(entry=>entry.id)]), [['2026-10-06',['b','a']]]);
  assert.deepEqual(local.map(entry=>entry.id),['b','a']);
  const field = (key:string,type:TrackerField['type']) => ({id:7,key,type} as TrackerField);
  assert.equal(entryMatchesField(base,field('amount','number'),'0'),true);
  assert.equal(entryMatchesField(base,field('flag','boolean'),'false'),true);
  assert.equal(entryMatchesField(base,field('choices','multi_select'),'Tea'),true);
  assert.equal(entryMatchesField(base,field('choices','multi_select'),'Coffee'),false);
  assert.equal(entryMatchesField({...base,values:{'7':'kept'}},field('uuid','text'),'kept'),true);
  assert.equal(entryMatchesPeriod(base,'all'),true);
});
