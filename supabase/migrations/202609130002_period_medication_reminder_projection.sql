begin;

alter table public.reminders drop constraint if exists reminders_target_type_check;
alter table public.reminders
  add constraint reminders_target_type_check
  check (target_type in ('cat','cat_household','tracker','health'));

create unique index if not exists idx_reminders_period_medication_projection
  on public.reminders(user_id,source_type,source_id)
  where source_type='period_medication';

commit;
