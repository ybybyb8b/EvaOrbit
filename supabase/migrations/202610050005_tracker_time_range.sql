begin;
-- Additive field type; existing field keys, JSON values and point records stay intact.
alter table public.tracker_fields drop constraint if exists tracker_fields_type_check;
alter table public.tracker_fields add constraint tracker_fields_type_check
  check (type in ('number','single_select','multi_select','text','boolean','rating','time_range'));
commit;
