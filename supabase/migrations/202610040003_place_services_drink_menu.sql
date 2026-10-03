begin;
alter table public.food_places add column service_type text not null default 'food' check(service_type in ('food','drink','both'));
alter table public.food_dishes add column kind text not null default 'food' check(kind in ('food','drink'));
drop index public.idx_food_dishes_identity;
create unique index idx_food_dishes_identity on public.food_dishes(user_id,food_place_id,kind,lower(name));
alter table public.drink_logs add column drink_menu_id bigint,
  add constraint drink_logs_menu_owner_fk foreign key(drink_menu_id,user_id) references public.food_dishes(id,user_id) on delete restrict;
create index idx_drink_logs_menu on public.drink_logs(user_id,drink_menu_id);
-- Infer only from explicit historical associations, never from brand or category text.
update public.food_places p set service_type=case when exists(select 1 from public.food_logs l where l.food_place_id=p.id)
  or exists(select 1 from public.food_dishes d where d.food_place_id=p.id) then 'both' else 'drink' end
where exists(select 1 from public.drink_logs l where l.food_place_id=p.id);
commit;
