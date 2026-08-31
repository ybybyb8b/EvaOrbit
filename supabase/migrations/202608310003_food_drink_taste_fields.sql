begin;

alter table public.food_logs
  add column if not exists rating text
  check (rating is null or rating in ('love','good','neutral','dislike'));

alter table public.drink_logs
  add column if not exists occurred_has_explicit_time boolean not null default true,
  add column if not exists temperature text
    check (temperature is null or temperature in ('normal_ice','less_ice','no_ice','room_temperature','hot')),
  add column if not exists rating text
    check (rating is null or rating in ('love','good','neutral','dislike'));

commit;
