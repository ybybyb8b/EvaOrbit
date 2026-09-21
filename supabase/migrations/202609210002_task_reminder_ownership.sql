begin;

alter table public.tasks add constraint tasks_id_user_id_key unique (id, user_id);
alter table public.task_reminders drop constraint if exists task_reminders_task_id_fkey;
alter table public.task_reminders add constraint task_reminders_task_owner_fkey
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade;

commit;
