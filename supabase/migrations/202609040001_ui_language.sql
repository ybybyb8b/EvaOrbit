begin;

alter table public.ui_preferences
  add column if not exists ui_language text not null default 'zh-CN';

alter table public.ui_preferences
  drop constraint if exists ui_preferences_ui_language_check;

alter table public.ui_preferences
  add constraint ui_preferences_ui_language_check check (ui_language in ('zh-CN', 'en'));

commit;
