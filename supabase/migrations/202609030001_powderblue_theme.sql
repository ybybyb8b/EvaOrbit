begin;

alter table public.ui_preferences
  drop constraint if exists ui_preferences_color_theme_check;

alter table public.ui_preferences
  add constraint ui_preferences_color_theme_check
  check (color_theme in ('editorial', 'rosewood', 'powderblue'));

commit;
