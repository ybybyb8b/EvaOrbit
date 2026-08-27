begin;

alter table public.food_library
  add column if not exists archived_at timestamptz;

create index if not exists idx_food_library_active
  on public.food_library(user_id, updated_at desc)
  where archived_at is null;

commit;
