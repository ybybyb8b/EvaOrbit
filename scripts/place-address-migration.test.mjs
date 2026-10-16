import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("Place address migration preserves data and accepts merged legacy addresses on repeated application", {skip:!process.env.EVENTKIT_PGLITE_PATH}, async () => {
  const {PGlite}=await import(pathToFileURL(process.env.EVENTKIT_PGLITE_PATH).href);
  const db=new PGlite();
  try {
    await db.exec("create table public.food_places(id integer primary key,location text not null default '',address text not null default '' check(length(address)<=500)); insert into public.food_places values(1,'高新区','天府大道');");
    const migration=readFileSync("supabase/migrations/202610160004_food_place_address_capacity.sql","utf8");
    await db.exec(migration);await db.exec(migration);
    assert.deepEqual((await db.query("select * from food_places")).rows,[{id:1,location:"高新区",address:"天府大道"}]);
    const address="区".repeat(200)+" · "+"路".repeat(500);
    await db.query("update food_places set address=$1,location='' where id=1",[address]);
    assert.equal((await db.query("select address from food_places where id=1")).rows[0].address,address);
    await assert.rejects(()=>db.query("update food_places set address=$1 where id=1",["路".repeat(1001)]),/check constraint/);
  } finally {await db.close();}
});
