-- Keep the old read surface empty until older deployments are replaced.
truncate table public.lucius_cases;
alter table public.lucius_cases add constraint lucius_cases_retired check (false);
drop function if exists public.record_lucius_case_recurrence(bigint, date);

delete from public.migration_import_ledger where resource = 'lucius_case';
alter table public.migration_import_ledger drop constraint migration_import_ledger_resource_check;
alter table public.migration_import_ledger add constraint migration_import_ledger_resource_check
  check (resource in ('memo', 'chronicle', 'lucius_diary'));
