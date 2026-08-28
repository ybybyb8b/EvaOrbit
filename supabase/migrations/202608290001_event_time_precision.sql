begin;

alter table public.cat_events
  add column if not exists occurred_has_explicit_time boolean not null default true;
alter table public.cat_symptoms
  add column if not exists occurred_has_explicit_time boolean not null default true;
alter table public.vet_visits
  add column if not exists occurred_has_explicit_time boolean not null default true;
alter table public.cat_measurements
  add column if not exists occurred_has_explicit_time boolean not null default true;
alter table public.cat_medications
  add column if not exists started_has_explicit_time boolean not null default true,
  add column if not exists ended_has_explicit_time boolean not null default true;

alter table public.health_records
  add column if not exists occurred_has_explicit_time boolean not null default true,
  add column if not exists started_has_explicit_time boolean not null default true,
  add column if not exists ended_has_explicit_time boolean not null default true;

alter table public.reminders
  add column if not exists due_has_explicit_time boolean not null default true;
alter table public.notification_deliveries
  add column if not exists scheduled_has_explicit_time boolean not null default true;

commit;
