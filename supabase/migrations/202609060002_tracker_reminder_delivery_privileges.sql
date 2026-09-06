begin;

grant update (next_due_at) on table public.tracker_reminders to service_role;

commit;
