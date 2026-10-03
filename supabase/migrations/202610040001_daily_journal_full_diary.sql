ALTER TABLE public.daily_journal_entries
  ADD COLUMN IF NOT EXISTS has_full_diary boolean NOT NULL DEFAULT false;
