alter table public.daily_journal_entries
  add column if not exists energy_level smallint
  check (energy_level between 1 and 3);
