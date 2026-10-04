begin;
alter table public.food_places
  add column kind text not null default 'restaurant' check(kind in ('restaurant','drink','retail','homemade','other')),
  add column scope text not null default 'branch' check(scope in ('brand','branch','virtual')),
  add column address text not null default '' check(length(address)<=500);
-- Preserve explicit location data rather than hiding existing drink branches.
update public.food_places set kind=case when service_type='drink' then 'drink' else 'restaurant' end,
  scope=case when service_type='drink' and branch='' and city='' and location='' then 'brand' else 'branch' end;
drop index public.idx_food_places_identity;
create unique index idx_food_places_identity on public.food_places(user_id,kind,scope,lower(name),lower(branch),lower(city),lower(location),lower(address));
alter table public.food_logs add column food_library_id bigint,
  add constraint food_logs_library_owner_fk foreign key(food_library_id,user_id) references public.food_library(id,user_id) on delete restrict;
create index idx_food_logs_library on public.food_logs(user_id,food_library_id);
create view public.food_place_library_usage with(security_invoker=true) as
  select user_id,food_place_id,food_library_id,count(*)::integer as record_count,max(occurred_at) as last_recorded_at
  from (
    select user_id,food_place_id,food_library_id,occurred_at from public.food_logs where food_place_id is not null and food_library_id is not null
    union all
    select user_id,food_place_id,food_library_id,occurred_at from public.drink_logs where food_place_id is not null and food_library_id is not null
  ) records group by user_id,food_place_id,food_library_id;
revoke all on public.food_place_library_usage from anon;
grant select on public.food_place_library_usage to authenticated,service_role;
-- Aggregate before PostgREST row limits; frequency remains exact for long histories.
create view public.food_place_record_usage with(security_invoker=true) as
  select user_id,food_place_id,count(*)::integer as visit_count,
    count(*) filter(where record_kind='food')::integer as food_visit_count,
    count(*) filter(where record_kind='drink')::integer as drink_visit_count,max(occurred_at) as last_visited_at
  from (
    select user_id,food_place_id,occurred_at,'food' as record_kind from public.food_logs where food_place_id is not null
    union all
    select user_id,food_place_id,occurred_at,'drink' as record_kind from public.drink_logs where food_place_id is not null
  ) records group by user_id,food_place_id;
revoke all on public.food_place_record_usage from anon;
grant select on public.food_place_record_usage to authenticated,service_role;
commit;
