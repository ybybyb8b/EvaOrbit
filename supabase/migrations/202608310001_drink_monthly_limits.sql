begin;

alter table public.drink_limits
  drop constraint if exists drink_limits_period_check;

alter table public.drink_limits
  add constraint drink_limits_period_check check (period in ('daily','weekly','monthly'));

commit;
