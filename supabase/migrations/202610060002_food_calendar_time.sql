begin;
alter table public.food_logs add column if not exists calendar_time_enabled boolean not null default true;
commit;
