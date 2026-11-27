import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Only the disposable integration runner uses this. Production retirement still
// requires its separately restored and verified archive, as the migration states.
export async function applyEmptyLuciusFixture({ run, source, directory, databaseUrl, environment = process.env }) {
  assert.equal(environment.CI, 'true', 'Disposable CI runner required');
  assert.equal(environment.TRACKER_ISOLATED_SUPABASE, '1', 'Explicit isolated-stack opt-in required');
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(databaseUrl).hostname), 'Hosted targets are forbidden');
  const tables = ['lucius_cases', 'lucius_state', 'lucius_diary_entries', 'lucius_posts', 'lucius_post_comments'];
  const counts = await run(tables.map(table => `select '${table}' as name,count(*)::integer as count from public.${table}`).join(' union all '));
  assert.equal(counts.length, tables.length);
  for (const row of counts) assert.equal(Number(row.count), 0, 'Retirement fixture must be empty; refusing to discard data');
  // A data-only archive of verified empty tables contains no INSERT statements.
  // The historical migrations already supply the schema for fixture restoration.
  const archive = '-- Empty disposable Lucius fixture data backup\n' + counts.map(row => `-- ${row.name}: 0 rows\n`).join('');
  const file = path.join(directory, 'empty-lucius-fixture.sql');
  await writeFile(file, archive);
  const verified = await readFile(file, 'utf8');
  assert.equal(verified, archive);
  const checksum = createHash('sha256').update(verified).digest('hex');
  await run("select set_config('evaorbit.lucius_backup_sha256',$1,false)", [checksum]);
  try {
    await run(source);
  } catch (error) {
    await run('rollback');
    throw error;
  } finally {
    await run("select set_config('evaorbit.lucius_backup_sha256','',false)");
  }
}
