begin;

-- A Food log is a meal. The singular place is optional context/legacy primary;
-- dish owners and immutable product snapshots contribute additional sources.
alter table public.food_logs add column if not exists food_place_ids bigint[] not null default '{}';
create index if not exists idx_food_logs_places on public.food_logs using gin(food_place_ids);

create or replace function public.normalize_food_log_dishes() returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='INSERT' then
    if cardinality(NEW.food_dish_ids)=0 and NEW.food_dish_id is not null then NEW.food_dish_ids:=array[NEW.food_dish_id]; end if;
  elsif NEW.food_dish_ids is not distinct from OLD.food_dish_ids and NEW.food_dish_id is distinct from OLD.food_dish_id then
    NEW.food_dish_ids:=case when NEW.food_dish_id is null then '{}'::bigint[] else array[NEW.food_dish_id] end;
  end if;
  if cardinality(NEW.food_dish_ids)>50 or exists(select 1 from unnest(NEW.food_dish_ids) id where id is null or id<=0)
    or cardinality(NEW.food_dish_ids)<>(select count(distinct id) from unnest(NEW.food_dish_ids) id) then raise exception 'Invalid food dish IDs'; end if;
  if exists(select 1 from unnest(NEW.food_dish_ids) links(id) where not exists(select 1 from public.food_dishes d where d.id=links.id and d.user_id=NEW.user_id and d.kind='food')) then
    raise exception 'Food dishes must be food-kind and owned by the current user';
  end if;
  NEW.food_dish_id:=NEW.food_dish_ids[1]; return NEW;
end $$;

create or replace function public.preserve_food_dish_links() returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='DELETE' then
    update public.food_logs set food_dish_ids=array_remove(food_dish_ids,OLD.id) where food_dish_ids @> array[OLD.id]; return OLD;
  end if;
  if (NEW.food_place_id is distinct from OLD.food_place_id or NEW.user_id is distinct from OLD.user_id)
    and exists(select 1 from public.food_logs f where f.food_dish_ids @> array[OLD.id]) then raise exception 'A referenced dish cannot move to another place'; end if;
  return NEW;
end $$;

create or replace function public.normalize_food_meal_sources() returns trigger language plpgsql set search_path=public as $$
begin
  select coalesce(array_agg(source_id order by source_id),'{}'::bigint[]) into NEW.food_place_ids from (
    select NEW.food_place_id as source_id where NEW.food_place_id is not null
    union select d.food_place_id from public.food_dishes d where d.user_id=NEW.user_id and d.id=any(NEW.food_dish_ids)
    union select (s.item->'item'->>'foodPlaceId')::bigint from jsonb_array_elements(NEW.food_library_items) s(item) where s.item->'item'->>'foodPlaceId' is not null
  ) sources;
  if exists(select 1 from unnest(NEW.food_place_ids) s(id) where not exists(select 1 from public.food_places p where p.id=s.id and p.user_id=NEW.user_id)) then raise exception 'Invalid Food source owner'; end if;
  return NEW;
end $$;
drop trigger if exists food_logs_normalize_sources on public.food_logs;
create trigger food_logs_normalize_sources before insert or update of food_place_id,food_dish_ids,food_dish_id,food_library_items,food_place_ids,user_id
  on public.food_logs for each row execute function public.normalize_food_meal_sources();
do $$
begin
  if exists(select 1 from pg_trigger where tgrelid='public.food_logs'::regclass and tgname='food_logs_set_updated_at' and tgenabled='O') then
    alter table public.food_logs disable trigger food_logs_set_updated_at;
    update public.food_logs set food_place_ids=food_place_ids;
    alter table public.food_logs enable trigger food_logs_set_updated_at;
  else update public.food_logs set food_place_ids=food_place_ids;
  end if;
end $$;

create or replace view public.food_place_record_usage with(security_invoker=true) as
  select user_id,food_place_id,count(*)::integer as visit_count,
    count(*) filter(where record_kind='food')::integer as food_visit_count,
    count(*) filter(where record_kind='drink')::integer as drink_visit_count,max(occurred_at) as last_visited_at
  from (
    select f.user_id,p.id as food_place_id,f.occurred_at,'food' as record_kind from public.food_logs f cross join lateral unnest(f.food_place_ids) p(id)
    union all select user_id,food_place_id,occurred_at,'drink' from public.drink_logs where food_place_id is not null
  ) records group by user_id,food_place_id;

create or replace view public.food_place_library_usage with(security_invoker=true) as
  select user_id,food_place_id,food_library_id,count(*)::integer as record_count,max(occurred_at) as last_recorded_at
  from (
    select f.user_id,coalesce((s.item->'item'->>'foodPlaceId')::bigint,f.food_place_id) as food_place_id,(s.item->>'foodLibraryId')::bigint as food_library_id,f.occurred_at
    from public.food_logs f cross join lateral jsonb_array_elements(f.food_library_items) s(item)
    union all select user_id,food_place_id,food_library_id,occurred_at from public.food_logs where food_library_id is not null and jsonb_array_length(food_library_items)=0
    union all select user_id,food_place_id,food_library_id,occurred_at from public.drink_logs where food_library_id is not null
  ) records where food_place_id is not null group by user_id,food_place_id,food_library_id;

revoke all on public.food_place_record_usage,public.food_place_library_usage from anon;
grant select on public.food_place_record_usage,public.food_place_library_usage to authenticated,service_role;
notify pgrst, 'reload schema';
commit;
