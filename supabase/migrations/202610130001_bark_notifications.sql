begin;
create table if not exists public.bark_notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  updated_at timestamptz not null default now()
);
alter table public.bark_notification_settings enable row level security;
drop policy if exists bark_settings_owner_all on public.bark_notification_settings;
create policy bark_settings_owner_all on public.bark_notification_settings for all
using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update,delete on public.bark_notification_settings to authenticated;
grant select on public.bark_notification_settings to service_role;
commit;
