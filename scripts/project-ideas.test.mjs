import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("SQLite Ideas migration preserves every historical field and supports status round trips and local caches", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "eo-project-ideas-"));
  const env = { ...process.env, EVAORBIT_SQLITE_PATH: path.join(directory, "data.db"), EVAORBIT_DATA_BACKEND: "sqlite", VERCEL: "" };
  const run = code => {
    const result = spawnSync(process.execPath, ["--experimental-loader", pathToFileURL(path.resolve("scripts/typescript-test-loader.mjs")).href, "--input-type=module", "--eval", code], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  try {
    run(`import './src/lib/db.ts';import {DatabaseSync} from 'node:sqlite';
      const db=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      // Restore the actual historical schema and rerun only the new migration.
      db.exec("DROP TABLE project_items;"+${JSON.stringify(readFileSync("src/lib/db.ts","utf8").match(/    CREATE TABLE project_items \([\s\S]*?    \);/)[0])});
      db.exec("INSERT INTO projects(id,name) VALUES(1,'Legacy');");
      for(const [index,status] of ['to_solve','doing','blocked','done','verified','dropped'].entries())
        db.prepare("INSERT INTO project_items(id,project_id,title,status,module,priority,next_step,resolution,created_at,started_at,completed_at,verified_at,updated_at) VALUES(?,1,'Legacy',?,'Core','P1','Keep action','Keep result','2026-01-01T04:00:00Z','2026-01-02T04:00:00Z','2026-01-03T04:00:00Z','2026-01-04T04:00:00Z','2026-01-05T04:00:00Z')").run(index+1,status);
      db.exec("CREATE TABLE historical_items AS SELECT * FROM project_items; DELETE FROM migrations WHERE version=95;");
      assert.throws(()=>db.prepare("INSERT INTO project_items(project_id,title,status) VALUES(1,'Too early','idea')").run());
      db.close();`);
    const check = `import assert from 'node:assert/strict';import * as r from './src/lib/db.ts';import {DatabaseSync} from 'node:sqlite';
      const raw=new DatabaseSync(process.env.EVAORBIT_SQLITE_PATH);
      assert.deepEqual(raw.prepare('SELECT * FROM project_items WHERE id<=6 ORDER BY id').all(),raw.prepare('SELECT * FROM historical_items ORDER BY id').all());
      assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(),[]);
      assert.equal(raw.prepare("SELECT count(*) n FROM sqlite_master WHERE type='index' AND tbl_name='project_items'").get().n,2);
      raw.close();`;
    run(check);
    run(check);
    run(`import assert from 'node:assert/strict';import * as r from './src/lib/db.ts';
      import {parseNewProjectItem,parseProjectItemPatch} from './src/lib/validation.ts';
      import {getWorkspaceReadonlySnapshot} from './src/lib/services/workspace-readonly.ts';
      import {validateWorkspaceSnapshot,readWorkspaceSnapshot} from './src/lib/workspace-readonly.ts';
      const idea=r.createProjectItem(parseNewProjectItem({projectId:1,title:'Possibility',status:'idea'}));
      assert.equal(idea.priority,null);assert.equal(idea.nextStep,null);assert.equal(idea.startedAt,null);
      assert.equal(r.getProject(1).ideaCount,1);assert.equal(r.listProjects()[0].toSolveCount,1);
      assert.equal(r.listProjectItems({status:'idea'})[0].id,idea.id);
      r.updateProjectItem(idea.id,parseProjectItemPatch({status:'to_solve'}));
      assert.equal(r.getProject(1).ideaCount,0);assert.equal(r.getProject(1).toSolveCount,2);
      const back=r.updateProjectItem(idea.id,parseProjectItemPatch({status:'idea'}));assert.deepEqual({...back,updatedAt:idea.updatedAt},idea);
      const legacy=r.getProjectItem(1);r.updateProjectItem(1,{status:'idea'});const restored=r.updateProjectItem(1,{status:'to_solve'});
      assert.deepEqual({...restored,updatedAt:legacy.updatedAt},legacy);
      const snapshot=await getWorkspaceReadonlySnapshot('a','projects');
      assert.equal(snapshot.data.projects[0].ideaCount,1);
      assert.equal((await readWorkspaceSnapshot(snapshot,'/api/project-items?status=idea').json())[0].id,idea.id);
      const bad=structuredClone(snapshot);bad.data.projects[0].ideaCount=2;assert.throws(()=>validateWorkspaceSnapshot(bad,'a','projects'));
      const old=structuredClone(snapshot);old.data.items=old.data.items.filter(i=>i.status!=='idea');delete old.data.projects[0].ideaCount;
      assert.equal(validateWorkspaceSnapshot(old,'a','projects').data.projects[0].ideaCount,0);
      assert.throws(()=>parseNewProjectItem({projectId:1,title:'Bad',status:'invented'}));
    `);
  } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
});

test("Postgres Ideas constraint migration is repeatable and preserves historical statuses and data", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;`);
    await db.exec(readFileSync("supabase/migrations/202608290007_projects.sql","utf8"));
    await db.exec(`insert into auth.users values('10000000-0000-4000-8000-000000000001');
      insert into projects(user_id,name) values('10000000-0000-4000-8000-000000000001','Legacy');
      insert into project_items(user_id,project_id,title,status,priority,next_step)
        select '10000000-0000-4000-8000-000000000001',1,'Legacy',s,'P1','Preserve' from unnest(array['to_solve','doing','blocked','done','verified','dropped']) s;`);
    const before = (await db.query("select * from project_items order by id")).rows;
    const migration = readFileSync("supabase/migrations/202611040001_project_item_ideas.sql","utf8");
    await db.exec(migration);await db.exec(migration);
    assert.deepEqual((await db.query("select * from project_items order by id")).rows,before);
    await db.exec("insert into project_items(user_id,project_id,title,status) values('10000000-0000-4000-8000-000000000001',1,'Possibility','idea')");
    await db.exec("update project_items set status='to_solve' where title='Possibility';update project_items set status='idea' where title='Possibility'");
    assert.equal((await db.query("select count(*)::int n from project_items where status='idea'")).rows[0].n,1);
    await assert.rejects(db.exec("update project_items set status='invalid'"),/check constraint/);
  } finally { await db.close(); }
});
