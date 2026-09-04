begin;

alter table public.ui_preferences
  add column if not exists chinese_font text not null default 'canger',
  add column if not exists english_font text not null default 'zen';

alter table public.ui_preferences
  add constraint ui_preferences_chinese_font_check check (chinese_font in ('canger', 'lxgw', 'alimama', 'ibm')),
  add constraint ui_preferences_english_font_check check (english_font in ('zen', 'ibm', 'polyamine', 'cormorant'));

commit;
