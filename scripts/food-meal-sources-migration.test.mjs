import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import test from "node:test";

test("meal source migration preserves legacy records, enforces owners and aggregates each source once",{skip:!process.env.EVENTKIT_PGLITE_PATH},async()=>{
  const {PGlite}=await import(pathToFileURL(process.env.EVENTKIT_PGLITE_PATH).href);
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table food_places(id bigint primary key,user_id text);
      create table food_dishes(id bigint primary key,user_id text,food_place_id bigint,food_library_id bigint,kind text default 'food');
      create table food_logs(id bigint primary key,user_id text,food_place_id bigint,food_dish_id bigint,food_library_id bigint,food_library_items jsonb default '[]',occurred_at timestamptz default now(),updated_at timestamptz default '2020-01-01');
      create table drink_logs(id bigint primary key,user_id text,food_place_id bigint,food_library_id bigint,occurred_at timestamptz default now());
      create function touch_meal() returns trigger language plpgsql as $$ begin NEW.updated_at=now();return NEW;end $$;
      create trigger food_logs_set_updated_at before update on food_logs for each row execute function touch_meal();
      insert into food_places values(1,'a'),(2,'a'),(3,'a'),(4,'other');
      insert into food_dishes(id,user_id,food_place_id,kind) values(10,'a',1,'food'),(11,'a',1,'food'),(12,'a',2,'food'),(13,'other',4,'food'),(14,'a',1,'drink');
      insert into food_logs(id,user_id,food_place_id,food_dish_id) values(1,'a',1,10);
    `);
    await db.exec(readFileSync("supabase/migrations/202610020004_food_log_dishes.sql","utf8"));
    const before=(await db.query("select updated_at from food_logs where id=1")).rows[0].updated_at;
    const migration=readFileSync("supabase/migrations/202610170001_food_meal_sources.sql","utf8");
    await db.exec(migration);await db.exec(migration);
    assert.deepEqual((await db.query("select food_place_ids from food_logs where id=1")).rows[0].food_place_ids,[1]);
    assert.equal((await db.query("select updated_at from food_logs where id=1")).rows[0].updated_at.toISOString(),before.toISOString());
    await db.exec(`insert into food_logs(id,user_id,food_dish_ids,food_library_items) values(2,'a',array[10,11,12],'[{"foodLibraryId":20,"item":{"foodPlaceId":3}}]');`);
    assert.deepEqual((await db.query("select food_place_ids from food_logs where id=2")).rows[0].food_place_ids,[1,2,3]);
    assert.deepEqual((await db.query("select food_place_id,food_visit_count from food_place_record_usage order by food_place_id")).rows,[{food_place_id:1,food_visit_count:2},{food_place_id:2,food_visit_count:1},{food_place_id:3,food_visit_count:1}]);
    assert.deepEqual((await db.query("select food_place_id,food_library_id,record_count from food_place_library_usage")).rows,[{food_place_id:3,food_library_id:20,record_count:1}]);
    await db.exec("update food_dishes set food_place_id=2 where id=12");
    await assert.rejects(()=>db.exec("update food_dishes set food_place_id=1 where id=12"),/cannot move/);
    await assert.rejects(()=>db.exec("insert into food_logs(id,user_id,food_dish_ids) values(3,'a',array[13])"),/owned/);
    await assert.rejects(()=>db.exec("insert into food_logs(id,user_id,food_dish_ids) values(3,'a',array[14])"),/food-kind/);
    await assert.rejects(()=>db.exec(`update food_logs set food_library_items='[{"foodLibraryId":20,"item":{"foodPlaceId":4}}]' where id=2`),/source owner/);
    await db.exec("delete from food_dishes where id=12");
    assert.deepEqual((await db.query("select food_place_ids from food_logs where id=2")).rows[0].food_place_ids,[1,3]);
    await db.exec("update food_logs set food_library_items='[]',food_dish_ids='{}' where id=2");
    assert.deepEqual((await db.query("select food_place_ids from food_logs where id=2")).rows[0].food_place_ids,[]);
    assert.equal((await db.query("select reloptions from pg_class where relname='food_place_record_usage'")).rows[0].reloptions.includes("security_invoker=true"),true);
  }finally{await db.close();}
});
