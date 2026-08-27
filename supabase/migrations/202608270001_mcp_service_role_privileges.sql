begin;

grant select on table
  public.food_logs,
  public.drink_logs,
  public.drink_limits,
  public.daily_nutrition_summaries,
  public.trackers,
  public.tracker_fields,
  public.tracker_entries,
  public.tracker_goals,
  public.tracker_reminders
to service_role;

grant insert on table
  public.food_logs,
  public.drink_logs,
  public.tracker_entries
to service_role;

grant update on table
  public.food_logs,
  public.drink_logs
to service_role;

grant usage on sequence
  public.food_logs_id_seq,
  public.drink_logs_id_seq,
  public.tracker_entries_id_seq
to service_role;

commit;
