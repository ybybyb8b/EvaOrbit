ALTER TABLE public.drink_logs
  ADD COLUMN IF NOT EXISTS drink_kcal_mode text CHECK (drink_kcal_mode IN ('auto', 'serving', 'manual')),
  ADD COLUMN IF NOT EXISTS custom_name text CHECK (char_length(custom_name) <= 200);
