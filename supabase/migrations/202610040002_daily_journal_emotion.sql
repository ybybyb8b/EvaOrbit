ALTER TABLE public.daily_journal_entries
  ADD COLUMN IF NOT EXISTS emotion text
  CHECK(emotion IN ('happy','excited','relaxed','grateful','neutral','low','sad','irritated','angry','anxious','lonely','surprised'));
