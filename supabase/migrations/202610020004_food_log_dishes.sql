begin;

alter table public.food_logs add column food_dish_ids bigint[] not null default '{}';
update public.food_logs set food_dish_ids = array[food_dish_id] where food_dish_id is not null;
create index idx_food_logs_dishes on public.food_logs using gin(food_dish_ids);

-- Keep older clients working while the array becomes the canonical association.
create function public.normalize_food_log_dishes() returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if cardinality(NEW.food_dish_ids)=0 and NEW.food_dish_id is not null then
      NEW.food_dish_ids := array[NEW.food_dish_id];
    end if;
  elsif NEW.food_dish_ids is not distinct from OLD.food_dish_ids and NEW.food_dish_id is distinct from OLD.food_dish_id then
    NEW.food_dish_ids := case when NEW.food_dish_id is null then '{}'::bigint[] else array[NEW.food_dish_id] end;
  end if;
  if cardinality(NEW.food_dish_ids)>50 or exists(select 1 from unnest(NEW.food_dish_ids) id where id is null or id<=0)
    or cardinality(NEW.food_dish_ids)<>(select count(distinct id) from unnest(NEW.food_dish_ids) id) then
    raise exception 'Invalid food dish IDs';
  end if;
  if exists(select 1 from unnest(NEW.food_dish_ids) as links(dish_id) where not exists(
    select 1 from public.food_dishes d where d.id=links.dish_id and d.user_id=NEW.user_id and d.food_place_id=NEW.food_place_id
  )) then raise exception 'Food dishes must belong to the selected place and owner'; end if;
  NEW.food_dish_id := NEW.food_dish_ids[1];
  return NEW;
end $$;
create trigger food_logs_normalize_dishes before insert or update of food_dish_ids,food_dish_id,food_place_id,user_id
  on public.food_logs for each row execute function public.normalize_food_log_dishes();

create function public.preserve_food_dish_links() returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP='DELETE' then
    update public.food_logs set food_dish_ids=array_remove(food_dish_ids,OLD.id) where food_dish_ids @> array[OLD.id];
    return OLD;
  end if;
  if exists(select 1 from public.food_logs fl where fl.food_dish_ids @> array[OLD.id]
    and (fl.food_place_id is distinct from NEW.food_place_id or fl.user_id is distinct from NEW.user_id)) then
    raise exception 'A referenced dish cannot move to another place';
  end if;
  return NEW;
end $$;
create trigger food_dishes_preserve_links before delete or update of food_place_id,user_id on public.food_dishes
  for each row execute function public.preserve_food_dish_links();

commit;
