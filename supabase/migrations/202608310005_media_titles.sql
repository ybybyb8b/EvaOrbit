begin;

alter table public.media_items
  add column if not exists original_title text,
  add column if not exists translated_title text;

do $$ begin
  alter table public.media_items add constraint media_items_original_title_check
    check (original_title is null or char_length(trim(original_title)) between 1 and 300);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.media_items add constraint media_items_translated_title_check
    check (translated_title is null or char_length(trim(translated_title)) between 1 and 300);
exception when duplicate_object then null; end $$;

create index if not exists idx_media_items_user_original_title on public.media_items(user_id, original_title);
create index if not exists idx_media_items_user_translated_title on public.media_items(user_id, translated_title);

commit;
