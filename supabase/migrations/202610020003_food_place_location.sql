begin;

alter table public.food_places
  add column city text not null default '' check (length(city) <= 100),
  add column location text not null default '' check (length(location) <= 200);

drop index public.idx_food_places_identity;
create unique index idx_food_places_identity on public.food_places
  (user_id,lower(name),lower(branch),lower(city),lower(location));

commit;
