begin;
alter table public.bark_notification_settings
  add column if not exists open_in_host boolean not null default false;
commit;
