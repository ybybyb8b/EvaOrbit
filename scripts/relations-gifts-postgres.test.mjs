import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("Postgres preserves pre-migration items and enforces the subtotal of itemized gifts", async () => {
  const db = new PGlite();
  const account = "00000000-0000-4000-8000-000000000001";
  const migrate = name => db.exec(readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  const save = (id, body) => db.query("select save_relation_event($1, $2::jsonb) as id", [id, JSON.stringify(body)]);
  try {
    await db.exec(`create role authenticated; create schema auth; grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;`);
    await migrate("202608300001_relations");
    await db.exec(`select set_config('test.uid','${account}',false); set role authenticated;
      insert into relation_people(name) values('Friend'),('Another friend');`);
    const parties = [
      { key: "self", partyType: "self", personId: null, shareAmountMinor: null, paidAmountMinor: null },
      { key: "other", partyType: "person", personId: 1, shareAmountMinor: null, paidAmountMinor: null },
    ];
    const base = { eventType: "gift", title: "Occasion", occurredAt: "2026-11-20T04:00:00Z", occurredHasExplicitTime: false,
      currency: "CNY", totalAmountMinor: null, isInPerson: null, parties, items: [], flows: [] };
    const pricedFlow = { fromKey: "other", toKey: "self", flowType: "gift", amountMinor: 12000 };
    const oldGift = (await save(null,{ ...base, flows: [pricedFlow] })).rows[0].id;
    const oldExpense = (await save(null, { ...base,eventType:"expense",totalAmountMinor:500,
      parties: parties.map((party,index)=>({...party,shareAmountMinor:index?0:500,paidAmountMinor:index?0:500})),
      items:[{label:"Original",amountMinor:500,sortOrder:0}] })).rows[0].id;
    await db.exec("reset role");
    await migrate("202611200001_relation_gift_items");
    await migrate("202611200001_relation_gift_items");
    await db.exec("set role authenticated");
    assert.equal((await db.query("select gift_direction from relation_events where id=$1",[oldGift])).rows[0].gift_direction,null);
    assert.equal(Number((await db.query("select amount_minor from relation_event_items where event_id=$1",[oldExpense])).rows[0].amount_minor),500);
    const items = [{ label: "Book", amountMinor: 12000, sortOrder: 0 }, { label: "Tea", amountMinor: null, sortOrder: 1 }];
    const gift = { ...base, giftDirection: "in", items, flows: [pricedFlow] };
    const id = (await save(null,gift)).rows[0].id;
    assert.deepEqual((await db.query("select amount_minor from relation_event_items where event_id=$1 order by sort_order",[id])).rows.map(row=>row.amount_minor==null?null:Number(row.amount_minor)),[12000,null]);
    await assert.rejects(save(id,{...gift,giftDirection:"out"}), /Gift flow must match/);
    await assert.rejects(save(id,{...gift,flows:[]}), /Gift flow must match/);
    await assert.rejects(save(id,{...base,flows:[pricedFlow]}), /requires itemized gift input/);
    await save(id,{...gift,items:[items[1]],flows:[]});
    assert.equal((await db.query("select gift_direction from relation_events where id=$1",[id])).rows[0].gift_direction,"in");
    assert.equal((await db.query("select * from relation_event_flows where event_id=$1",[id])).rows.length,0);
    const twoPeople = [...parties,{...parties[1],key:"another",personId:2}];
    const sentFlow = {...pricedFlow,fromKey:"self",toKey:"other"};
    const sent = {...gift,giftDirection:"out",parties:twoPeople,flows:[sentFlow,{...sentFlow,toKey:"another"}]};
    const group = (await save(null,sent)).rows[0].id;
    assert.equal((await db.query("select count(*) as count from relation_event_items where event_id=$1",[group])).rows[0].count,2);
    assert.deepEqual((await db.query("select amount_minor from relation_event_flows where event_id=$1 order by id",[group])).rows.map(row=>Number(row.amount_minor)),[12000,12000]);
    await assert.rejects(save(group,{...sent,flows:[sentFlow,sentFlow]}), /Gift flow must match/);
    await assert.rejects(save(group,{...sent,giftDirection:"in"}), /needs one sender/);
  } finally {
    await db.close();
  }
});
