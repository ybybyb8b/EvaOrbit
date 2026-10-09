begin;
alter table public.food_library add column food_place_id bigint,
  add constraint food_library_place_owner_fk foreign key (food_place_id,user_id) references public.food_places(id,user_id) on delete restrict;
alter table public.food_dishes add column food_library_id bigint,
  add constraint food_dishes_library_owner_fk foreign key (food_library_id,user_id) references public.food_library(id,user_id) on delete restrict;
create index idx_food_library_owner_place on public.food_library(user_id,food_place_id);
create index idx_food_dishes_library on public.food_dishes(user_id,food_library_id);
create function public.check_food_catalog_owner() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='food_dishes' then
    if exists(select 1 from food_library f where f.id=new.food_library_id and f.user_id=new.user_id and f.food_place_id is not null and f.food_place_id<>new.food_place_id) then
      raise exception '物品只能归属一个店铺';
    end if;
  elsif new.food_place_id is not null and exists(select 1 from food_dishes d where d.food_library_id=new.id and d.user_id=new.user_id and d.food_place_id<>new.food_place_id) then
    raise exception '请先解除其他店铺的菜单营养关联';
  end if;
  return new;
end;
$$;
create trigger food_dishes_catalog_owner before insert or update of food_place_id,food_library_id on public.food_dishes for each row execute function public.check_food_catalog_owner();
create trigger food_library_catalog_owner before update of food_place_id on public.food_library for each row execute function public.check_food_catalog_owner();
-- Historical purchases are occurrences, not proof of exclusive catalog ownership.
-- Keep old record links; assign catalog ownership explicitly instead of guessing.
commit;
