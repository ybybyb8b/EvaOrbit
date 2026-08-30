begin;

-- Drink records remain owned by public.drink_logs. Any unexpected legacy
-- linked Tracker is retained as an independent Tracker without deleting data.
update public.trackers
set data_source_type = 'native_tracker', source_config = '{}'::jsonb
where data_source_type <> 'native_tracker' or source_config <> '{}'::jsonb;

alter table public.trackers
  drop column source_config,
  drop column data_source_type;

commit;
