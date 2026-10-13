begin;
alter table public.ui_preferences add column if not exists life_day_start text not null default '06:00'
  check (life_day_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
commit;
