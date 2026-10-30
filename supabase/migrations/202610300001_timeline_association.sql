-- Account-owned display preferences; existing ui_preferences RLS applies.
ALTER TABLE public.ui_preferences ADD COLUMN IF NOT EXISTS timeline_association jsonb NOT NULL
  DEFAULT '{"schemaVersion":1,"revision":0,"rules":[]}'::jsonb
  CHECK (jsonb_typeof(timeline_association) = 'object');
