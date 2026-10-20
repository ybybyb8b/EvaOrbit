import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
test('Media shares selection, preserves parent/season IDs, completes atomically and caches covers without writes',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'eo-media-test-'));
 try{const result=spawnSync(process.execPath,['--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',String.raw`
  import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
  import {seedMedia} from './scripts/media-readonly-fixture.mjs';
  import {getRepository,withMediaReadOnlyRepository} from './src/lib/repositories/index.ts';
  import {listMedia,updateMedia,updateMediaSeries,getMediaDetail} from './src/lib/services/media.ts';
  import {parseMediaPatch} from './src/lib/validation.ts';
  import {getMediaReadonlySnapshot} from './src/lib/services/media-readonly.ts';
  import {validateMediaSnapshot,readMediaSnapshot} from './src/lib/media-readonly.ts';
  const {series,items}=await seedMedia(),r=await getRepository();
  await updateMedia(items[0].id,parseMediaPatch({rating:'dope'}));
  assert.equal((await getMediaDetail(items[0].id)).seasonNumber,1);
  const renamed=await updateMediaSeries(series.id,'Reacher Revised');assert.equal(renamed.id,series.id);
  assert.equal((await getMediaDetail(items[0].id)).seriesName,'Reacher Revised');
  assert.equal((await getMediaDetail(items[0].id)).originalTitle,null);
  await r.createMediaSeries('Other parent');await assert.rejects(updateMediaSeries(series.id,'Other parent'),/already exists/);
  const second=items[1].id;await assert.rejects(updateMedia(second,parseMediaPatch({status:'completed'})),/completion date/);
  const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
  db.exec("CREATE TRIGGER reject_media_view BEFORE INSERT ON media_viewings BEGIN SELECT RAISE(ABORT,'viewing rejected');END");
  await assert.rejects(updateMedia(second,parseMediaPatch({status:'completed',watchedDate:'2026-10-20'})),/viewing rejected/);
  assert.equal((await getMediaDetail(second)).status,'watching');db.exec('DROP TRIGGER reject_media_view');
  await updateMedia(second,parseMediaPatch({status:'completed',watchedDate:'2026-10-20'}));
  await updateMedia(second,parseMediaPatch({status:'completed',watchedDate:'2026-10-20'}));
  assert.equal((await getMediaDetail(second)).viewings.length,1);
  // More than 200 newer items must not hide an older matching work/parent.
  for(let n=0;n<205;n++)await r.createMediaItem({...items[2],title:'New '+n,originalTitle:'New '+n});
  assert.equal((await listMedia({query:'Reacher Revised'})).length,2);
  assert.equal((await listMedia({query:'Ocean Documentary'})).length,1);
  assert.equal((await listMedia({limit:200,offset:200})).length,10);
  const before=(await r.listMediaItems({limit:200})).length;
  const snapshot=await getMediaReadonlySnapshot('a');assert(snapshot.items[0]);
  assert.match(snapshot.items.find(x=>x.id===items[0].id).coverUrl,/^data:image\/png;base64,/);
  assert.equal((await readMediaSnapshot(snapshot,'/api/media?q=Reacher').json()).length,2);
  assert.equal((await readMediaSnapshot(snapshot,'/api/media/series/'+series.id).json()).id,series.id);
  assert.deepEqual((await readMediaSnapshot(snapshot,'/api/media?mediaType=documentary').json()).map(x=>x.id),(await listMedia({mediaType:'documentary'})).map(x=>x.id));
  for(const method of ['POST','PATCH','PUT','DELETE'])assert.throws(()=>readMediaSnapshot(snapshot,'/api/media',{method}),/refused a write/);
  assert.throws(()=>readMediaSnapshot(snapshot,'/api/media/1/cover'),/path refused/);
  for(const mutate of [s=>s.accountId='wrong',s=>s.items.push(s.items[0]),s=>s.items[0].coverUrl='https://example.invalid/a.png',s=>s.series[0].itemCount++,s=>s.items[0].viewings[0].watchedDate='2026-02-30']){const bad=structuredClone(snapshot);mutate(bad);assert.throws(()=>validateMediaSnapshot(bad,'a'));}
  await assert.rejects(withMediaReadOnlyRepository(async()=>(await getRepository()).updateMediaSeries(series.id,'NO')),/refused/);
  await assert.rejects(withMediaReadOnlyRepository(async()=>(await getRepository()).completeMediaItem(second,{},'2026-10-20')),/refused/);
  assert.equal((await r.listMediaItems({limit:200})).length,before);db.close();
 `],{encoding:'utf8',env:{...process.env,EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(dir,'db.sqlite'),EVAORBIT_MEDIA_COVER_DIR:path.join(dir,'covers'),VERCEL:''}});assert.equal(result.status,0,result.stderr||result.stdout);}finally{rmSync(dir,{recursive:true,force:true});}
});
