begin;

alter table public.notification_deliveries
  add column if not exists dedupe_key text;

alter table public.reminders
  add column if not exists repeat_while_overdue boolean not null default false;

alter table public.cat_routines
  add column if not exists repeat_while_overdue boolean not null default false;

create unique index if not exists idx_notification_delivery_dedupe
  on public.notification_deliveries(user_id,dedupe_key)
  where dedupe_key is not null;

commit;
