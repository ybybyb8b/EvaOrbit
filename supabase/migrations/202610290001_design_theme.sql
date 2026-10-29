-- Design identity and Classic color palette are independent preferences.
ALTER TABLE public.ui_preferences
  ADD COLUMN IF NOT EXISTS design_theme text NOT NULL DEFAULT 'classic'
  CHECK (design_theme IN ('classic', 'vintage'));
