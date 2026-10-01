alter table public.reminders
  add column if not exists delivery_channel text not null default 'pwa'
  check (delivery_channel in ('pwa','apple_reminders'));
