import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('design migration preserves Classic palette and old-client writes preserve Vintage',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'eo-design-theme-'));
 const run=program=>{
  const result=spawnSync(process.execPath,['--conditions=react-server','--experimental-loader',pathToFileURL(path.resolve('scripts/typescript-test-loader.mjs')).href,'--input-type=module','--eval',program],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,NODE_ENV:'development',EVAORBIT_DATA_BACKEND:'sqlite',EVAORBIT_SQLITE_PATH:path.join(directory,'test.db'),VERCEL:''}});
  assert.equal(result.status,0,result.stderr||result.stdout);return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
 };
 try{
  run(`const db=await import('./src/lib/db.ts');db.updateAppearancePreferences({appearanceMode:'dark',colorTheme:'powderblue',uiLanguage:'en',chineseFont:'canger',englishFont:'ibm'});const {DatabaseSync}=await import('node:sqlite');const connection=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);connection.exec('ALTER TABLE ui_preferences DROP COLUMN design_theme; DELETE FROM migrations WHERE version=92');connection.close();console.log('{}');`);
  const result=run(`const db=await import('./src/lib/db.ts');const before=db.getUiPreferences();const vintage=db.updateAppearancePreferences({...before,designTheme:'vintage'});const {designTheme,...oldClient}=vintage;const legacy=db.updateAppearancePreferences({...oldClient,appearanceMode:'light'});const classic=db.updateAppearancePreferences({...legacy,designTheme:'classic'});console.log(JSON.stringify({before,vintage,legacy,classic}));`);
  assert.equal(result.before.designTheme,'classic');assert.equal(result.before.colorTheme,'powderblue');
  assert.equal(result.vintage.designTheme,'vintage');assert.equal(result.legacy.designTheme,'vintage');
  assert.equal(result.classic.colorTheme,'powderblue');assert.equal(result.classic.appearanceMode,'light');
  assert.equal(run(`const db=await import('./src/lib/db.ts');console.log(JSON.stringify(db.getUiPreferences()));`).colorTheme,'powderblue');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('Postgres design migration preserves preferences and rejects unsupported design identities',async()=>{
 const db=new PGlite();
 try{
  await db.exec("CREATE TABLE ui_preferences(user_id text PRIMARY KEY,color_theme text NOT NULL DEFAULT 'editorial');INSERT INTO ui_preferences(user_id,color_theme) VALUES('owner','rosewood');");
  const migration=readFileSync('supabase/migrations/202610290001_design_theme.sql','utf8');await db.exec(migration);await db.exec(migration);
  assert.deepEqual((await db.query('SELECT * FROM ui_preferences')).rows,[{user_id:'owner',color_theme:'rosewood',design_theme:'classic'}]);
  await db.exec("UPDATE ui_preferences SET design_theme='vintage'");
  await assert.rejects(db.exec("UPDATE ui_preferences SET design_theme='powderblue'"),/check constraint/);
 }finally{await db.close();}
});
