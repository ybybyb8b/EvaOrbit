alter table public.ui_preferences add column if not exists calendar_interpretation jsonb not null default '{"revision":0,"categories":[{"id":"sleep","name":"睡眠","kind":"sleep"},{"id":"phone","name":"手机使用","kind":"activity"},{"id":"screen","name":"电视电影","kind":"activity"},{"id":"gaming","name":"游戏","kind":"activity"}],"rules":[{"id":"sleep","prefix":"😴","categoryId":"sleep","enabled":true,"includeInSummary":false},{"id":"phone","prefix":"🍠","categoryId":"phone","enabled":true,"includeInSummary":true},{"id":"screen","prefix":"📺","categoryId":"screen","enabled":true,"includeInSummary":true},{"id":"gaming","prefix":"🎮","categoryId":"gaming","enabled":true,"includeInSummary":true}]}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ui_preferences'::regclass and conname = 'ui_preferences_calendar_interpretation_object') then
    alter table public.ui_preferences add constraint ui_preferences_calendar_interpretation_object check (jsonb_typeof(calendar_interpretation) = 'object');
  end if;
end $$;
