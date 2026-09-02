begin;

alter table public.ui_preferences
  add column if not exists appearance_mode text not null default 'system',
  add column if not exists color_theme text not null default 'editorial';

alter table public.ui_preferences
  drop constraint if exists ui_preferences_appearance_mode_check,
  drop constraint if exists ui_preferences_color_theme_check;

alter table public.ui_preferences
  add constraint ui_preferences_appearance_mode_check check (appearance_mode in ('system', 'light', 'dark')),
  add constraint ui_preferences_color_theme_check check (color_theme in ('editorial', 'rosewood'));

commit;
