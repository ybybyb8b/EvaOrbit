begin;

alter table public.tasks add column if not exists due_time time;
alter table public.tasks add column if not exists reminder_id bigint references public.reminders(id) on delete set null;
create unique index if not exists idx_tasks_reminder_id on public.tasks(reminder_id) where reminder_id is not null;
create unique index if not exists idx_task_owned_reminder on public.reminders(user_id,source_type,source_id) where source_type='task_due';

alter table public.reminders drop constraint if exists reminders_target_type_check;
alter table public.reminders add constraint reminders_target_type_check check (target_type in ('cat','cat_household','tracker','health','subscription','task'));
alter table public.notification_deliveries drop constraint if exists notification_deliveries_target_type_check;
alter table public.notification_deliveries add constraint notification_deliveries_target_type_check check (target_type in ('cat','cat_household','tracker','food','health','subscription','task'));

commit;
