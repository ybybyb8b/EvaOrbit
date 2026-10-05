begin;

alter table public.food_logs
  add column if not exists food_library_items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(food_library_items) = 'array'),
  add column if not exists food_kcal_mode text not null default 'manual'
    check (food_kcal_mode in ('auto', 'manual'));

-- Snapshots deliberately retain item identity and nutrition after library changes.
-- Existing owner RLS on food_logs also covers these fields.
create or replace view public.food_place_library_usage with (security_invoker=true) as
  select user_id,food_place_id,food_library_id,count(*)::integer as record_count,max(occurred_at) as last_recorded_at
  from (
    select f.user_id,f.food_place_id,(s.item->>'foodLibraryId')::bigint as food_library_id,f.occurred_at
    from public.food_logs f cross join lateral jsonb_array_elements(f.food_library_items) as s(item)
    where f.food_place_id is not null
    union all
    select user_id,food_place_id,food_library_id,occurred_at from public.food_logs
    where food_place_id is not null and food_library_id is not null and jsonb_array_length(food_library_items)=0
    union all
    select user_id,food_place_id,food_library_id,occurred_at from public.drink_logs
    where food_place_id is not null and food_library_id is not null
  ) records group by user_id,food_place_id,food_library_id;

commit;
