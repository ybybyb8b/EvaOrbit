begin;

-- Existing brand text cannot identify a particular branch; retain it unchanged.
alter table public.drink_logs
  add column food_place_id bigint,
  add constraint drink_logs_food_place_owner_fk foreign key(food_place_id,user_id)
    references public.food_places(id,user_id) on delete restrict;

create index idx_drink_logs_place_occurred on public.drink_logs(user_id,food_place_id,occurred_at desc);

commit;
